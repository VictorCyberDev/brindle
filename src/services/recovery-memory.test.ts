import { sql } from "drizzle-orm";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import * as t from "../db/schema";
import { createMockWorld, type TestWorld } from "../test-support/world";
import { runSuccessWorld } from "../demo/run";
import { injectAtlasRevision, ATLAS_REVISION_ID } from "../demo/temporal";
import { assessCandidates } from "./materiality";
import { executeRecovery, planRecovery, SANDBOX_RECOVERY_ACTOR } from "./recovery";
import { verifyRecovery } from "./verification";
import {
  HmemRecoveryMemory,
  promoteVerifiedRecovery,
  readRecoveryMemory,
  verifiedExperience,
} from "./recovery-memory";
let world: TestWorld;
const db = () => world.handle.db,
  rev = ATLAS_REVISION_ID,
  actor = SANDBOX_RECOVERY_ACTOR;
const query = {
  factKey: "certification.ISO-9001",
  correctedStatus: "REVOKED",
  targetTypes: [
    "purchase_order",
    "finance_approval",
    "receiving_allocation",
    "supplier_notification",
  ],
};
beforeEach(async () => {
  world = await createMockWorld();
  await runSuccessWorld(world.deps);
  await injectAtlasRevision(db());
  await assessCandidates(world.deps, rev);
  await planRecovery(db(), rev, actor);
});
afterEach(async () => {
  await db().delete(t.hmemLedger);
  await db().delete(t.hmemState);
  await db()
    .update(t.incidents)
    .set({ status: "VERIFYING", closure: null, closureReceiptId: null });
  await db().delete(t.invariantResults);
  await db().delete(t.recoveryReceipts);
  await db().delete(t.recoveryEvidence);
  await db().delete(t.recoverySteps);
  await db().delete(t.incidents);
  await db().delete(t.counterfactualAssessments);
  await db().delete(t.effects);
  await db().delete(t.consequenceEdges);
  await db().delete(t.consequenceNodes);
  await db().delete(t.truthRevisions);
});
async function verified() {
  await executeRecovery(db(), rev, actor);
  const proof = await verifyRecovery(db(), rev);
  return proof.recovery!.incident.incidentId;
}
describe("M5 / actual local H-MEM verified recovery memory", () => {
  it("only verified RECOVERED experience can be promoted", async () => {
    const id = await verified();
    const ref = await promoteVerifiedRecovery(db(), id);
    expect(ref.kind).toBe("RECOVERY_PATTERN");
    expect((await readRecoveryMemory(db())).recordCount).toBe(1);
    expect(
      (await verifiedExperience(db(), id)).verification.every((r) => r.status === "PASS"),
    ).toBe(true);
  });
  it("unverified/executor-only recovery cannot become trusted success memory", async () => {
    const out = await executeRecovery(db(), rev, actor);
    await expect(promoteVerifiedRecovery(db(), out.incident.incidentId)).rejects.toThrow(
      "UNVERIFIED",
    );
    expect((await readRecoveryMemory(db())).recordCount).toBe(0);
  });
  it("RECOVERY_INCOMPLETE cannot be promoted", async () => {
    const out = await executeRecovery(db(), rev, actor, []);
    await expect(promoteVerifiedRecovery(db(), out.incident.incidentId)).rejects.toThrow(
      "UNVERIFIED",
    );
  });
  it("actual engine retrieves relevant verified experience with its real ranking trace", async () => {
    const id = await verified();
    await promoteVerifiedRecovery(db(), id);
    const result = await new HmemRecoveryMemory(db()).lookup(query);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]!.experience.incidentId).toBe(id);
    expect(result.matches[0]!.relevance).toBeGreaterThanOrEqual(0.35);
    expect(result.trace.retrievalReason).toContain("hybrid ranking");
    expect(result.context).toContain("MEMORY CONTEXT");
    expect(result.engine).toBe("ACTUAL_LOCAL_SPEC_ENGINE");
  });
  it("irrelevant trigger is not treated as an authoritative relevant pattern", async () => {
    const id = await verified();
    await promoteVerifiedRecovery(db(), id);
    const result = await new HmemRecoveryMemory(db()).lookup({
      ...query,
      correctedStatus: "VALID",
    });
    expect(result.matches).toHaveLength(0);
    expect(result.context).toBe("");
  });
  it("current incident can be excluded from prior-experience retrieval", async () => {
    const id = await verified();
    await promoteVerifiedRecovery(db(), id);
    expect(
      (await new HmemRecoveryMemory(db()).lookup({ ...query, excludeIncidentId: id })).matches,
    ).toHaveLength(0);
  });
  it("failed prior compensator survives verified closure as an advisory warning", async () => {
    await db().execute(
      sql.raw(
        "CREATE FUNCTION memory_fail_finance() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'failure'; END; $$ LANGUAGE plpgsql",
      ),
    );
    await db().execute(
      sql.raw(
        "CREATE TRIGGER memory_fail_finance BEFORE DELETE ON finance_approvals FOR EACH ROW EXECUTE FUNCTION memory_fail_finance()",
      ),
    );
    expect((await executeRecovery(db(), rev, actor)).incident.status).toBe("RECOVERY_INCOMPLETE");
    await db().execute(sql.raw("DROP TRIGGER memory_fail_finance ON finance_approvals"));
    await db().execute(sql.raw("DROP FUNCTION memory_fail_finance()"));
    const id = await verified();
    await promoteVerifiedRecovery(db(), id);
    const result = await new HmemRecoveryMemory(db()).lookup(query);
    expect(result.matches[0]!.warnings.join(" ")).toContain("sandbox.finance.revoke.v1 failed");
    expect(result.authority).toBe("ADVISORY_ONLY");
  });
  it("duplicate promotion reuses the record without duplicate trusted entries", async () => {
    const id = await verified();
    const first = await promoteVerifiedRecovery(db(), id);
    expect(await promoteVerifiedRecovery(db(), id)).toEqual(first);
    expect((await readRecoveryMemory(db())).recordCount).toBe(1);
    expect(
      (await db().select().from(t.hmemLedger)).filter((e) => e.action === "create"),
    ).toHaveLength(1);
  });
  it("new engine instances hydrate PostgreSQL state and retain append-only trust history", async () => {
    const id = await verified();
    await promoteVerifiedRecovery(db(), id);
    await new HmemRecoveryMemory(db()).lookup(query);
    const before = await db().select().from(t.hmemLedger).orderBy(t.hmemLedger.ordinal);
    await new HmemRecoveryMemory(db()).lookup(query);
    const after = await db().select().from(t.hmemLedger).orderBy(t.hmemLedger.ordinal);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.length).toBeGreaterThan(before.length);
  });
  it("memory lookup cannot create capabilities, execute recovery, or close an incident", async () => {
    const before = await db().select().from(t.incidents);
    const steps = await db().select().from(t.recoverySteps);
    const result = await new HmemRecoveryMemory(db()).lookup(query);
    expect(result.matches).toHaveLength(0);
    expect(await db().select().from(t.incidents)).toEqual(before);
    expect(await db().select().from(t.recoverySteps)).toEqual(steps);
    expect(await db().select().from(t.recoveryReceipts)).toHaveLength(0);
  });
  it("fake experience payload cannot acquire a verified source", async () => {
    const id = await verified();
    await expect(
      new HmemRecoveryMemory(db()).remember({
        kind: "RECOVERY_PATTERN",
        key: id,
        payload: { verdict: "RECOVERED", capabilityId: "arbitrary.sql" },
      }),
    ).rejects.toThrow("EVIDENCE_CONFLICT");
    expect((await readRecoveryMemory(db())).recordCount).toBe(0);
  });
  it("corrupted closure/invariant references invalidate trusted promotion", async () => {
    const id = await verified();
    await db().delete(t.invariantResults);
    await expect(promoteVerifiedRecovery(db(), id)).rejects.toThrow("INVARIANT_EVIDENCE");
  });
});
