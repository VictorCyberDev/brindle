import { eq, sql } from "drizzle-orm";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import * as t from "../db/schema";
import { createMockWorld, type TestWorld } from "../test-support/world";
import { runSuccessWorld } from "../demo/run";
import { injectAtlasRevision, ATLAS_REVISION_ID } from "../demo/temporal";
import { MockDeterministicReasoner } from "../demo/mock/mock-reasoner";
import { assessCandidates, assessDecision } from "./materiality";
import {
  businessSnapshot,
  executeRecovery,
  planRecovery,
  readRecovery,
  SANDBOX_RECOVERY_ACTOR,
} from "./recovery";
import {
  assertFreshInvariant,
  readProof,
  REQUIRED_INVARIANTS,
  validateReceiptEvidence,
  verifyRecovery,
} from "./verification";
import { invariantResultSchema } from "../brindle/verification/invariant-result";
import { closeIncident, transitionIncident } from "../brindle/recovery/incident";
let world: TestWorld;
const db = () => world.handle.db,
  rev = ATLAS_REVISION_ID,
  actor = SANDBOX_RECOVERY_ACTOR;
beforeEach(async () => {
  world = await createMockWorld();
  await runSuccessWorld(world.deps);
  await injectAtlasRevision(db());
});
afterEach(async () => {
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
async function ready() {
  await assessCandidates(world.deps, rev);
  await planRecovery(db(), rev, actor);
  return executeRecovery(db(), rev, actor);
}
describe("M5 / independent proof and invariant-backed closure", () => {
  it("executor success leaves VERIFYING and cannot by itself close an incident", async () => {
    const p = await ready();
    expect(p.incident.status).toBe("VERIFYING");
    expect((await readProof(db(), rev)).receipt).toBeNull();
    expect(() => transitionIncident(p.incident, "RECOVERED", new Date().toISOString())).toThrow(
      "closeIncident",
    );
  });
  it("all six fresh invariants PASS before canonical closure and persisted receipt", async () => {
    await ready();
    const proof = await verifyRecovery(db(), rev);
    expect(proof.receipt!.verdict).toBe("RECOVERED");
    expect(proof.receipt!.invariantResults).toHaveLength(6);
    expect(
      proof.receipt!.invariantResults.every(
        (r) => r.status === "PASS" && r.observation.kind === "FRESH_INDEPENDENT_READ",
      ),
    ).toBe(true);
    expect(proof.recovery!.incident.status).toBe("RECOVERED");
    expect(proof.recovery!.incident.closure!.recoveryReceiptId).toBe(proof.receipt!.receiptId);
  });
  it("fresh reads see a residual violation despite all executor statuses being SUCCEEDED", async () => {
    await ready();
    await db()
      .update(t.purchaseOrders)
      .set({ status: "CREATED" })
      .where(eq(t.purchaseOrders.id, "PO-827"));
    const proof = await verifyRecovery(db(), rev);
    expect(proof.receipt!.verdict).toBe("RECOVERY_INCOMPLETE");
    expect(
      proof.receipt!.invariantResults.find((r) => r.invariantId === "prohibited-vendor-open-pos")!
        .status,
    ).toBe("FAIL");
    expect(proof.recovery!.incident.closure).toBeNull();
  });
  it("database read ERROR cannot close RECOVERED", async () => {
    await ready();
    await db().execute(
      sql.raw("ALTER TABLE receiving_allocations RENAME TO unavailable_receiving_allocations"),
    );
    try {
      const p = await verifyRecovery(db(), rev);
      expect(p.receipt!.verdict).toBe("RECOVERY_INCOMPLETE");
      expect(p.receipt!.invariantResults.every((r) => r.status === "ERROR")).toBe(true);
    } finally {
      await db().execute(
        sql.raw("ALTER TABLE unavailable_receiving_allocations RENAME TO receiving_allocations"),
      );
    }
  });
  it("unresolved execution evidence prevents a recovered receipt", async () => {
    const recovery = await ready();
    const step = recovery.steps[0]!;
    await db()
      .delete(t.recoveryEvidence)
      .where(eq(t.recoveryEvidence.id, `execution:${step.stepId}`));
    const p = await verifyRecovery(db(), rev);
    expect(p.receipt!.effectOutcomes.some((e) => e.outcome === "UNRESOLVED")).toBe(true);
    expect(p.receipt!.verdict).not.toBe("RECOVERED");
  });
  it("UNCERTAIN materiality stays escalated and cannot acquire recovery proof", async () => {
    await assessDecision(
      { db: db(), reasoner: new MockDeterministicReasoner(() => null) },
      "dec:PO-827:procurement",
      rev,
    );
    await assessCandidates(world.deps, rev);
    await planRecovery(db(), rev, actor);
    const p = await verifyRecovery(db(), rev);
    expect(p.receipt!.decisions.uncertain).toHaveLength(1);
    expect(p.receipt!.verdict).toBe("ESCALATED");
    expect(p.recovery!.incident.closure).toBeNull();
  });
  it("unique execution records enforce zero duplicate compensations", async () => {
    await ready();
    const event = (await db().select().from(t.recoveryEvidence)).find(
      (e) => e.kind === "EXECUTION",
    )!;
    await expect(
      db()
        .insert(t.recoveryEvidence)
        .values({ ...event, id: "duplicate-execution" }),
    ).rejects.toThrow();
    const p = await verifyRecovery(db(), rev);
    expect(p.metrics!.duplicateCompensations).toBe(0);
  });
  it("PO-901's entire business and receipt state survives execution and verification unchanged", async () => {
    const before = await businessSnapshot(db(), "PO-901");
    await ready();
    const p = await verifyRecovery(db(), rev);
    expect(await businessSnapshot(db(), "PO-901")).toEqual(before);
    expect(
      p.receipt!.invariantResults.find((r) => r.invariantId === "unrelated-control-preserved")!
        .status,
    ).toBe("PASS");
  });
  it("receipt decisions/steps/invariants resolve to real persisted evidence", async () => {
    await ready();
    const p = await verifyRecovery(db(), rev);
    expect(await validateReceiptEvidence(db(), p.receipt!)).toEqual(p.receipt);
    const rows = await db().select().from(t.invariantResults);
    expect(rows.map((r) => r.id).sort()).toEqual(
      p.receipt!.invariantResults.map((r) => r.resultId).sort(),
    );
    expect(p.receipt!.effectOutcomes.flatMap((e) => e.stepIds).sort()).toEqual(
      p.recovery!.steps.map((s) => s.stepId).sort(),
    );
  });
  it("receipt for a different incident is rejected", async () => {
    await ready();
    const { receipt } = await verifyRecovery(db(), rev);
    await expect(
      validateReceiptEvidence(db(), {
        ...receipt!,
        incidentId: "other",
        invariantResults: receipt!.invariantResults.map((r) => ({ ...r, incidentId: "other" })),
      }),
    ).rejects.toThrow();
  });
  it("omitting a required invariant is rejected", async () => {
    await ready();
    const { receipt } = await verifyRecovery(db(), rev);
    await expect(
      validateReceiptEvidence(db(), {
        ...receipt!,
        requiredInvariantIds: REQUIRED_INVARIANTS.slice(1),
      }),
    ).rejects.toThrow("REQUIRED_INVARIANTS");
  });
  it("executor response and stale observations cannot masquerade as fresh read evidence", async () => {
    await ready();
    const { receipt } = await verifyRecovery(db(), rev);
    const r = receipt!.invariantResults[0]!;
    expect(
      invariantResultSchema.safeParse({
        ...r,
        observation: { ...r.observation, kind: "EXECUTOR_RESPONSE" },
      }).success,
    ).toBe(false);
    expect(() =>
      assertFreshInvariant(
        { ...r, observation: { ...r.observation, observedAt: "2000-01-01T00:00:00Z" } },
        r.verifiedAt,
        null,
      ),
    ).toThrow("STALE");
    expect(() =>
      assertFreshInvariant(
        { ...r, observation: { ...r.observation, source: "executor" } },
        r.observation.observedAt,
        null,
      ),
    ).toThrow("UNREGISTERED");
  });
  it("repeated terminal verification reuses immutable proof and does not append contradictory results", async () => {
    await ready();
    const first = await verifyRecovery(db(), rev);
    const rows = await db().select().from(t.invariantResults);
    const again = await verifyRecovery(db(), rev);
    expect(again.receipt).toEqual(first.receipt);
    expect(await db().select().from(t.invariantResults)).toEqual(rows);
    expect(again.receipts).toHaveLength(1);
  });
  it("bounded repair/retry can close only after a subsequent fresh passing read", async () => {
    await ready();
    await db()
      .update(t.purchaseOrders)
      .set({ status: "CREATED" })
      .where(eq(t.purchaseOrders.id, "PO-827"));
    expect((await verifyRecovery(db(), rev)).receipt!.verdict).toBe("RECOVERY_INCOMPLETE");
    await db()
      .update(t.purchaseOrders)
      .set({ status: "CANCELLED" })
      .where(eq(t.purchaseOrders.id, "PO-827"));
    await executeRecovery(db(), rev, actor);
    const p = await verifyRecovery(db(), rev);
    expect(p.receipts).toHaveLength(2);
    expect(p.receipt!.verdict).toBe("RECOVERED");
    expect(p.receipt!.invariantResults.every((r) => r.status === "PASS")).toBe(true);
  });
  it("three failed verification attempts escalate rather than loop autonomously", async () => {
    await ready();
    await db()
      .update(t.purchaseOrders)
      .set({ status: "CREATED" })
      .where(eq(t.purchaseOrders.id, "PO-827"));
    for (let i = 0; i < 3; i++) {
      if (i) await executeRecovery(db(), rev, actor);
      const p = await verifyRecovery(db(), rev);
      expect(p.receipt!.verdict).toBe(i === 2 ? "ESCALATED" : "RECOVERY_INCOMPLETE");
    }
    expect((await readRecovery(db(), rev))!.incident.status).toBe("ESCALATED");
    await expect(executeRecovery(db(), rev, actor)).rejects.toThrow("ESCALATED");
  });
  it("unhandled or erased irreversible notification remains a violation", async () => {
    await ready();
    await db().delete(t.supplierNotifications).where(eq(t.supplierNotifications.poId, "PO-827"));
    const p = await verifyRecovery(db(), rev);
    expect(
      p.receipt!.invariantResults.find(
        (r) => r.invariantId === "irreversible-consequences-handled",
      )!.status,
    ).toBe("FAIL");
    expect(p.receipt!.verdict).not.toBe("RECOVERED");
  });
  it("tampering with the control prevents recovered closure", async () => {
    await ready();
    await db()
      .update(t.purchaseOrders)
      .set({ amountCents: 1 })
      .where(eq(t.purchaseOrders.id, "PO-901"));
    const p = await verifyRecovery(db(), rev);
    expect(
      p.receipt!.invariantResults.find((r) => r.invariantId === "unrelated-control-preserved")!
        .status,
    ).toBe("FAIL");
  });
  it("cannot verify a plan that has not executed", async () => {
    await assessCandidates(world.deps, rev);
    await planRecovery(db(), rev, actor);
    await expect(verifyRecovery(db(), rev)).rejects.toThrow("REQUIRES_EXECUTED");
    expect(await db().select().from(t.recoveryReceipts)).toHaveLength(0);
  });
  it("canonical metrics come from persisted evidence", async () => {
    await ready();
    const p = await verifyRecovery(db(), rev);
    expect(p.metrics).toEqual({
      consequencesExamined: 10,
      materiallyAffected: 4,
      preservedDecisions: 4,
      automaticallyRecovered: 3,
      safelyRemediated: 1,
      residualViolations: 0,
      duplicateCompensations: 0,
    });
  });
  it("closeIncident rejects a non-VERIFYING or different-incident proof", async () => {
    await ready();
    const p = await verifyRecovery(db(), rev);
    expect(() =>
      closeIncident(p.recovery!.incident, p.receipt!, new Date().toISOString()),
    ).toThrow();
  });
});
