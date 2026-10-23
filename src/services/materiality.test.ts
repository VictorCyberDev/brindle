import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as t from "../db/schema";
import { createMockWorld, type TestWorld } from "../test-support/world";
import { runSuccessWorld } from "../demo/run";
import { injectAtlasRevision, ATLAS_REVISION_ID } from "../demo/temporal";
import { MockDeterministicReasoner } from "../demo/mock/mock-reasoner";
import {
  actionFromProposal,
  assessCandidates,
  assessDecision,
  compareActions,
  readMateriality,
  reconstructDecision,
} from "./materiality";
import { getReceipt } from "../demo/store";
let world: TestWorld;
beforeEach(async () => {
  world = await createMockWorld();
  await runSuccessWorld(world.deps);
  await injectAtlasRevision(world.handle.db);
});
afterEach(async () => {
  const db = world.handle.db;
  await db.delete(t.counterfactualAssessments);
  await db.delete(t.consequenceEdges);
  await db.delete(t.consequenceNodes);
  await db.delete(t.truthRevisions);
});
const db = () => world.handle.db;
const rev = ATLAS_REVISION_ID;
const proc = "dec:PO-827:procurement",
  ops = "dec:PO-827:operations";
describe("M3 / immutable historical materiality", () => {
  it("rejects direct assessment of the unrelated control", async () => {
    await expect(assessDecision(world.deps, "dec:PO-901:procurement", rev)).rejects.toThrow(
      "outside candidate",
    );
    expect(await db().select().from(t.counterfactualAssessments)).toHaveLength(0);
  });
  it("substitutes only the specific superseded fact and leaves unrelated original facts byte-equivalent", async () => {
    const c = await reconstructDecision(db(), proc, rev);
    for (let i = 0; i < c.originalTruth.length; i++) {
      const a = c.originalTruth[i]!;
      expect(c.correctedTruth[i]).toEqual(
        a.factKey === "certification.ISO-9001" ? c.replacement : a,
      );
    }
    expect(c.receipt.modelId).toBe("MOCK:deterministic-reasoner");
  });
  it("cannot leak current truth, current policy, current PO state into frozen inputs", async () => {
    const before = await reconstructDecision(db(), ops, rev);
    await db()
      .update(t.purchaseOrders)
      .set({ description: "TODAY", amountCents: 1 })
      .where(eq(t.purchaseOrders.id, "PO-827"));
    const policy = before.originalTruth.find((a) => a.factKey === "policy.procurement")!;
    await db()
      .insert(t.truthAssertions)
      .values({
        id: "later-policy",
        assertionId: policy.assertionId,
        version: 99,
        subjectType: policy.subject.entityType,
        subjectId: policy.subject.entityId,
        sourceId: policy.sourceId,
        factKey: policy.factKey,
        value: { policyVersion: "today", maxPoAmountCents: 1 },
        validFrom: new Date("2026-10-23"),
        observedAt: new Date("2026-10-24"),
        provenance: policy.provenance,
      });
    expect(await reconstructDecision(db(), ops, rev)).toEqual(before);
  });
  it("canonical structured action equivalence determines SAME", () => {
    expect(
      compareActions(
        { actionType: "A", parameters: { a: 1, b: 2 } },
        { actionType: "A", parameters: { b: 2, a: 1 } },
      ),
    ).toBe("SAME");
  });
  it("different structured action determines CHANGED", () => {
    expect(
      compareActions({ actionType: "A", parameters: {} }, { actionType: "B", parameters: {} }),
    ).toBe("CHANGED");
  });
  it("canonical replay uses the original reasoning boundary; genuinely yields 2 CHANGED and 1 SAME", async () => {
    const before = world.reasoner.calls.length;
    const m = await assessCandidates(world.deps, rev);
    expect(world.reasoner.calls.length - before).toBe(3);
    expect(m.assessments.map((a) => a.assessment.result)).toEqual(["CHANGED", "SAME", "CHANGED"]);
    expect(m.complete).toBe(true);
    expect(
      m.consequences
        .filter((c) => c.kind === "BUSINESS_OBJECT")
        .every((c) => c.treatment === "M4_ANALYSIS"),
    ).toBe(true);
    expect(world.reasoner.calls.at(-1)!.input.originalDecisionTime).toBeDefined();
  });
  it("deterministic authorization replay never calls a model", async () => {
    const c = await reconstructDecision(db(), proc, rev);
    const before = world.reasoner.calls.length;
    const a = actionFromProposal(c, {
      decision: "SELECT_SUPPLIER",
      target: c.request.supplierId,
      rationale: { summary: "evidence", factors: [{ factor: "cert", evidenceIds: ["ev-1"] }] },
      confidence: 1,
    });
    expect(a).toMatchObject({ actionType: "DECLINE_SUPPLIER" });
    expect(world.reasoner.calls.length).toBe(before);
  });
  it("explicit reasoner uncertainty remains UNCERTAIN", async () => {
    const reasoner = new MockDeterministicReasoner((c) => ({
      ...c.defaultOutput,
      uncertainty: "insufficient evidence",
    }));
    expect((await assessDecision({ db: db(), reasoner }, proc, rev)).assessment.result).toBe(
      "UNCERTAIN",
    );
  });
  it("malformed reasoner output never coerces into SAME or CHANGED", async () => {
    const reasoner = new MockDeterministicReasoner(() => ({ result: "CHANGED" }));
    expect((await assessDecision({ db: db(), reasoner }, proc, rev)).assessment.result).toBe(
      "UNCERTAIN",
    );
  });
  it("missing historical business evidence becomes UNCERTAIN", async () => {
    const r = (await getReceipt(db(), ops))!;
    await db()
      .update(t.decisionReceipts)
      .set({ payload: { ...r, evidence: r.evidence.filter((e) => e.kind !== "DOCUMENT") } })
      .where(eq(t.decisionReceipts.id, ops));
    expect((await assessDecision(world.deps, ops, rev)).assessment.result).toBe("UNCERTAIN");
  });
  it("unavailable historical memory payload becomes UNCERTAIN", async () => {
    const r = (await getReceipt(db(), proc))!;
    await db()
      .update(t.decisionReceipts)
      .set({
        payload: {
          ...r,
          memoryRefs: [{ memoryId: "unavailable", kind: "DECISION_CONTEXT", version: 1 }],
        },
      })
      .where(eq(t.decisionReceipts.id, proc));
    expect((await assessDecision(world.deps, proc, rev)).assessment.result).toBe("UNCERTAIN");
  });
  it("duplicates reuse immutable assessment without another model call", async () => {
    const first = await assessDecision(world.deps, proc, rev);
    const n = world.reasoner.calls.length;
    expect(await assessDecision(world.deps, proc, rev)).toEqual(first);
    expect(world.reasoner.calls.length).toBe(n);
    expect(await db().select().from(t.counterfactualAssessments)).toHaveLength(1);
  });
  it("conflicting duplicate historical evidence is rejected", async () => {
    await assessDecision(world.deps, proc, rev);
    const r = (await getReceipt(db(), proc))!;
    await db()
      .update(t.decisionReceipts)
      .set({ payload: { ...r, objective: r.objective + " changed" } })
      .where(eq(t.decisionReceipts.id, proc));
    await expect(assessDecision(world.deps, proc, rev)).rejects.toThrow("conflicting immutable");
  });
  it("uncertain upstream parents block shared/diamond consequences despite other CHANGED parents", async () => {
    await assessDecision(
      { db: db(), reasoner: new MockDeterministicReasoner(() => null) },
      proc,
      rev,
    );
    await assessCandidates(world.deps, rev);
    const m = await readMateriality(db(), rev);
    expect(m.consequences.every((c) => c.treatment === "BLOCKED_UNCERTAIN")).toBe(true);
  });
  it("PO-901 unchanged; no effect, incident, step, or recovery receipt is written", async () => {
    const before = await db().execute(
      sql`SELECT row_to_json(p) AS row FROM purchase_orders p WHERE id='PO-901'`,
    );
    await assessCandidates(world.deps, rev);
    expect(
      await db().execute(
        sql`SELECT row_to_json(p) AS row FROM purchase_orders p WHERE id='PO-901'`,
      ),
    ).toEqual(before);
    expect(
      (await db().select().from(t.counterfactualAssessments)).every(
        (a) => !a.decisionId.includes("PO-901"),
      ),
    ).toBe(true);
    for (const table of [t.effects, t.incidents, t.recoverySteps, t.recoveryReceipts])
      expect(await db().select().from(table)).toHaveLength(0);
  });
});
