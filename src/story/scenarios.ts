import { count, eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import * as t from "../db/schema";
import { MockDeterministicReasoner } from "../demo/mock/mock-reasoner";
import { loadTruthByRefs } from "../demo/store";
import { ATLAS_REVISION_ID, injectAtlasRevision } from "../demo/temporal";
import { assessCandidates, assessDecision } from "../services/materiality";
import { HmemRecoveryMemory } from "../services/recovery-memory";
import {
  businessSnapshot,
  executeRecovery,
  planRecovery,
  readRecovery,
  SANDBOX_RECOVERY_ACTOR,
} from "../services/recovery";
import { blastRadius, buildConsequenceGraph, ingestRevision } from "../services/temporal";
import { verifyRecovery } from "../services/verification";
import {
  ATLAS_SCENARIO,
  buildHealthyWorld,
  buildSecondWorld,
  CEDAR_SCENARIO,
  consultMemory,
  incidentIdOf,
  memoryQueryFor,
  openIncident,
  recoverIncident,
  rememberRecovery,
} from "./flow";
import { createIsolatedWorld, type IsolatedWorld } from "./world";

export interface ScenarioClaim {
  claim: string;
  pass: boolean;
  /** Secret-free measured facts that justify the verdict. */
  evidence: Record<string, unknown>;
}
export interface ScenarioResult {
  id: number;
  name: string;
  passed: boolean;
  claims: ScenarioClaim[];
}

const actor = SANDBOX_RECOVERY_ACTOR;
const rev = ATLAS_REVISION_ID;

class Recorder {
  readonly claims: ScenarioClaim[] = [];
  check(claim: string, pass: boolean, evidence: Record<string, unknown> = {}) {
    this.claims.push({ claim, pass, evidence });
  }
}
async function scenario(
  id: number,
  name: string,
  body: (r: Recorder) => Promise<void>,
): Promise<ScenarioResult> {
  const recorder = new Recorder();
  try {
    await body(recorder);
  } catch (error) {
    recorder.check("scenario ran to completion", false, {
      error: error instanceof Error ? error.message : "unknown error",
    });
  }
  return {
    id,
    name,
    passed: recorder.claims.length > 0 && recorder.claims.every((c) => c.pass),
    claims: recorder.claims,
  };
}
async function withWorld<T>(fn: (w: IsolatedWorld) => Promise<T>) {
  const world = await createIsolatedWorld();
  try {
    await buildHealthyWorld(world);
    return await fn(world);
  } finally {
    await world.close();
  }
}
const decisionVerdicts = (m: Awaited<ReturnType<typeof openIncident>>["materiality"]) =>
  m.assessments.map((a) => a.assessment.result);
const countOf = async (w: IsolatedWorld, table: PgTable) =>
  (await w.handle.db.select({ n: count() }).from(table))[0]!.n;

/** 1. A retroactive truth revision is traced, judged, recovered minimally and independently verified. */
export const canonicalRetroactiveRecovery = () =>
  scenario(1, "Canonical retroactive recovery", (r) =>
    withWorld(async (w) => {
      const controlBefore = await businessSnapshot(w.handle.db, "PO-901");
      const opened = await openIncident(w, ATLAS_SCENARIO);
      r.check("revision is retroactive", opened.temporal!.revision.retroactive === true);
      r.check(
        "impact reaches PO-827's decisions and not the control",
        opened.temporal!.control.outside,
        {
          candidates: opened.temporal!.candidates.length,
        },
      );
      const verdicts = decisionVerdicts(opened.materiality);
      r.check(
        "2 decisions would have changed, 1 would have stayed the same",
        verdicts.filter((v) => v === "CHANGED").length === 2 &&
          verdicts.filter((v) => v === "SAME").length === 1,
        { verdicts },
      );
      const { plan, execution, proof } = await recoverIncident(w, ATLAS_SCENARIO);
      r.check("recovery plan has 4 registered, bounded steps", plan.steps.length === 4, {
        capabilities: plan.steps.map((s) => s.capabilityId),
      });
      r.check(
        "execution leaves VERIFYING (not closed by executor success)",
        execution.incident.status === "VERIFYING",
      );
      r.check(
        "fresh independent verification closes as RECOVERED",
        proof.recovery?.incident.status === "RECOVERED",
        {
          invariants: proof.receipt?.invariantResults.map((i) => `${i.invariantId}:${i.status}`),
        },
      );
      r.check("a Recovery Receipt exists", Boolean(proof.receipt), {
        receiptId: proof.receipt?.receiptId,
      });
      r.check(
        "PO-901 control is byte-for-byte unchanged",
        JSON.stringify(await businessSnapshot(w.handle.db, "PO-901")) ===
          JSON.stringify(controlBefore),
      );
    }),
  );

/** 2. A correction that only takes effect AFTER the decisions never reaches them. */
export const futureOnlyTruthChange = () =>
  scenario(2, "Future-only truth change", (r) =>
    withWorld(async (w) => {
      const db = w.handle.db;
      const cert = (await db.select().from(t.truthAssertions)).find(
        (a) => a.subjectId === "SUP-ATLAS" && a.factKey === "certification.ISO-9001",
      )!;
      const [old] = await loadTruthByRefs(db, [{ assertionId: cert.assertionId, version: 1 }]);
      const from = "2026-12-01T00:00:00Z";
      const observed = "2026-10-25T00:00:00Z";
      await buildConsequenceGraph(db);
      await ingestRevision(
        db,
        {
          revisionId: rev,
          previous: { assertionId: cert.assertionId, version: 1 },
          replacement: { assertionId: cert.assertionId, version: 2 },
          effectiveFrom: from,
          effectiveTo: old!.validTo,
          observedAt: observed,
        },
        {
          ...old!,
          truthVersionId: `${cert.assertionId}@v2`,
          version: 2,
          value: { ...(old!.value as object), status: "REVOKED" },
          validFrom: from,
          observedAt: observed,
        },
      );
      const [revision] = await db
        .select()
        .from(t.truthRevisions)
        .where(eq(t.truthRevisions.id, rev));
      const candidates = await blastRadius(db, rev);
      const decisionCandidates = candidates.filter((c) => c.kind === "DECISION");
      const poBefore = await businessSnapshot(db, "PO-827");
      r.check(
        "revision is NOT retroactive (effective after it was learned)",
        revision!.retroactive === false,
      );
      r.check("no historical decision is affected", decisionCandidates.length === 0, {
        decisionCandidates: decisionCandidates.length,
      });
      r.check(
        "no incident, effect or recovery step is created",
        (await countOf(w, t.incidents)) === 0 && (await countOf(w, t.recoverySteps)) === 0,
      );
      r.check(
        "PO-827 stays exactly as the agents left it",
        JSON.stringify(poBefore.pos[0]?.status) === JSON.stringify("RECEIVING_SCHEDULED"),
      );
    }),
  );

/** 3. Where the corrected fact would not have changed the decision, Brindle preserves it. */
export const samePreservation = () =>
  scenario(3, "SAME decisions are preserved", (r) =>
    withWorld(async (w) => {
      const db = w.handle.db;
      const cert = (await db.select().from(t.truthAssertions)).find(
        (a) => a.subjectId === "SUP-ATLAS" && a.factKey === "certification.ISO-9001",
      )!;
      const [old] = await loadTruthByRefs(db, [{ assertionId: cert.assertionId, version: 1 }]);
      const from = "2026-10-19T00:00:00Z";
      const observed = "2026-10-24T12:00:00Z";
      await buildConsequenceGraph(db);
      await ingestRevision(
        db,
        {
          revisionId: rev,
          previous: { assertionId: cert.assertionId, version: 1 },
          replacement: { assertionId: cert.assertionId, version: 2 },
          effectiveFrom: from,
          effectiveTo: old!.validTo,
          observedAt: observed,
        },
        {
          ...old!,
          truthVersionId: `${cert.assertionId}@v2`,
          version: 2,
          validFrom: from,
          observedAt: observed,
        },
      );
      const before = await businessSnapshot(db, "PO-827");
      await assessCandidates(w.deps, rev);
      const plan = await planRecovery(db, rev, actor);
      r.check(
        "every affected decision is judged SAME",
        plan.steps.length === 0 && plan.effects.length === 0,
      );
      r.check(
        "7 consequences are explicitly preserved",
        plan.plan!.preservedConsequences.length === 7,
        {
          preserved: plan.plan!.preservedConsequences.length,
        },
      );
      r.check(
        "no mutation is made to PO-827",
        JSON.stringify(await businessSnapshot(db, "PO-827")) === JSON.stringify(before),
      );
    }),
  );

/** 4. When Brindle cannot tell, it says so and escalates to a human. */
export const uncertainEscalation = () =>
  scenario(4, "UNCERTAIN escalates safely", (r) =>
    withWorld(async (w) => {
      const db = w.handle.db;
      await injectAtlasRevision(db);
      await assessDecision(
        { db, reasoner: new MockDeterministicReasoner(() => null) },
        "dec:PO-827:procurement",
        rev,
      );
      await assessCandidates(w.deps, rev);
      const plan = await planRecovery(db, rev, actor);
      r.check(
        "the uncertain ancestry is never coerced to SAME or CHANGED",
        plan.incident.status === "ESCALATED",
      );
      r.check("no automatic step is created", plan.steps.length === 0);
      let refused = false;
      try {
        await executeRecovery(db, rev, actor);
      } catch (e) {
        refused = e instanceof Error && e.message === "INCIDENT_ESCALATED";
      }
      r.check("execution is refused", refused);
      r.check(
        "nothing in PO-827 changed",
        (await businessSnapshot(db, "PO-827")).pos[0]?.status === "RECEIVING_SCHEDULED",
      );
    }),
  );

/** 5. An effect that cannot be undone is remediated and reported honestly, never "rolled back". */
export const irreversibleConsequence = () =>
  scenario(5, "Irreversible consequence handled honestly", (r) =>
    withWorld(async (w) => {
      await openIncident(w, ATLAS_SCENARIO);
      const { plan, proof } = await recoverIncident(w, ATLAS_SCENARIO);
      const irreversible = plan.effects.filter((e) => e.classification === "IRREVERSIBLE");
      r.check(
        "the supplier notification is classified IRREVERSIBLE by a deterministic rule",
        irreversible.length === 1 && irreversible[0]!.classifiedBy === "DETERMINISTIC_RULE",
        {
          ruleId: irreversible[0]?.ruleId,
        },
      );
      const step = plan.steps.find((s) => s.effectId === irreversible[0]!.effectId)!;
      r.check("it receives REMEDIATE, never REVERSE or COMPENSATE", step.mode === "REMEDIATE");
      const notification = (await businessSnapshot(w.handle.db, "PO-827")).notifications[0];
      r.check("the original notification is retained as historical fact", Boolean(notification));
      const outcomes =
        proof.receipt?.effectOutcomes.map((o) => `${o.classification}:${o.outcome}`) ?? [];
      r.check(
        "the receipt never says an irreversible effect was reversed",
        outcomes.includes("IRREVERSIBLE:REMEDIATED") &&
          !outcomes.some(
            (o) =>
              o.startsWith("IRREVERSIBLE:REVERSED") || o.startsWith("IRREVERSIBLE:COMPENSATED"),
          ),
        { outcomes },
      );
    }),
  );

/** 6. If the world changed under the plan, Brindle stops, preserves the new state and refuses to claim success. */
export const preconditionFailure = () =>
  scenario(6, "Precondition / compensator failure", (r) =>
    withWorld(async (w) => {
      const db = w.handle.db;
      await openIncident(w, ATLAS_SCENARIO);
      await planRecovery(db, rev, actor);
      await db
        .update(t.receivingAllocations)
        .set({ dockId: "EXTERNAL-CHANGE" })
        .where(eq(t.receivingAllocations.poId, "PO-827"));
      const execution = await executeRecovery(db, rev, actor);
      r.check(
        "recovery is RECOVERY_INCOMPLETE",
        execution.incident.status === "RECOVERY_INCOMPLETE",
      );
      r.check(
        "the failure is PRECONDITION_CHANGED",
        execution.evidence.some(
          (e) =>
            e.kind === "FAILURE" &&
            (e.payload as { code?: string }).code === "PRECONDITION_CHANGED",
        ),
      );
      const [dock] = await db
        .select()
        .from(t.receivingAllocations)
        .where(eq(t.receivingAllocations.poId, "PO-827"));
      r.check(
        "the externally changed state is preserved, not overwritten",
        dock?.dockId === "EXTERNAL-CHANGE",
      );
      let verifyRefused = false;
      try {
        await verifyRecovery(db, rev);
      } catch {
        verifyRefused = true;
      }
      const incident = await readRecovery(db, rev);
      r.check(
        "no RECOVERED receipt is issued and the incident is not closed",
        (await countOf(w, t.recoveryReceipts)) === 0 && incident?.incident.status !== "RECOVERED",
        { verifyRefused, status: incident?.incident.status },
      );
    }),
  );

/** 7. Doing it twice does the work once. */
export const duplicateReplaySafety = () =>
  scenario(7, "Duplicate / replay safety", (r) =>
    withWorld(async (w) => {
      const db = w.handle.db;
      await openIncident(w, ATLAS_SCENARIO);
      const first = await planRecovery(db, rev, actor);
      const again = await planRecovery(db, rev, actor);
      r.check(
        "planning twice yields the same immutable plan",
        JSON.stringify(first.steps.map((s) => s.stepId)) ===
          JSON.stringify(again.steps.map((s) => s.stepId)),
      );
      await executeRecovery(db, rev, actor);
      await executeRecovery(db, rev, actor);
      const executions = (await db.select().from(t.recoveryEvidence)).filter(
        (e) => e.kind === "EXECUTION" || e.kind === "REMEDIATION",
      );
      r.check("executing twice performs each step once", executions.length === 4, {
        executions: executions.length,
      });
      const proof1 = await verifyRecovery(db, rev);
      const proof2 = await verifyRecovery(db, rev);
      r.check(
        "verifying twice returns the same receipt",
        proof1.receipt?.receiptId === proof2.receipt?.receiptId,
      );
      r.check("exactly one RECOVERED receipt exists", (await countOf(w, t.recoveryReceipts)) === 1);
      const revisions = await countOf(w, t.truthRevisions);
      await injectAtlasRevision(db).catch(() => undefined);
      r.check(
        "re-ingesting the same revision adds nothing",
        (await countOf(w, t.truthRevisions)) === revisions,
      );
    }),
  );

/** 8. A verified recovery is remembered; a different, later incident retrieves it before planning. Memory is advisory only. */
export const hmemCrossIncidentTransfer = () =>
  scenario(8, "H-MEM cross-incident transfer", async (r) => {
    const world = await createIsolatedWorld();
    try {
      const db = world.handle.db;
      await buildHealthyWorld(world);
      await openIncident(world, ATLAS_SCENARIO);
      const incidentA = incidentIdOf(ATLAS_SCENARIO.revisionId);
      const firstLookup = await consultMemory(world, ATLAS_SCENARIO);
      r.check("Incident A honestly has no prior pattern", firstLookup.matches.length === 0);
      const a = await recoverIncident(world, ATLAS_SCENARIO);
      r.check(
        "Incident A is RECOVERED with a receipt",
        a.proof.recovery?.incident.status === "RECOVERED" && Boolean(a.proof.receipt),
      );
      const stored = await rememberRecovery(world, ATLAS_SCENARIO);
      r.check(
        "only after verification is it promoted to H-MEM",
        stored.kind === "RECOVERY_PATTERN",
        { memoryId: stored.memoryId },
      );

      await buildSecondWorld(world, new Date("2026-10-23T12:00:00Z"));
      await openIncident(world, CEDAR_SCENARIO);
      const incidentB = incidentIdOf(CEDAR_SCENARIO.revisionId);
      r.check(
        "Incident B is a distinct incident",
        incidentA !== incidentB && CEDAR_SCENARIO.supplierId !== ATLAS_SCENARIO.supplierId,
      );
      const stepsBefore = await db.select().from(t.recoverySteps);
      const lookup = await consultMemory(world, CEDAR_SCENARIO);
      r.check(
        "H-MEM is queried BEFORE Incident B is planned",
        (await db.select().from(t.incidents).where(eq(t.incidents.id, incidentB))).length === 0,
      );
      r.check(
        "Incident A is retrieved",
        lookup.matches.length === 1 && lookup.matches[0]!.experience.incidentId === incidentA,
        {
          relevance: lookup.matches[0]?.relevance,
        },
      );
      r.check(
        "the current incident is excluded",
        lookup.matches.every((m) => m.experience.incidentId !== incidentB),
      );
      r.check("authority remains advisory only", lookup.authority === "ADVISORY_ONLY");
      r.check(
        "the lookup mutated nothing",
        JSON.stringify(await db.select().from(t.recoverySteps)) === JSON.stringify(stepsBefore),
      );

      const b = await recoverIncident(world, CEDAR_SCENARIO);
      const registry = new Set(a.plan.steps.map((s) => s.capabilityId));
      r.check(
        "Incident B's plan still comes only from the deterministic registry",
        b.plan.steps.every((s) => registry.has(s.capabilityId)) && b.plan.steps.length === 4,
      );
      r.check(
        "Incident B is independently verified",
        b.proof.recovery?.incident.status === "RECOVERED",
      );
      r.check(
        "PO-901 and the already-recovered PO-827 are untouched by Incident B",
        b.proof.receipt?.invariantResults.find(
          (i) => i.invariantId === "unrelated-control-preserved",
        )?.status === "PASS",
      );
      r.check(
        "Incident A's own memory is not erased",
        (await new HmemRecoveryMemory(db).lookup(memoryQueryFor(incidentB))).matches.some(
          (m) => m.experience.incidentId === incidentA,
        ),
      );
    } finally {
      await world.close();
    }
  });

export async function runAllScenarios(): Promise<ScenarioResult[]> {
  const out: ScenarioResult[] = [];
  for (const run of [
    canonicalRetroactiveRecovery,
    futureOnlyTruthChange,
    samePreservation,
    uncertainEscalation,
    irreversibleConsequence,
    preconditionFailure,
    duplicateReplaySafety,
    hmemCrossIncidentTransfer,
  ]) {
    out.push(await run());
  }
  return out;
}
