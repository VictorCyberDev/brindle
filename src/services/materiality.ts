import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import * as t from "../db/schema";
import {
  counterfactualAssessmentSchema,
  type CounterfactualAssessment,
} from "../brindle/counterfactual/assessment";
import { chosenActionSchema, type DecisionReceipt } from "../brindle/receipts/decision-receipt";
import { procurementPolicyValueSchema } from "../brindle/business/eligibility";
import {
  authorizeFinance,
  authorizeOperations,
  authorizeProcurement,
} from "../brindle/business/authorization";
import {
  financeProposalSchema,
  operationsProposalSchema,
  procurementProposalSchema,
  type BusinessActor,
} from "../brindle/business/proposals";
import {
  purchaseOrderSchema,
  type FinanceApproval,
  type PurchaseOrder,
  type PurchaseRequest,
} from "../brindle/business/sandbox";
import type { TruthAssertion } from "../brindle/truth/assertion";
import { buildEvidence, M1_ACTOR_SPECS, propose, type WorldDeps } from "../demo/run";
import { getReceipt, loadTruthByRefs } from "../demo/store";
import { blastRadius } from "./temporal";
import { canonical, fingerprint } from "./evidence";

type Action = DecisionReceipt["chosenAction"];
export interface HistoricalContext {
  receipt: DecisionReceipt;
  originalTruth: TruthAssertion[];
  correctedTruth: TruthAssertion[];
  replacement: TruthAssertion;
  actor: BusinessActor;
  request: PurchaseRequest;
  po: PurchaseOrder;
  approval?: FinanceApproval;
  originalReceipts: DecisionReceipt[];
}
const actorFor = (r: DecisionReceipt): BusinessActor => {
  const actor = (Object.keys(M1_ACTOR_SPECS) as BusinessActor[]).find(
    (a) => M1_ACTOR_SPECS[a].agentId === r.agentId,
  );
  if (!actor) throw new Error("unsupported historical decision mechanism");
  const spec = M1_ACTOR_SPECS[actor];
  if (r.promptVersion !== spec.promptVersion || r.schemaVersion !== spec.schemaVersion)
    throw new Error("historical prompt/schema version is unavailable");
  return actor;
};

