import { count, eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { afterEach, describe, expect, it } from "vitest";
import * as t from "../db/schema";
import { createMockWorld, seedWith, type TestWorld } from "../test-support/world";
import { MOCK_MODEL_ID } from "./mock/mock-reasoner";
import { MOCK_TRUTH_SOURCE_ID } from "./mock/mock-fixture-truth";
import { PartialSandboxStateError, runSuccessWorld } from "./run";
import { getReceipt, loadTruthByRefs, readDemoState, resetSandbox } from "./store";

let world: TestWorld | undefined;
afterEach(async () => {
  await world?.close();
  world = undefined;
});

const rowCount = async (w: TestWorld, table: PgTable) =>
  (await w.handle.db.select({ n: count() }).from(table))[0]!.n;

describe("successful agent world (MOCK, real orchestration and real PostgreSQL semantics)", () => {
  it("creates exactly one PO-827 and walks it through finance and operations", async () => {
    world = await createMockWorld();
    const result = await runSuccessWorld(world.deps);
    expect(result.status).toBe("COMPLETED");

    const state = await readDemoState(world.handle.db);
    const po827 = state.purchaseOrders.filter((p) => p.po.poId === "PO-827");
    expect(po827).toHaveLength(1);
    expect(po827[0]!.po).toMatchObject({
      supplierName: "Atlas Components",
      status: "RECEIVING_SCHEDULED",
    });
    expect(po827[0]!.approval?.poId).toBe("PO-827");
    expect(po827[0]!.allocation?.dockId).toBe("DOCK-3");
  });

  it("records the supplier notification as a sandbox record only", async () => {
    world = await createMockWorld();
    await runSuccessWorld(world.deps);
    const state = await readDemoState(world.handle.db);
    const n = state.purchaseOrders[0]!.notification!;
    expect(n.channel).toBe("SANDBOX_RECORD");
    expect(n.subject).toMatch(/^\[SANDBOX\]/);
    // The database itself refuses any other channel.
    await expect(
      world.handle.db.insert(t.supplierNotifications).values({
        id: "x",
        poId: "PO-827",
        supplierId: "s",
        channel: "EMAIL",
        subject: "s",
        decisionId: "dec:PO-827:operations",
        recordedAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  it("re-running does not duplicate business state or call the model again", async () => {
    world = await createMockWorld();
    await runSuccessWorld(world.deps);
    const callsAfterFirst = world.reasoner.calls.length;
    const second = await runSuccessWorld(world.deps);
    expect(second.status).toBe("ALREADY_COMPLETE");
    expect(world.reasoner.calls.length).toBe(callsAfterFirst);
    expect(await rowCount(world, t.purchaseOrders)).toBe(2);
    expect(await rowCount(world, t.decisionReceipts)).toBe(6);
  });

  it("refuses to continue from partially populated state until reset", async () => {
    world = await createMockWorld();
    await runSuccessWorld(world.deps);
    await world.handle.db.delete(t.supplierNotifications);
    await world.handle.db.delete(t.receivingAllocations);
    await world.handle.db
      .update(t.purchaseOrders)
      .set({ status: "APPROVED" })
      .where(eq(t.purchaseOrders.id, "PO-827"));
    await expect(runSuccessWorld(world.deps)).rejects.toBeInstanceOf(PartialSandboxStateError);
    await resetSandbox(world.handle.db);
    expect((await runSuccessWorld(world.deps)).status).toBe("COMPLETED");
  });

  it("persists three DecisionReceipts for PO-827 (procurement, finance, operations)", async () => {
    world = await createMockWorld();
    await runSuccessWorld(world.deps);
    const state = await readDemoState(world.handle.db);
    expect(state.purchaseOrders.find((p) => p.po.poId === "PO-827")!.decisionReceiptCount).toBe(3);
    const agents = new Set<string>();
    for (const step of ["procurement", "finance", "operations"]) {
      const receipt = (await getReceipt(world.handle.db, `dec:PO-827:${step}`))!;
      agents.add(receipt.agentId);
      expect(receipt.modelId).toBe(MOCK_MODEL_ID);
      expect(receipt.policyVersion).toBe("proc-policy-v1");
      expect(receipt.memoryRefs).toEqual([]);
      expect(receipt.traceId).toBe("trace:run-test");
      expect(receipt.evidence.length).toBeGreaterThan(0);
    }
    expect(agents).toEqual(new Set(["agent.procurement", "agent.finance", "agent.operations"]));
  });

  it("DecisionReceipt truthRefs resolve to persisted, normalized truth from the recorded source", async () => {
    world = await createMockWorld();
    await runSuccessWorld(world.deps);
    for (const id of ["dec:PO-827:procurement", "dec:PO-827:finance", "dec:PO-827:operations"]) {
      const receipt = (await getReceipt(world.handle.db, id))!;
      const persisted = await loadTruthByRefs(world.handle.db, receipt.truthRefs);
      expect(persisted).toHaveLength(receipt.truthRefs.length);
      for (const a of persisted) expect(a.sourceId).toBe(MOCK_TRUTH_SOURCE_ID);
      const facts = persisted.map((a) => a.factKey);
      expect(facts).toContain("supplier.enabled");
      expect(facts).toContain("certification.ISO-9001");
      expect(facts).toContain("policy.procurement");
    }
  });

  it("keeps PO-901 structurally independent from Atlas and PO-827", async () => {
    world = await createMockWorld();
    await runSuccessWorld(world.deps);
    const state = await readDemoState(world.handle.db);
    const control = state.purchaseOrders.find((p) => p.po.poId === "PO-901")!;
    expect(control.po.supplierId).not.toBe("SUP-ATLAS");
    expect(control.decisionReceiptCount).toBe(3);

    const supplierRefs = async (poId: string) => {
      const refs = (await getReceipt(world!.handle.db, `dec:${poId}:procurement`))!.truthRefs;
      return (await loadTruthByRefs(world!.handle.db, refs)).filter(
        (a) => a.subject.entityType === "supplier",
      );
    };
    const atlas = await supplierRefs("PO-827");
    const boreal = await supplierRefs("PO-901");
    expect(atlas.every((a) => a.subject.entityId === "SUP-ATLAS")).toBe(true);
    expect(boreal.every((a) => a.subject.entityId === "SUP-BOREAL")).toBe(true);
    expect(new Set(atlas.map((a) => a.assertionId)).size).toBeGreaterThan(0);
    const atlasIds = new Set(atlas.map((a) => a.assertionId));
    expect(boreal.some((a) => atlasIds.has(a.assertionId))).toBe(false);

    // No receipt, approval, allocation or notification is shared between the two POs.
    const refsOf = async (poId: string) =>
      (await getReceipt(world!.handle.db, `dec:${poId}:finance`))!.chosenAction.parameters.poId;
    expect(await refsOf("PO-827")).toBe("PO-827");
    expect(await refsOf("PO-901")).toBe("PO-901");
  });

  it("makes MOCK distinguishable from LIVE in recorded data", async () => {
    world = await createMockWorld();
    await runSuccessWorld(world.deps);
    const run = (await readDemoState(world.handle.db)).latestRun!;
    expect(run.mode).toBe("MOCK");
    expect(run.truthSourceId).toBe(MOCK_TRUTH_SOURCE_ID);
    expect(run.truthSourceId).not.toBe("zetaris");
    expect(run.modelId).toMatch(/^MOCK:/);
    expect(run.reasoningProvider).toBe("MOCK");
  });

  it("reset clears Brindle's sandbox state only", async () => {
    world = await createMockWorld();
    await runSuccessWorld(world.deps);
    await resetSandbox(world.handle.db);
    for (const table of [
      t.purchaseOrders,
      t.decisionReceipts,
      t.truthAssertions,
      t.demoRuns,
      t.supplierNotifications,
    ]) {
      expect(await rowCount(world, table)).toBe(0);
    }
  });
});

describe("deterministic authorization overrides the model", () => {
  const selectAnyway = (call: { defaultOutput: Record<string, unknown> }) => call.defaultOutput;

  it("blocks a disabled supplier even though the model proposes selection", async () => {
    world = await createMockWorld({
      tables: seedWith((tbl) => (tbl.supplier_master![0]!.enabled = "false")),
      override: selectAnyway,
    });
    const result = await runSuccessWorld(world.deps);
    expect(result).toMatchObject({
      status: "BLOCKED",
      actor: "PROCUREMENT",
      poId: "PO-827",
      code: "SUPPLIER_INELIGIBLE",
    });
    expect((result as { reasons: string[] }).reasons).toContain("SUPPLIER_DISABLED");
    expect(world.reasoner.calls[0]!.defaultOutput.decision).toBe("SELECT_SUPPLIER");
    expect(await rowCount(world, t.purchaseOrders)).toBe(0);
    expect(await rowCount(world, t.decisionReceipts)).toBe(0);
    expect((await readDemoState(world.handle.db)).latestRun?.status).toBe("BLOCKED");
  });

  it("blocks an expired or invalid certification even though the model proposes selection", async () => {
    for (const edit of [
      (tbl: Record<string, Record<string, unknown>[]>) =>
        (tbl.supplier_certifications![0]!.valid_to = "2026-01-01T00:00:00Z"),
      (tbl: Record<string, Record<string, unknown>[]>) =>
        (tbl.supplier_certifications![0]!.status = "EXPIRED"),
      (tbl: Record<string, Record<string, unknown>[]>) =>
        (tbl.supplier_certifications![0]!.valid_from = "2027-01-01T00:00:00Z"),
    ]) {
      world = await createMockWorld({ tables: seedWith(edit), override: selectAnyway });
      const result = await runSuccessWorld(world.deps);
      expect(result).toMatchObject({
        status: "BLOCKED",
        actor: "PROCUREMENT",
        code: "SUPPLIER_INELIGIBLE",
      });
      expect(await rowCount(world, t.purchaseOrders)).toBe(0);
      await world.close();
      world = undefined;
    }
  });

  it("blocks a supplier whose certification row is missing", async () => {
    world = await createMockWorld({
      tables: seedWith((tbl) => tbl.supplier_certifications!.splice(0, 1)),
      override: selectAnyway,
    });
    const result = await runSuccessWorld(world.deps);
    expect((result as { reasons: string[] }).reasons).toContain("CERTIFICATION_MISSING");
  });

  it("rejects malformed model output before anything is written", async () => {
    for (const bad of [
      { decision: "SELECT_SUPPLIER" },
      "not even an object",
      {
        decision: "SELECT_SUPPLIER",
        target: "SUP-ATLAS",
        rationale: { summary: "s", factors: [] },
        confidence: 0.9,
      },
      {
        decision: "SELECT_SUPPLIER",
        target: "SUP-ATLAS",
        rationale: { summary: "s", factors: [{ factor: "f", evidenceIds: ["ev-1"] }] },
        confidence: 7,
      },
      {
        decision: "SELECT_SUPPLIER",
        target: "SUP-ATLAS",
        rationale: { summary: "s", factors: [{ factor: "f", evidenceIds: ["ev-1"] }] },
        confidence: 0.9,
        chainOfThought: "private",
      },
    ]) {
      world = await createMockWorld({ override: () => bad });
      const result = await runSuccessWorld(world.deps);
      expect(result).toMatchObject({ status: "BLOCKED", code: "MODEL_OUTPUT_INVALID" });
      expect(await rowCount(world, t.purchaseOrders)).toBe(0);
      await world.close();
      world = undefined;
    }
  });

  it("rejects an unsupported action name", async () => {
    world = await createMockWorld({
      override: (c) => ({ ...c.defaultOutput, decision: "WIRE_FUNDS_TO_ACCOUNT" }),
    });
    expect(await runSuccessWorld(world.deps)).toMatchObject({
      status: "BLOCKED",
      code: "MODEL_OUTPUT_INVALID",
    });
    expect(await rowCount(world, t.purchaseOrders)).toBe(0);
  });

  it("rejects a proposal that cites evidence the model was never shown", async () => {
    world = await createMockWorld({
      override: (c) => ({
        ...c.defaultOutput,
        rationale: { summary: "s", factors: [{ factor: "f", evidenceIds: ["ev-invented"] }] },
      }),
    });
    expect(await runSuccessWorld(world.deps)).toMatchObject({
      status: "BLOCKED",
      code: "UNKNOWN_EVIDENCE_CITED",
    });
  });

  it("rejects a proposal aimed at a different target", async () => {
    world = await createMockWorld({
      override: (c) => ({ ...c.defaultOutput, target: "SUP-SOMEONE-ELSE" }),
    });
    expect(await runSuccessWorld(world.deps)).toMatchObject({
      status: "BLOCKED",
      code: "TARGET_MISMATCH",
    });
  });

  it("a model that declines stops the flow without any business effect", async () => {
    world = await createMockWorld({
      override: (c) => ({ ...c.defaultOutput, decision: "DECLINE_SUPPLIER" }),
    });
    expect(await runSuccessWorld(world.deps)).toMatchObject({
      status: "BLOCKED",
      code: "MODEL_DECLINED",
    });
    expect(await rowCount(world, t.purchaseOrders)).toBe(0);
  });
});
