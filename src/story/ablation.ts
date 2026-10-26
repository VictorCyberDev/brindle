import { eq, sql } from "drizzle-orm";
import * as t from "../db/schema";
import { loadTruthByRefs } from "../demo/store";
import { ATLAS_REVISION_ID } from "../demo/temporal";
import { assessCandidates } from "../services/materiality";
import { HmemRecoveryMemory } from "../services/recovery-memory";
import { executeRecovery, planRecovery, SANDBOX_RECOVERY_ACTOR } from "../services/recovery";
import { blastRadius, buildConsequenceGraph, ingestRevision } from "../services/temporal";
import { verifyRecovery } from "../services/verification";
import {
  ATLAS_SCENARIO,
  buildHealthyWorld,
  buildSecondWorld,
  CEDAR_SCENARIO,
  consultMemory,
  memoryQueryFor,
  incidentIdOf,
  openIncident,
  recoverIncident,
  rememberRecovery,
} from "./flow";
import { createIsolatedWorld, type IsolatedWorld } from "./world";

/*
 * Evidence-based ablation. Each row removes ONE safeguard inside an analysis harness (never a
 * product mode) and measures what that safeguard prevented, using the real engine's persisted data.
 */
export interface AblationRow {
  component: "Temporal filtering" | "Materiality" | "Fresh verification" | "H-MEM";
  scenario: string;
  measure: string;
  withSafeguard: number;
  withoutSafeguard: number;
  consequence: string;
}

const rev = ATLAS_REVISION_ID;
const actor = SANDBOX_RECOVERY_ACTOR;

async function withWorld<T>(fn: (w: IsolatedWorld) => Promise<T>) {
  const world = await createIsolatedWorld();
  try {
    await buildHealthyWorld(world);
    return await fn(world);
  } finally {
    await world.close();
  }
}

async function ingestWith(
  w: IsolatedWorld,
  times: { from: string; observed: string },
  revoke: boolean,
) {
  const db = w.handle.db;
  const cert = (await db.select().from(t.truthAssertions)).find(
    (a) => a.subjectId === "SUP-ATLAS" && a.factKey === "certification.ISO-9001",
  )!;
  const [old] = await loadTruthByRefs(db, [{ assertionId: cert.assertionId, version: 1 }]);
  await buildConsequenceGraph(db);
  await ingestRevision(
    db,
    {
      revisionId: rev,
      previous: { assertionId: cert.assertionId, version: 1 },
      replacement: { assertionId: cert.assertionId, version: 2 },
      effectiveFrom: times.from,
      effectiveTo: old!.validTo,
      observedAt: times.observed,
    },
    {
      ...old!,
      truthVersionId: `${cert.assertionId}@v2`,
      version: 2,
      value: revoke ? { ...(old!.value as object), status: "REVOKED" } : old!.value,
      validFrom: times.from,
      observedAt: times.observed,
    },
  );
}

/** Lineage-only reachability: the same graph walk with the decision-time barrier removed. */
async function lineageOnlyCount(w: IsolatedWorld): Promise<number> {
  const db = w.handle.db;
  const [revision] = await db.select().from(t.truthRevisions).where(eq(t.truthRevisions.id, rev));
  const result = await db.execute(sql`
    WITH RECURSIVE downstream AS (
      SELECT from_node_id AS source, to_node_id AS target FROM consequence_edges WHERE type IN ('INFORMED','CAUSED','MUTATED')
      UNION
      SELECT to_node_id, from_node_id FROM consequence_edges WHERE type IN ('DEPENDS_ON','DERIVED_FROM')
    ), walk AS (
      SELECT n.id, ARRAY[n.id]::text[] AS path
      FROM consequence_nodes n JOIN truth_assertions a ON n.kind = 'TRUTH_VERSION' AND n.ref_id = a.id
      WHERE a.assertion_id = ${revision!.previousAssertionId} AND a.version = ${revision!.previousVersion}
      UNION ALL
      SELECT n.id, w.path || n.id FROM walk w JOIN downstream e ON e.source = w.id JOIN consequence_nodes n ON n.id = e.target
      WHERE NOT n.id = ANY(w.path)
    )
    SELECT count(DISTINCT n.id)::int AS n FROM walk w JOIN consequence_nodes n ON n.id = w.id
    WHERE n.kind IN ('DECISION','ACTION','BUSINESS_OBJECT')
  `);
  const rows = Array.isArray(result) ? result : (result as { rows: { n: number }[] }).rows;
  return Number((rows as { n: number }[])[0]!.n);
}