/** Reconstruct M1-v1 inputs from immutable receipts, never from current business tables. */
export async function reconstructDecision(
  db: Db,
  decisionId: string,
  revisionId: string,
): Promise<HistoricalContext> {
  const receipt = await getReceipt(db, decisionId);
  if (!receipt) throw new Error("original receipt missing");
  const actor = actorFor(receipt);
  const expectedAction = {
    PROCUREMENT: "SELECT_SUPPLIER",
    FINANCE: "APPROVE_PO",
    OPERATIONS: "SCHEDULE_RECEIVING",
  }[actor];
  if (receipt.chosenAction.actionType !== expectedAction)
    throw new Error("unsupported original successful action");
  if (receipt.memoryRefs.length)
    throw new Error("historical memory payload is not persisted; cannot infer it");
  const [revision] = await db
    .select()
    .from(t.truthRevisions)
    .where(eq(t.truthRevisions.id, revisionId));
  if (!revision) throw new Error("revision missing");
  const originalTruth = await loadTruthByRefs(db, receipt.truthRefs);
  const [replacement] = await loadTruthByRefs(db, [
    { assertionId: revision.replacementAssertionId, version: revision.replacementVersion },
  ]);
  if (!replacement) throw new Error("replacement truth missing");
  const matching = originalTruth.filter(
    (a) => a.assertionId === revision.previousAssertionId && a.version === revision.previousVersion,
  );
  if (matching.length !== 1)
    throw new Error("specific superseded truth is absent from original context");
  const time = new Date(receipt.decidedAt).getTime();
  if (
    time < revision.effectiveFrom.getTime() ||
    (revision.effectiveTo && time >= revision.effectiveTo.getTime())
  )
    throw new Error("revision does not apply at original decision time");
  const correctedTruth = originalTruth.map((a) => (a === matching[0] ? replacement : a));
  const policy = originalTruth.find((a) => a.factKey === "policy.procurement");
  if (
    !policy ||
    procurementPolicyValueSchema.parse(policy.value).policyVersion !== receipt.policyVersion
  )
    throw new Error("original policy version missing or inconsistent");
  const poId = receipt.chosenAction.parameters.poId;
  if (typeof poId !== "string") throw new Error("original PO identity missing");
  const proc = actor === "PROCUREMENT" ? receipt : await getReceipt(db, `dec:${poId}:procurement`);
  if (
    !proc ||
    actorFor(proc) !== "PROCUREMENT" ||
    proc.chosenAction.actionType !== "SELECT_SUPPLIER"
  )
    throw new Error("original PO creation receipt missing");
  if (
    proc.policyVersion !== receipt.policyVersion ||
    canonical(proc.truthRefs) !== canonical(receipt.truthRefs) ||
    new Date(proc.decidedAt) > new Date(receipt.decidedAt)
  )
    throw new Error("inconsistent original creation context");
  const p = proc.chosenAction.parameters;
  const prefix = `Select a supplier for ${poId}: `;
  if (!proc.objective.startsWith(prefix))
    throw new Error("M1-v1 original request description not reconstructible");
  if (
    typeof p.supplierId !== "string" ||
    typeof p.amountCents !== "number" ||
    typeof p.currency !== "string" ||
    p.poId !== poId
  )
    throw new Error("original request parameters missing");
  const request = {
    poId,
    supplierId: p.supplierId,
    amountCents: p.amountCents,
    currency: p.currency,
    description: proc.objective.slice(prefix.length),
  };
  const name = originalTruth.find(
    (a) => a.subject.entityId === request.supplierId && a.factKey === "supplier.legal_name",
  )?.value;
  if (typeof name !== "string") throw new Error("original supplier name missing");
  const po = purchaseOrderSchema.parse({
    ...request,
    supplierName: name,
    status: actor === "OPERATIONS" ? "APPROVED" : "CREATED",
    createdByDecisionId: proc.decisionId,
    createdAt: proc.decidedAt,
  });
  const originalReceipts = [proc];
  let approval: FinanceApproval | undefined;
  if (
    actor !== "PROCUREMENT" &&
    !receipt.evidence.some((e) => e.kind === "DOCUMENT" && e.documentId === poId)
  )
    throw new Error("original PO evidence missing");
  if (actor === "OPERATIONS") {
    const fin = await getReceipt(db, `dec:${poId}:finance`);
    if (
      !fin ||
      actorFor(fin) !== "FINANCE" ||
      fin.chosenAction.actionType !== "APPROVE_PO" ||
      !receipt.evidence.some((e) => e.kind === "DOCUMENT" && e.documentId === `fin-apr:${poId}`)
    )
      throw new Error("original finance evidence missing");
    if (
      fin.policyVersion !== receipt.policyVersion ||
      canonical(fin.truthRefs) !== canonical(receipt.truthRefs) ||
      new Date(fin.decidedAt) > new Date(receipt.decidedAt)
    )
      throw new Error("inconsistent original finance context");
    const fp = fin.chosenAction.parameters;
    if (
      fp.poId !== poId ||
      fp.approvedAmountCents !== request.amountCents ||
      fp.currency !== request.currency
    )
      throw new Error("historical approval parameters inconsistent");
    approval = {
      approvalId: `fin-apr:${poId}`,
      poId,
      approvedAmountCents: request.amountCents,
      currency: request.currency,
      decisionId: fin.decisionId,
      approvedAt: fin.decidedAt,
    };
    originalReceipts.push(fin);
  }
  if (
    actor === "FINANCE" &&
    (receipt.chosenAction.parameters.approvedAmountCents !== request.amountCents ||
      receipt.chosenAction.parameters.currency !== request.currency)
  )
    throw new Error("original finance action is inconsistent");
  if (
    actor === "OPERATIONS" &&
    (receipt.chosenAction.parameters.dockId !== "DOCK-3" ||
      receipt.chosenAction.parameters.expectedArrival !==
        new Date(new Date(receipt.decidedAt).getTime() + 14 * 86400000).toISOString())
  )
    throw new Error("unsupported original deterministic allocation rule");
  // Supported successful M1-v1 receipts establish absence preconditions via their gated,
  // atomic executor boundary. Unknown mechanisms never inherit this reconstruction rule.
  return {
    receipt,
    actor,
    originalTruth,
    correctedTruth,
    replacement,
    request,
    po,
    approval,
    originalReceipts,
  };
}

