import type { Mode } from "./permissions";
import type { StorySnapshot, IncidentPhases } from "../story/snapshot";
import { daysBetween, formatDate, money } from "./format";
import type {
  AgentView,
  CheckView,
  ImpactRow,
  IncidentView,
  MemoryEntryView,
  MemoryView,
  PlanStepView,
  PlanView,
  ProofView,
  Treatment,
} from "./types";

/* Plain-language dictionaries for the sandbox recovery registry and its invariants. */
const CAPABILITY: Record<
  string,
  { title: (po: string) => string; why: string; kind: PlanStepView["kind"]; authority: string }
> = {
  "sandbox.receiving.cancel.v1": {
    title: (po) => `Cancel the receiving allocation for ${po}`,
    why: "Receiving was scheduled for an order that should not exist.",
    kind: "Compensates",
    authority: "Cancel receiving allocations",
  },
  "sandbox.finance.revoke.v1": {
    title: (po) => `Revoke the finance approval for ${po}`,
    why: "Finance approved an order from a supplier that was no longer eligible.",
    kind: "Compensates",
    authority: "Revoke finance approvals",
  },
  "sandbox.po.cancel.v1": {
    title: (po) => `Cancel purchase order ${po}`,
    why: "Procurement selected a supplier that was no longer eligible.",
    kind: "Reverses",
    authority: "Cancel open purchase orders",
  },
  "sandbox.notification.remediate.v1": {
    title: () => "Open a corrective compliance case for the supplier notification",
    why: "The supplier was already told. That cannot be taken back, so Brindle opens a corrective case instead.",
    kind: "Corrective case",
    authority: "Record corrective compliance escalations",
  },
};

const CHECK_TITLE: Record<string, string> = {
  "prohibited-vendor-open-pos":
    "No open purchase order remains with the supplier that is no longer eligible",
  "invalid-po-finance-approvals":
    "No active finance approval remains on the invalid purchase order",
  "invalid-po-receiving-allocations":
    "No active receiving allocation remains on the invalid purchase order",
  "irreversible-consequences-handled": "Everything that cannot be undone has a corrective path",
  "unrelated-control-preserved": "Unrelated work is exactly as it was",
  "no-duplicate-compensation": "Nothing was undone twice",
};

const AGENT_NAME: Record<string, string> = {
  procurement: "Procurement agent",
  finance: "Finance agent",
  operations: "Operations agent",
};

type Raw = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- engine snapshot is validated JSON at the boundary

const ownerOf = (refId: string): string =>
  refId.startsWith("fin-apr:")
    ? "finance"
    : refId.startsWith("rcv:") || refId.startsWith("notif:")
      ? "operations"
      : "procurement";

function decisionSentences(a: Raw, supplier: string) {
  const action = a.originalAction;
  const po = action.parameters.poId as string;
  let decided = `Took action on ${po}`;
  if (action.actionType === "SELECT_SUPPLIER") decided = `Selected ${supplier} for ${po}`;
  if (action.actionType === "APPROVE_PO")
    decided = `Approved ${po} (${money(Number(action.parameters.approvedAmountCents), String(action.parameters.currency))})`;
  if (action.actionType === "SCHEDULE_RECEIVING") decided = `Scheduled receiving for ${po}`;
  let would = "Would have made the same decision";
  const r = a.assessment.result as string;
  if (r === "CHANGED") {
    const cf = a.assessment.counterfactualAction?.actionType as string | undefined;
    would =
      cf === "DECLINE_SUPPLIER"
        ? `Would have declined ${supplier}`
        : cf === "REJECT_PO"
          ? `Would have rejected ${po}`
          : cf === "HOLD_RECEIVING"
            ? `Would have held receiving for ${po}`
            : "Would have decided differently";
  }
  if (r === "UNCERTAIN") would = "Brindle could not tell what it would have done";
  return { decided, would };
}

function treatmentOfConsequence(t: string): Treatment {
  if (t === "M4_ANALYSIS") return "NEEDS_RECOVERY";
  if (t === "PRESERVE") return "PRESERVED";
  return "NEEDS_HUMAN_REVIEW";
}