export async function runAblation(): Promise<AblationRow[]> {
  const rows: AblationRow[] = [];

  // Temporal filtering: a correction that only applies in the future.
  await withWorld(async (w) => {
    await ingestWith(w, { from: "2026-12-01T00:00:00Z", observed: "2026-10-25T00:00:00Z" }, true);
    const filtered = (await blastRadius(w.handle.db, rev)).filter((c) =>
      ["DECISION", "ACTION", "BUSINESS_OBJECT"].includes(c.kind),
    ).length;
    rows.push({
      component: "Temporal filtering",
      scenario: "Future-only truth change",
      measure: "consequences sent to analysis/recovery for decisions the change never touched",
      withSafeguard: filtered,
      withoutSafeguard: await lineageOnlyCount(w),
      consequence:
        "Without the decision-time barrier every downstream object that merely shares lineage with the fact is treated as affected.",
    });
  });

  // Materiality: a correction that would not have changed any decision.
  await withWorld(async (w) => {
    await ingestWith(w, { from: "2026-10-19T00:00:00Z", observed: "2026-10-24T12:00:00Z" }, false);
    const candidates = (await blastRadius(w.handle.db, rev)).filter(
      (c) => c.kind === "BUSINESS_OBJECT",
    ).length;
    await assessCandidates(w.deps, rev);
    const plan = await planRecovery(w.handle.db, rev, actor);
    rows.push({
      component: "Materiality",
      scenario: "SAME decisions are preserved",
      measure: "business objects mutated although the decision would have been identical",
      withSafeguard: plan.steps.length,
      withoutSafeguard: candidates,
      consequence:
        "Without counterfactual materiality every reachable object is cancelled or compensated, including correct work.",
    });
  });

  // Fresh verification: an executor reports success but a violation remains.
  await withWorld(async (w) => {
    const db = w.handle.db;
    await openIncident(w, ATLAS_SCENARIO);
    await planRecovery(db, rev, actor);
    const execution = await executeRecovery(db, rev, actor);
    const executorSaysDone = execution.steps.every((s) => s.status === "SUCCEEDED");
    // A new open PO appears for the revoked supplier after the executor finished.
    await db.insert(t.purchaseOrders).values({
      id: "PO-LATE-ATLAS",
      supplierId: "SUP-ATLAS",
      supplierName: "Atlas Components",
      description: "Late order created after recovery executed",
      amountCents: 100_000,
      currency: "USD",
      status: "CREATED",
      createdByDecisionId: "dec:PO-827:procurement",
      placedAt: new Date(),
    });
    let proofStatus = "ERROR";
    try {
      proofStatus = (await verifyRecovery(db, rev)).recovery?.incident.status ?? "ERROR";
    } catch {
      proofStatus = "REFUSED";
    }
    rows.push({
      component: "Fresh verification",
      scenario: "Residual violation after executor success",
      measure: "false RECOVERED verdicts",
      withSafeguard: proofStatus === "RECOVERED" ? 1 : 0,
      withoutSafeguard: executorSaysDone ? 1 : 0,
      consequence:
        "Trusting the executor's success response would close the incident while a prohibited open PO still exists.",
    });
  });

  // H-MEM: a prior recovery that needed a retry leaves a warning for the next incident.
  const world = await createIsolatedWorld();
  try {
    const db = world.handle.db;
    await buildHealthyWorld(world);
    await openIncident(world, ATLAS_SCENARIO);
    await db.execute(
      sql.raw(
        "CREATE FUNCTION ablate_fail() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'transient'; END; $$ LANGUAGE plpgsql",
      ),
    );
    await db.execute(
      sql.raw(
        "CREATE TRIGGER ablate_fail BEFORE DELETE ON finance_approvals FOR EACH ROW EXECUTE FUNCTION ablate_fail()",
      ),
    );
    await planRecovery(db, rev, actor);
    await executeRecovery(db, rev, actor); // fails at finance -> RECOVERY_INCOMPLETE
    await db.execute(sql.raw("DROP TRIGGER ablate_fail ON finance_approvals"));
    await db.execute(sql.raw("DROP FUNCTION ablate_fail()"));
    await executeRecovery(db, rev, actor);
    await verifyRecovery(db, rev);
    await rememberRecovery(world, ATLAS_SCENARIO);
    await buildSecondWorld(world, new Date("2026-10-23T12:00:00Z"));
    await openIncident(world, CEDAR_SCENARIO);
    const advisory = await consultMemory(world, CEDAR_SCENARIO);
    const warnings = advisory.matches.flatMap((m) => m.warnings).length;
    const emptyMemory = await createIsolatedWorld();
    let without = 0;
    try {
      without = (
        await new HmemRecoveryMemory(emptyMemory.handle.db).lookup(
          memoryQueryFor(incidentIdOf(CEDAR_SCENARIO.revisionId)),
        )
      ).matches.flatMap((m) => m.warnings).length;
    } finally {
      await emptyMemory.close();
    }
    rows.push({
      component: "H-MEM",
      scenario: "Cross-incident transfer",
      measure: "verified prior-failure warnings shown to the operator before planning",
      withSafeguard: warnings,
      withoutSafeguard: without,
      consequence:
        "Without memory the operator re-learns a known failure mode during the next incident. Memory is advisory only: it never changes the plan.",
    });
    const planned = await recoverIncident(world, CEDAR_SCENARIO);
    if (planned.plan.steps.length !== 4)
      throw new Error("memory must not alter the deterministic plan");
  } finally {
    await world.close();
  }
  return rows;
}