/** Same deterministic M1 gates and deterministic parameter rules. No model calls here. */
export function actionFromProposal(
  context: HistoricalContext,
  raw: unknown,
): Action | { uncertain: string } {
  const { receipt: r, actor, request, po, approval, correctedTruth } = context;
  const policy = procurementPolicyValueSchema.parse(
    correctedTruth.find((a) => a.factKey === "policy.procurement")!.value,
  );
  const schema = M1_ACTOR_SPECS[actor].schema;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { uncertain: "reasoner output schema invalid" };
  const proposal = parsed.data;
  if (proposal.uncertainty) return { uncertain: "reasoner explicitly reported uncertainty" };
  const target = actor === "PROCUREMENT" ? request.supplierId : po.poId;
  if (proposal.target !== target) return { uncertain: "reasoner returned a different target" };
  let allowed: boolean;
  if (actor === "PROCUREMENT")
    allowed = authorizeProcurement({
      proposal: procurementProposalSchema.parse(proposal),
      request,
      assertions: correctedTruth,
      policy,
      asOf: r.decidedAt,
      existingPo: undefined,
    }).allowed;
  else if (actor === "FINANCE")
    allowed = authorizeFinance({
      proposal: financeProposalSchema.parse(proposal),
      po,
      existingApproval: undefined,
      contextAssertions: correctedTruth,
      policy,
      asOf: r.decidedAt,
    }).allowed;
  else
    allowed = authorizeOperations({
      proposal: operationsProposalSchema.parse(proposal),
      po,
      approval,
      existingAllocation: undefined,
    }).allowed;
  if (!allowed)
    return {
      actionType:
        actor === "PROCUREMENT"
          ? "DECLINE_SUPPLIER"
          : actor === "FINANCE"
            ? "REJECT_PO"
            : "HOLD_RECEIVING",
      parameters: { poId: po.poId, target },
    };
  if (actor === "OPERATIONS")
    return {
      actionType: "SCHEDULE_RECEIVING",
      parameters: {
        poId: po.poId,
        dockId: "DOCK-3",
        expectedArrival: new Date(new Date(r.decidedAt).getTime() + 14 * 86400000).toISOString(),
      },
    };
  return chosenActionSchema.parse(r.chosenAction);
}
export function compareActions(original: Action, replayed: Action): "SAME" | "CHANGED" {
  return canonical(chosenActionSchema.parse(original)) ===
    canonical(chosenActionSchema.parse(replayed))
    ? "SAME"
    : "CHANGED";
}

export interface AssessmentView {
  assessment: CounterfactualAssessment;
  originalAction: Action;
  correctedFact: TruthAssertion | null;
  evidenceHash: string;
  context: HistoricalContext | null;
  reason: string | null;
}
function fromRow(
  row: typeof t.counterfactualAssessments.$inferSelect,
  originalAction: Action,
): AssessmentView {
  const reconstruction = row.reconstruction as {
    originalContextRefs: DecisionReceipt["truthRefs"];
    correctedFactRef: { assertionId: string; version: number };
    evidence: { inputHash: string; context: HistoricalContext | null; reason: string | null };
  };
  const assessment = counterfactualAssessmentSchema.parse({
    assessmentId: row.id,
    decisionId: row.decisionId,
    revisionId: row.revisionId,
    reconstruction: {
      originalContextRefs: reconstruction.originalContextRefs,
      correctedFactRef: reconstruction.correctedFactRef,
    },
    result: row.result,
    ...(row.result === "CHANGED" ? { counterfactualAction: row.counterfactualAction } : {}),
    ...(row.result === "UNCERTAIN" ? { uncertaintyReason: row.uncertaintyReason } : {}),
    ...(row.modelId ? { modelId: row.modelId } : {}),
    traceId: row.traceId,
    assessedAt: row.assessedAt.toISOString(),
  });
  return {
    assessment,
    originalAction,
    correctedFact: reconstruction.evidence.context?.replacement ?? null,
    evidenceHash: reconstruction.evidence.inputHash,
    context: reconstruction.evidence.context,
    reason: reconstruction.evidence.reason,
  };
}