function planFrom(recovery: Raw, planned: Raw, po: string, done: boolean): PlanView | null {
  const steps: Raw[] = recovery?.steps ?? [];
  if (!steps.length) return null;
  const views: PlanStepView[] = steps.map((s, i) => {
    const dict = CAPABILITY[s.capabilityId as string];
    const irreversible = s.effectClassification === "IRREVERSIBLE";
    return {
      order: i + 1,
      title: dict ? dict.title(po) : `Run ${s.capabilityId}`,
      why: dict?.why ?? "Registered recovery step.",
      kind: dict?.kind ?? "Compensates",
      cannotBeUndone: irreversible,
      authority: dict?.authority ?? String(s.capabilityId),
      status: done ? (s.status === "SUCCEEDED" ? "DONE" : "FAILED") : "PLANNED",
      technical: {
        capabilityId: s.capabilityId,
        mode: s.mode,
        effectClassification: s.effectClassification,
        idempotencyKey: s.idempotencyKey,
        targetId: s.parameters?.targetId,
      },
    };
  });
  return {
    steps: views,
    willNotChange: [
      "PO-901 and every other unrelated purchase order",
      "The original decision records. History is kept, not edited.",
      "The Operations agent's own judgment (it would have acted the same)",
    ],
    cannotBeUndone: views.filter((v) => v.cannotBeUndone).map((v) => v.title),
    authorityRequired: [...new Set(views.map((v) => v.authority))],
    expectedResult: `${po} is cancelled, its approval and receiving are withdrawn, a corrective case covers what cannot be undone, and an independent check confirms the business is consistent again.`,
    registered: true,
  };
}

function proofFrom(
  proof: Raw,
  supplier: string,
  po: string,
  change: IncidentView["change"],
): ProofView | null {
  const r = proof?.receipt;
  if (!r) return null;
  const checks: CheckView[] = r.invariantResults.map((c: Raw) => ({
    title: CHECK_TITLE[c.invariantId] ?? c.invariantId,
    status: c.status,
    technical: {
      invariantId: c.invariantId,
      source: c.observation?.source,
      observedAt: c.observation?.observedAt,
      detail: c.detail,
    },
  }));
  const outcomes = r.effectOutcomes as Raw[];
  const label = (id: string) =>
    id.includes("receiving")
      ? `Receiving allocation for ${po}`
      : id.includes("finance")
        ? `Finance approval for ${po}`
        : id.includes("notification")
          ? `Supplier notification for ${po}`
          : `Purchase order ${po}`;
  return {
    receiptId: r.receiptId,
    verdict: r.verdict,
    verdictLabel:
      r.verdict === "RECOVERED"
        ? "Recovery is proven"
        : r.verdict === "ESCALATED"
          ? "Escalated to a person"
          : "Recovery is incomplete",
    issuedAt: r.issuedAt,
    whatChanged: `${supplier}'s ${change.fact} changed from ${change.from} to ${change.to}, effective ${formatDate(change.effectiveFrom)}.`,
    affected: outcomes.map((o) => label(o.effectId)),
    preserved: [
      ...(r.decisions.preserved as string[]).map((d) =>
        d.includes("PO-901")
          ? `Unrelated: ${d.replace("dec:", "").replace(":", " · ")}`
          : `Judgment kept: ${d.replace("dec:", "").replace(":", " · ")}`,
      ),
    ],
    brindleChanged: outcomes
      .filter((o) => o.outcome !== "REMEDIATED")
      .map((o) => ({
        text: label(o.effectId),
        outcome:
          o.outcome === "REVERSED"
            ? ("Reversed" as const)
            : o.outcome === "COMPENSATED"
              ? ("Compensated" as const)
              : ("Unresolved" as const),
      })),
    stillIrreversible: outcomes
      .filter((o) => o.classification === "IRREVERSIBLE")
      .map((o) => ({
        text: label(o.effectId),
        handling: "Corrective compliance case opened. The original record stays as history.",
        owner: "Compliance",
        status: "Open",
      })),
    checks,
    receiptJson: r,
  };
}

function memoryFrom(story: StorySnapshot, p: IncidentPhases): MemoryView {
  const adv = p.memoryBeforePlanning as Raw;
  const hits = (adv.matches as Raw[]).map((m) => {
    const prior = story.incidents.find((i) => i.incidentId === m.experience.incidentId);
    return {
      incidentId: m.experience.incidentId as string,
      title: `${prior?.supplierName ?? "Earlier"} certification incident`,
      relevancePct: Math.round(Number(m.relevance) * 100),
      why: "Same kind of change (an ISO-9001 certification revoked) with the same kinds of consequences.",
      pattern: (m.experience.successfulCapabilities as string[]).map(
        (c) => CAPABILITY[c]?.title("the purchase order") ?? c,
      ),
      warnings: m.warnings as string[],
      recoveredAt: story.computedAt,
    };
  });
  return {
    consultedBeforePlanning: true,
    hits,
    note: hits.length
      ? "Advice only. Memory never grants authority: the plan below still comes from the capability registry, and every check still runs fresh."
      : "No earlier verified recovery matches yet. This is the first of its kind Brindle has proven.",
  };
}

export interface DemoContext {
  mode: Mode;
  /** Has a person approved Incident B's recovery in Approval Mode? */
  approvedB: boolean;
}

