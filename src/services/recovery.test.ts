import { eq, sql } from "drizzle-orm";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import * as t from "../db/schema";
import { createMockWorld, type TestWorld } from "../test-support/world";
import { runSuccessWorld } from "../demo/run";
import { injectAtlasRevision, ATLAS_REVISION_ID } from "../demo/temporal";
import { loadTruthByRefs } from "../demo/store";
import { MockDeterministicReasoner } from "../demo/mock/mock-reasoner";
import { assessCandidates, assessDecision } from "./materiality";
import { buildConsequenceGraph, ingestRevision } from "./temporal";
import {
  businessSnapshot,
  executeRecovery,
  planRecovery,
  readRecovery,
  RECOVERY_REGISTRY,
  SANDBOX_RECOVERY_ACTOR,
  validateRecoveryStep,
} from "./recovery";
import { deriveIdempotencyKey } from "../brindle/recovery/idempotency";
let world: TestWorld;
const db = () => world.handle.db,
  rev = ATLAS_REVISION_ID,
  actor = SANDBOX_RECOVERY_ACTOR;
beforeEach(async () => {
  world = await createMockWorld();
  await runSuccessWorld(world.deps);
});
afterEach(async () => {
  await db().delete(t.recoveryEvidence);
  await db().delete(t.recoverySteps);
  await db().delete(t.incidents);
  await db().delete(t.counterfactualAssessments);
  await db().delete(t.effects);
  await db().delete(t.consequenceEdges);
  await db().delete(t.consequenceNodes);
  await db().delete(t.truthRevisions);
});
async function prepare(same = false) {
  if (same) {
    const all = await db().select().from(t.truthAssertions);
    const cert = all.find(
      (a) => a.subjectId === "SUP-ATLAS" && a.factKey === "certification.ISO-9001",
    )!;
    const [old] = await loadTruthByRefs(db(), [{ assertionId: cert.assertionId, version: 1 }]);
    const from = "2026-10-19T00:00:00Z",
      observed = "2026-10-24T12:00:00Z";
    await buildConsequenceGraph(db());
    await ingestRevision(
      db(),
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
  } else await injectAtlasRevision(db());
  await assessCandidates(world.deps, rev);
  return planRecovery(db(), rev, actor);
}
describe("M4 / closed deterministic sandbox recovery", () => {
  it("persists four rule-classified effects and a stable dependency-respecting minimal set", async () => {
    const p = await prepare();
    expect(p.effects.map((e) => e.classification).sort()).toEqual([
      "COMPENSABLE",
      "COMPENSABLE",
      "IRREVERSIBLE",
      "REVERSIBLE",
    ]);
    expect(p.effects.every((e) => e.ruleId.endsWith(".v1"))).toBe(true);
    expect(p.steps.map((s) => s.capabilityId)).toEqual([
      "sandbox.receiving.cancel.v1",
      "sandbox.finance.revoke.v1",
      "sandbox.po.cancel.v1",
      "sandbox.notification.remediate.v1",
    ]);
    expect(p.incident.status).toBe("RECOVERY_PLANNED");
    expect(p.plan!.claim).toContain("removed consequences proven counterfactually unaffected");
  });
  it("registry is closed and all capabilities are bounded to one object", () => {
    expect(RECOVERY_REGISTRY).toHaveLength(4);
    expect(Object.isFrozen(RECOVERY_REGISTRY)).toBe(true);
    expect(RECOVERY_REGISTRY.every((c) => c.bounds.maxAffectedObjects === 1)).toBe(true);
  });
  it("unknown capability rejected", async () => {
    const p = await prepare();
    expect(() =>
      validateRecoveryStep(
        {
          ...p.steps[0]!,
          capabilityId: "arbitrary.sql",
          idempotencyKey: deriveIdempotencyKey({ ...p.steps[0]!, capabilityId: "arbitrary.sql" }),
        },
        p.effects.find((e) => e.effectId === p.steps[0]!.effectId)!,
        actor,
      ),
    ).toThrow("UNKNOWN_CAPABILITY");
  });
  it("irreversible effects can never use REVERSE", async () => {
    const p = await prepare();
    const s = p.steps.find((s) => s.mode === "REMEDIATE")!;
    expect(() =>
      validateRecoveryStep(
        { ...s, mode: "REVERSE" },
        p.effects.find((e) => e.effectId === s.effectId)!,
        actor,
      ),
    ).toThrow();
  });
  it("missing planning authority is rejected without partial incident or step writes", async () => {
    await injectAtlasRevision(db());
    await assessCandidates(world.deps, rev);
    await expect(planRecovery(db(), rev, { id: "unprivileged", authority: [] })).rejects.toThrow(
      "AUTHORITY_MISSING",
    );
    expect(await db().select().from(t.recoverySteps)).toHaveLength(0);
    expect(await db().select().from(t.incidents)).toHaveLength(0);
  });
  it("execution rechecks authority and becomes incomplete without mutations", async () => {
    await prepare();
    const before = await businessSnapshot(db(), "PO-827");
    const out = await executeRecovery(db(), rev, { id: "unprivileged", authority: [] });
    expect(out.incident.status).toBe("RECOVERY_INCOMPLETE");
    expect(await businessSnapshot(db(), "PO-827")).toEqual(before);
  });
  it("maximum affected object bound is enforced", async () => {
    const p = await prepare();
    const s = p.steps[0]!,
      e = p.effects.find((e) => e.effectId === s.effectId)!;
    expect(() => validateRecoveryStep(s, e, actor, 2)).toThrow("OBJECT_BOUND_EXCEEDED");
  });
  it("target bounds prohibit the unrelated control", async () => {
    const p = await prepare();
    const s = p.steps.find((s) => s.mode === "REVERSE")!,
      e = p.effects.find((e) => e.effectId === s.effectId)!;
    expect(() =>
      validateRecoveryStep(
        {
          ...s,
          parameters: { ...s.parameters, targetId: "PO-901", expectedBefore: { id: "PO-901" } },
        },
        { ...e, target: { ...e.target, entityId: "PO-901" } },
        actor,
      ),
    ).toThrow("TARGET_OUTSIDE");
  });
  it("idempotency keys are deterministic and validated", async () => {
    const p = await prepare();
    for (const s of p.steps) expect(s.idempotencyKey).toBe(deriveIdempotencyKey(s));
    const s = p.steps[0]!;
    expect(() =>
      validateRecoveryStep(
        { ...s, idempotencyKey: "0".repeat(64) },
        p.effects.find((e) => e.effectId === s.effectId)!,
        actor,
      ),
    ).toThrow();
  });
  it("duplicate plan/revision/execution produces zero duplicate compensation", async () => {
    const p = await prepare();
    await injectAtlasRevision(db());
    expect((await planRecovery(db(), rev, actor)).steps).toEqual(p.steps);
    await executeRecovery(db(), rev, actor);
    const events = await db().select().from(t.recoveryEvidence);
    await executeRecovery(db(), rev, actor);
    expect(await db().select().from(t.recoveryEvidence)).toEqual(events);
    expect(events.filter((e) => e.kind === "EXECUTION")).toHaveLength(3);
    expect(events.filter((e) => e.kind === "REMEDIATION")).toHaveLength(1);
  });
  it("cancels PO, compensates finance/receiving, retains original notification and records corrective escalation", async () => {
    await prepare();
    const notification = (await businessSnapshot(db(), "PO-827")).notifications;
    const p = await executeRecovery(db(), rev, actor);
    const after = await businessSnapshot(db(), "PO-827");
    expect(after.pos[0]!.status).toBe("CANCELLED");
    expect(after.finance).toHaveLength(0);
    expect(after.receiving).toHaveLength(0);
    expect(after.notifications).toEqual(notification);
    expect(p.evidence.find((e) => e.kind === "REMEDIATION")!.payload).toMatchObject({
      remediation: { kind: "CORRECTIVE_ESCALATION_RECORDED", owner: "COMPLIANCE", status: "OPEN" },
    });
    expect(p.incident.status).toBe("VERIFYING");
  });
  it("PO-901 is byte-for-byte business/receipt unchanged", async () => {
    const before = await businessSnapshot(db(), "PO-901");
    await prepare();
    await executeRecovery(db(), rev, actor);
    expect(await businessSnapshot(db(), "PO-901")).toEqual(before);
  });
  it("genuine SAME-only consequences produce no recovery requirements or mutations", async () => {
    const before = await businessSnapshot(db(), "PO-827");
    const p = await prepare(true);
    expect(p.steps).toHaveLength(0);
    expect(p.effects).toHaveLength(0);
    expect(p.plan!.preservedConsequences).toHaveLength(7);
    expect(p.incident.status).toBe("VERIFYING");
    expect(await businessSnapshot(db(), "PO-827")).toEqual(before);
  });
  it("UNCERTAIN ancestry escalates and creates no automatic steps", async () => {
    await injectAtlasRevision(db());
    await assessDecision(
      { db: db(), reasoner: new MockDeterministicReasoner(() => null) },
      "dec:PO-827:procurement",
      rev,
    );
    await assessCandidates(world.deps, rev);
    const p = await planRecovery(db(), rev, actor);
    expect(p.incident.status).toBe("ESCALATED");
    expect(p.steps).toHaveLength(0);
    await expect(executeRecovery(db(), rev, actor)).rejects.toThrow("ESCALATED");
  });
  it("unavailable capability fails safely", async () => {
    await prepare();
    const p = await executeRecovery(db(), rev, actor, []);
    expect(p.incident.status).toBe("RECOVERY_INCOMPLETE");
    expect(p.evidence.find((e) => e.kind === "FAILURE")!.payload).toMatchObject({
      code: "CAPABILITY_UNAVAILABLE",
    });
  });
  it("changed precondition fails and preserves the new external state", async () => {
    await prepare();
    await db()
      .update(t.receivingAllocations)
      .set({ dockId: "EXTERNAL-CHANGE" })
      .where(eq(t.receivingAllocations.poId, "PO-827"));
    const p = await executeRecovery(db(), rev, actor);
    expect(p.incident.status).toBe("RECOVERY_INCOMPLETE");
    expect(
      (
        await db()
          .select()
          .from(t.receivingAllocations)
          .where(eq(t.receivingAllocations.poId, "PO-827"))
      )[0]!.dockId,
    ).toBe("EXTERNAL-CHANGE");
    expect(p.evidence.find((e) => e.kind === "FAILURE")!.payload).toMatchObject({
      code: "PRECONDITION_CHANGED",
    });
  });
  it("a failing compensator leaves partial recovery incomplete; bounded retry does not duplicate prior success", async () => {
    await prepare();
    await db().execute(
      sql.raw(
        "CREATE FUNCTION fail_finance() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'transient failure'; END; $$ LANGUAGE plpgsql;",
      ),
    );
    await db().execute(
      sql.raw(
        "CREATE TRIGGER fail_finance BEFORE DELETE ON finance_approvals FOR EACH ROW EXECUTE FUNCTION fail_finance();",
      ),
    );
    const p = await executeRecovery(db(), rev, actor);
    expect(p.incident.status).toBe("RECOVERY_INCOMPLETE");
    expect(p.steps.filter((s) => s.status === "SUCCEEDED")).toHaveLength(1);
    expect((await businessSnapshot(db(), "PO-827")).finance).toHaveLength(1);
    await db().execute(sql.raw("DROP TRIGGER fail_finance ON finance_approvals;"));
    await db().execute(sql.raw("DROP FUNCTION fail_finance();"));
    const retry = await executeRecovery(db(), rev, actor);
    expect(retry.incident.status).toBe("VERIFYING");
    expect(retry.evidence.filter((e) => e.kind === "EXECUTION")).toHaveLength(3);
  });
  it("three failed attempts exhaust the bounded retry budget and escalate", async () => {
    await prepare();
    for (let i = 0; i < 3; i++)
      expect((await executeRecovery(db(), rev, actor, [])).incident.status).toBe(
        "RECOVERY_INCOMPLETE",
      );
    expect((await executeRecovery(db(), rev, actor, [])).incident.status).toBe("ESCALATED");
    expect(
      (await readRecovery(db(), rev))!.evidence.filter((e) => e.kind === "FAILURE"),
    ).toHaveLength(3);
  });
  it("materiality evidence remains immutable; no RECOVERED receipt or closure is issued", async () => {
    await prepare();
    const assessments = await db().select().from(t.counterfactualAssessments);
    await executeRecovery(db(), rev, actor);
    expect(await db().select().from(t.counterfactualAssessments)).toEqual(assessments);
    expect(await db().select().from(t.recoveryReceipts)).toHaveLength(0);
    expect(await db().select().from(t.invariantResults)).toHaveLength(0);
    expect((await readRecovery(db(), rev))!.incident.closure).toBeNull();
  });
});