export async function assessDecision(
  deps: Pick<WorldDeps, "db" | "reasoner">,
  decisionId: string,
  revisionId: string,
): Promise<AssessmentView> {
  const candidates = await blastRadius(deps.db, revisionId);
  if (!candidates.some((c) => c.kind === "DECISION" && c.ref_id === decisionId))
    throw new Error("decision is outside candidate blast radius");
  const r = await getReceipt(deps.db, decisionId);
  if (!r) throw new Error("original receipt missing");
  const [revision] = await deps.db
    .select()
    .from(t.truthRevisions)
    .where(eq(t.truthRevisions.id, revisionId));
  if (!revision) throw new Error("revision missing");
  let context: HistoricalContext | null = null,
    reason: string | null = null;
  try {
    context = await reconstructDecision(deps.db, decisionId, revisionId);
  } catch {
    reason = "Required historical evidence or supported M1 mechanism is unavailable";
  }
  const inputHash = fingerprint({
    r,
    revision: {
      previous: revision.previousVersion,
      replacement: revision.replacementVersion,
      effectiveFrom: revision.effectiveFrom.toISOString(),
      effectiveTo: revision.effectiveTo?.toISOString() ?? null,
      observedAt: revision.observedAt.toISOString(),
    },
    context,
    reason,
    replayVersion: "m1-v1",
  });
  const id = `assessment:${revisionId}:${decisionId}:v1`;
  return deps.db.transaction(async (tx) => {
    await tx
      .select()
      .from(t.truthRevisions)
      .where(eq(t.truthRevisions.id, revisionId))
      .for("update");
    const [saved] = await tx
      .select()
      .from(t.counterfactualAssessments)
      .where(eq(t.counterfactualAssessments.id, id));
    if (saved) {
      const view = fromRow(saved, r.chosenAction);
      if (view.evidenceHash !== inputHash)
        throw new Error("conflicting immutable assessment evidence");
      return view;
    }
    let result: CounterfactualAssessment["result"] = "UNCERTAIN",
      counterfactualAction: Action | undefined,
      modelId: string | undefined;
    if (context) {
      try {
        const spec = M1_ACTOR_SPECS[context.actor];
        const policy = procurementPolicyValueSchema.parse(
          context.correctedTruth.find((a) => a.factKey === "policy.procurement")!.value,
        );
        const documents =
          context.actor === "PROCUREMENT"
            ? []
            : context.actor === "FINANCE"
              ? [
                  {
                    evidenceId: "ev-po",
                    documentId: context.po.poId,
                    summary: `${context.po.poId} ${context.po.status}: ${context.po.description}, ${context.po.amountCents} ${context.po.currency} cents, supplier ${context.po.supplierId}`,
                  },
                ]
              : [
                  {
                    evidenceId: "ev-po",
                    documentId: context.po.poId,
                    summary: `${context.po.poId} ${context.po.status}: ${context.po.description}`,
                  },
                  {
                    evidenceId: "ev-approval",
                    documentId: `fin-apr:${context.po.poId}`,
                    summary: `Finance approval recorded for ${context.approval!.approvedAmountCents} ${context.approval!.currency} cents`,
                  },
                ];
        const evidence = buildEvidence(context.correctedTruth, policy, documents);
        // Use the original proposal boundary, actor prompt/schema, runtime and frozen inputs.
        const out = await propose<(typeof M1_ACTOR_SPECS)[BusinessActor]["schema"]>(
          deps,
          spec,
          context.po.poId,
          `trace:${id}`,
          context.actor === "PROCUREMENT" ? context.request.supplierId : context.po.poId,
          {
            ...(context.actor === "PROCUREMENT"
              ? { request: context.request }
              : { purchaseOrder: context.po }),
            originalDecisionTime: r.decidedAt,
            originalModelId: r.modelId,
            temporalInstruction:
              "today refers only to originalDecisionTime; hold all unrelated inputs fixed",
          },
          evidence,
        );
        modelId = out.result.modelId;
        const action = actionFromProposal(context, out.proposal);
        if ("uncertain" in action) reason = action.uncertain;
        else {
          result = compareActions(r.chosenAction, action);
          if (result === "CHANGED") counterfactualAction = action;
          reason = null;
        }
      } catch {
        reason = "Reasoning boundary unavailable, invalid, or unable to establish a safe action";
      }
    }
    const reconstruction = {
      originalContextRefs: r.truthRefs,
      correctedFactRef: {
        assertionId: revision.replacementAssertionId,
        version: revision.replacementVersion,
      },
    };
    const a = counterfactualAssessmentSchema.parse({
      assessmentId: id,
      decisionId,
      revisionId,
      reconstruction,
      result,
      ...(result === "CHANGED" ? { counterfactualAction } : {}),
      ...(result === "UNCERTAIN" ? { uncertaintyReason: reason } : {}),
      ...(modelId ? { modelId } : {}),
      traceId: `trace:${id}`,
      assessedAt: new Date().toISOString(),
    });
    const [row] = await tx
      .insert(t.counterfactualAssessments)
      .values({
        id: a.assessmentId,
        decisionId,
        revisionId,
        result: a.result,
        reconstruction: { ...reconstruction, evidence: { inputHash, context, reason } },
        counterfactualAction: a.result === "CHANGED" ? a.counterfactualAction : null,
        uncertaintyReason: a.result === "UNCERTAIN" ? a.uncertaintyReason : null,
        modelId: a.modelId ?? null,
        traceId: a.traceId,
        assessedAt: new Date(a.assessedAt),
      })
      .returning();
    return fromRow(row!, r.chosenAction);
  });
}