/** Which phase of an incident is visible given the workspace mode and approval state. */
export function demoStage(key: "A" | "B", ctx: DemoContext): "planned" | "recovered" {
  if (key === "A") return "recovered";
  return ctx.mode === "BOUNDED_AUTONOMOUS" || ctx.approvedB ? "recovered" : "planned";
}

export function buildDemoIncident(
  story: StorySnapshot,
  key: "A" | "B",
  ctx: DemoContext,
): IncidentView {
  const p = story.incidents.find((i) => i.key === key)!;
  const stage = demoStage(key, ctx);
  const done = stage === "recovered";
  const po = p.scenario.poId;
  const supplier = p.supplierName;
  const rev = p.opened.temporal.revision;
  const truth = p.opened.temporal.truth as Raw[];
  const change: IncidentView["change"] = {
    subject: supplier,
    fact: "ISO-9001 certification",
    from: String(truth[0]?.value?.status ?? "VALID").toLowerCase(),
    to: String(truth[1]?.value?.status ?? "REVOKED").toLowerCase(),
    effectiveFrom: rev.effectiveFrom,
    observedAt: rev.observedAt,
    retroactive: Boolean(rev.retroactive),
    lagDays: daysBetween(rev.effectiveFrom, rev.observedAt),
  };

  const assessments = p.opened.materiality.assessments as Raw[];
  const consequences = p.opened.materiality.consequences as Raw[];
  const objects = consequences.filter((c) => c.kind === "BUSINESS_OBJECT");
  const impact: ImpactRow[] = assessments.map((a) => {
    const suffix = String(a.assessment.decisionId).split(":").pop()!;
    const s = decisionSentences(a, supplier);
    const result = a.assessment.result as string;
    const treatment: Treatment =
      result === "CHANGED"
        ? "NEEDS_RECOVERY"
        : result === "SAME"
          ? "PRESERVED"
          : "NEEDS_HUMAN_REVIEW";
    const own = objects.filter((o) => ownerOf(String(o.ref_id)) === suffix);
    return {
      id: a.assessment.decisionId,
      agent: AGENT_NAME[suffix] ?? suffix,
      decision: s.decided,
      counterfactual: s.would,
      treatment,
      reason:
        result === "CHANGED"
          ? `With the corrected certification, ${suffix === "procurement" ? "the supplier was no longer eligible" : "the approval no longer held"}.`
          : result === "SAME"
            ? "Its own judgment holds. Its work still depends on an order that should not exist, so what it created is withdrawn, but the decision itself is kept."
            : "Brindle could not reconstruct this decision with confidence, so a person must decide.",
      consequences: own.map((o) => ({
        label: String(o.label),
        treatment: treatmentOfConsequence(String(o.treatment)),
        irreversible: String(o.ref_id).startsWith("notif:"),
      })),
      technical: {
        decisionId: a.assessment.decisionId,
        result,
        originalAction: a.originalAction,
        counterfactualAction: a.assessment.counterfactualAction ?? null,
        assessedAt: a.assessment.assessedAt,
      },
    };
  });

  const recovery = done ? p.recovered.recovery : p.planned.recovery;
  const plan = planFrom(recovery, p.planned.recovery, po, done);
  const proof = done ? proofFrom(p.recovered.proof, supplier, po, change) : null;
  const wouldChange = assessments.filter((a) => a.assessment.result === "CHANGED").length;
  const same = assessments.filter((a) => a.assessment.result === "SAME").length;
  const needsHuman = assessments.filter((a) => a.assessment.result === "UNCERTAIN").length;
  const effects = (recovery?.effects ?? []) as Raw[];
  const controlDecisions = ((p.planned.recovery.plan?.control?.receipts ?? []) as Raw[]).length;

  let status: IncidentView["status"];
  let statusLabel: string;
  let nextAction: string | null;
  if (done && proof?.verdict === "RECOVERED") {
    status = "RECOVERED";
    statusLabel = "Recovered. Proof issued";
    nextAction = null;
  } else if (ctx.mode === "SHADOW") {
    status = "PROPOSED_SHADOW";
    statusLabel = "Recovery proposed · Shadow Mode";
    nextAction = "Review the proposal. Switch to Approval Mode to let Brindle execute it.";
  } else {
    status = "READY_TO_APPROVE";
    statusLabel = "Ready for your approval";
    nextAction = "Review the recovery plan and approve it.";
  }

  return {
    id: key === "A" ? "demo-atlas" : "demo-cedar",
    source: "DEMO",
    title: `${supplier.split(" ")[0]} certification changed`,
    summary: `${po} may contain decisions based on outdated supplier eligibility.`,
    severity: "HIGH",
    status,
    statusLabel,
    nextAction,
    agents: assessments.map(
      (a) => AGENT_NAME[String(a.assessment.decisionId).split(":").pop()!] ?? "",
    ),
    businessObject: po,
    openedAt: rev.observedAt,
    change,
    headline: {
      mayBeAffected: (p.opened.temporal.candidates as unknown[]).length,
      wouldChange,
      wouldStayTheSame: same,
      needsHuman,
      recoverableAutomatically: effects.filter((e) => e.classification !== "IRREVERSIBLE").length,
      cannotBeUndone: effects.filter((e) => e.classification === "IRREVERSIBLE").length,
      preservedUnrelated: controlDecisions,
    },
    impact,
    preserved: [
      {
        label: "PO-901 · Borealis Fasteners",
        why: "Unrelated: a different supplier. Brindle snapshotted it before acting and checks it again at the end.",
      },
      ...assessments
        .filter((a) => a.assessment.result === "SAME")
        .map((a) => ({
          label: `${AGENT_NAME[String(a.assessment.decisionId).split(":").pop()!] ?? "Agent"}'s decision on ${po}`,
          why: "The corrected fact would not have changed this decision, so the decision is kept.",
        })),
      {
        label: "Every original decision record",
        why: "History is never edited. Recovery adds new records beside it.",
      },
    ],
    plan,
    proof,
    memory: memoryFrom(story, p),
    shadowNote: null,
    evidence: {
      revisionId: p.scenario.revisionId,
      incidentId: p.incidentId,
      recoveryPlan: p.planned.recovery.plan,
      materiality: {
        complete: p.opened.materiality.complete,
        examined: p.opened.materiality.examined,
      },
      memoryAdvisory: {
        authority: (p.memoryBeforePlanning as Raw).authority,
        engine: (p.memoryBeforePlanning as Raw).engine,
        trace: (p.memoryBeforePlanning as Raw).trace,
      },
      ...(proof ? { receipt: proof.receiptJson } : {}),
    },
  };
}