export async function readMateriality(db: Db, revisionId: string) {
  const candidates = await blastRadius(db, revisionId);
  const rows = await db
    .select()
    .from(t.counterfactualAssessments)
    .where(eq(t.counterfactualAssessments.revisionId, revisionId))
    .orderBy(t.counterfactualAssessments.decisionId);
  const assessments: AssessmentView[] = [];
  for (const row of rows) {
    const receipt = await getReceipt(db, row.decisionId);
    if (!receipt) throw new Error("assessment receipt missing");
    assessments.push(fromRow(row, receipt.chosenAction));
  }
  const nodes = await db.select().from(t.consequenceNodes);
  const edges = await db.select().from(t.consequenceEdges);
  const candidateIds = new Set(candidates.map((c) => c.id));
  const dependencies = edges.flatMap((e) =>
    e.type === "SUPERSEDES"
      ? []
      : e.type === "DEPENDS_ON" || e.type === "DERIVED_FROM"
        ? [[e.toNodeId, e.fromNodeId]]
        : [[e.fromNodeId, e.toNodeId]],
  );
  const consequences = candidates
    .filter((c) => c.kind !== "DECISION")
    .map((c) => {
      const parents = assessments
        .filter((a) => {
          const root = nodes.find(
            (n) => n.kind === "DECISION" && n.refId === a.assessment.decisionId,
          )?.id;
          if (!root) return false;
          const seen = new Set([root]);
          const todo = [root];
          while (todo.length) {
            const id = todo.shift()!;
            for (const [from, to] of dependencies)
              if (from === id && candidateIds.has(to!) && !seen.has(to!)) {
                seen.add(to!);
                todo.push(to!);
              }
          }
          return seen.has(c.id);
        })
        .map((a) => ({ decisionId: a.assessment.decisionId, result: a.assessment.result }));
      const treatment = parents.some((p) => p.result === "UNCERTAIN")
        ? "BLOCKED_UNCERTAIN"
        : parents.some((p) => p.result === "CHANGED")
          ? "M4_ANALYSIS"
          : parents.length
            ? "PRESERVE"
            : "BLOCKED_UNASSESSED";
      return { ...c, parents, treatment };
    });
  const examined = assessments.length;
  const complete = candidates
    .filter((c) => c.kind === "DECISION")
    .every((c) => assessments.some((a) => a.assessment.decisionId === c.ref_id));
  return { revisionId, assessments, consequences, examined, complete };
}
export async function assessCandidates(
  deps: Pick<WorldDeps, "db" | "reasoner">,
  revisionId: string,
) {
  for (const c of await blastRadius(deps.db, revisionId))
    if (c.kind === "DECISION") await assessDecision(deps, c.ref_id, revisionId);
  return readMateriality(deps.db, revisionId);
}