export function buildDemoIncidents(story: StorySnapshot, ctx: DemoContext): IncidentView[] {
  return [buildDemoIncident(story, "B", ctx), buildDemoIncident(story, "A", ctx)];
}

export function buildDemoMemory(story: StorySnapshot, ctx: DemoContext): MemoryEntryView[] {
  const entries: MemoryEntryView[] = [];
  for (const p of story.incidents) {
    if (p.key === "B" && demoStage("B", ctx) !== "recovered") continue;
    const receipt = (p.recovered.proof as Raw).receipt;
    const view = buildDemoIncident(story, p.key, ctx);
    entries.push({
      id: (p.remembered as Raw).memoryId,
      incidentTitle: view.title,
      trigger: `${p.supplierName}'s ISO-9001 certification revoked`,
      pattern: ((p.planned.recovery.steps as Raw[]) ?? []).map(
        (s) => CAPABILITY[s.capabilityId]?.title("the purchase order") ?? s.capabilityId,
      ),
      warnings: [],
      verifiedChecks: (receipt.invariantResults as Raw[]).filter((r) => r.status === "PASS").length,
      rememberedAt: receipt.issuedAt,
      receiptId: receipt.receiptId,
      retrievedBy: [],
    });
  }
  const a = entries.find((e) => e.id === (story.incidents[0].remembered as Raw).memoryId);
  const b = buildDemoIncident(story, "B", ctx);
  if (a && b.memory?.hits.length) {
    a.retrievedBy.push({ incidentTitle: b.title, relevancePct: b.memory.hits[0]!.relevancePct });
  }
  return entries;
}

export function buildDemoAgents(story: StorySnapshot, mode: Mode): AgentView[] {
  const last = buildDemoIncident(story, "B", { mode, approvedB: false });
  return (["procurement", "finance", "operations"] as const).map((k) => ({
    id: `demo-${k}`,
    name: AGENT_NAME[k]!,
    description: {
      procurement: "Selects eligible suppliers and creates purchase orders.",
      finance: "Approves purchase orders within policy.",
      operations: "Schedules receiving and records supplier notices.",
    }[k],
    owner: { procurement: "Procurement", finance: "Finance", operations: "Operations" }[k],
    mode: mode === "SHADOW" ? "Shadow" : mode === "APPROVAL" ? "Approval" : "Bounded autonomous",
    lastSeen: story.healthyWorld.latestRun?.finishedAt ?? null,
    connectedSystems: ["Sandbox purchase orders", "Zetaris truth (demo fixture)"],
    lastIncident: last.title,
    coverage: "Protected",
    coverageDetail: "Its consequences are covered by 4 registered sandbox recovery capabilities.",
    status: "Active",
  }));
}
export { plural } from "./format";
