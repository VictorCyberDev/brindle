import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as t from "../db/schema";
import { createMockWorld, type TestWorld } from "../test-support/world";
import { runSuccessWorld } from "../demo/run";
import { ATLAS_REVISION_ID, injectAtlasRevision } from "../demo/temporal";
import { loadTruthByRefs, readDemoState } from "../demo/store";
import { createTruthRevision } from "../brindle/truth/revision";
import { blastRadius, buildConsequenceGraph, ingestRevision, truthAsKnownAt } from "./temporal";

let world: TestWorld;
beforeEach(async () => {
  world = await createMockWorld();
  await runSuccessWorld(world.deps);
});
afterEach(async () => {
  await world.handle.db.delete(t.consequenceEdges);
  await world.handle.db.delete(t.consequenceNodes);
  await world.handle.db.delete(t.truthRevisions);
});
const db = () => world.handle.db;
async function counts() {
  const tables = [t.truthAssertions, t.truthRevisions, t.consequenceNodes, t.consequenceEdges];
  return Promise.all(
    tables.map(
      async (table) =>
        (
          await db()
            .select({ n: sql<number>`count(*)::int` })
            .from(table)
        )[0]!.n,
    ),
  );
}
async function revise(from: string, to: string | null = null, observed = "2026-10-24T12:00:00Z") {
  const [row] = await db()
    .select()
    .from(t.truthAssertions)
    .where(eq(t.truthAssertions.factKey, "certification.ISO-9001"));
  const all = await db()
    .select()
    .from(t.truthAssertions)
    .where(eq(t.truthAssertions.subjectId, "SUP-ATLAS"));
  const cert = all.find((a) => a.factKey === "certification.ISO-9001" && a.version === 1)!;
  expect(row).toBeDefined();
  const [old] = await loadTruthByRefs(db(), [{ assertionId: cert.assertionId, version: 1 }]);
  const replacement = {
    ...old!,
    truthVersionId: `${cert.assertionId}@v2`,
    version: 2,
    validFrom: from,
    validTo: to,
    observedAt: observed,
    value: { status: "REVOKED" },
    provenance: { recordedBy: "test:correction", sourceRecordRef: "test:source" },
  };
  const input = {
    revisionId: "test:revision",
    previous: { assertionId: cert.assertionId, version: 1 },
    replacement: { assertionId: cert.assertionId, version: 2 },
    effectiveFrom: from,
    effectiveTo: to,
    observedAt: observed,
  };
  await buildConsequenceGraph(db());
  await ingestRevision(db(), input, replacement);
  return { input, replacement, old: old! };
}

describe("M2 / persisted PostgreSQL temporal consequences", () => {
  it("A: reconstructs world time separately from knowledge time and preserves old rows", async () => {
    const { old, replacement } = await revise("2026-10-19T00:00:00Z", "2026-10-23T00:00:00Z");
    expect(
      await truthAsKnownAt(db(), old.assertionId, "2026-10-22T12:00:00Z", "2026-10-23T12:00:00Z"),
    ).toEqual(old);
    expect(
      (await truthAsKnownAt(db(), old.assertionId, "2026-10-22T12:00:00Z", "2026-10-25T00:00:00Z"))
        ?.truthVersionId,
    ).toBe(replacement.truthVersionId);
    expect(
      (await truthAsKnownAt(db(), old.assertionId, "2026-10-18T00:00:00Z", "2026-10-25T00:00:00Z"))
        ?.truthVersionId,
    ).toBe(old.truthVersionId);
    expect(
      (await truthAsKnownAt(db(), old.assertionId, "2026-10-23T00:00:00Z", "2026-10-25T00:00:00Z"))
        ?.truthVersionId,
    ).toBe(old.truthVersionId);
    expect(
      await truthAsKnownAt(db(), old.assertionId, "2026-10-22T12:00:00Z", "2026-10-21T00:00:00Z"),
    ).toBeNull();
    expect(
      (await loadTruthByRefs(db(), [{ assertionId: old.assertionId, version: 1 }]))[0],
    ).toEqual(old);
  });
  it("B: derives retroactive status and persists SUPERSEDES replacement → previous", async () => {
    const result = await injectAtlasRevision(db());
    expect(result!.revision.retroactive).toBe(true);
    const edges = await db()
      .select()
      .from(t.consequenceEdges)
      .where(eq(t.consequenceEdges.type, "SUPERSEDES"));
    expect(edges).toHaveLength(1);
    expect(edges[0]!.fromNodeId).toContain("@v2");
    expect(edges[0]!.toNodeId).toContain("@v1");
  });
  it("C: equal instants are not retroactive", async () => {
    const { input } = await revise("2026-10-24T12:00:00Z");
    expect(createTruthRevision(input).retroactive).toBe(false);
  });
  it("D: future-only correction excludes historical decisions despite lineage", async () => {
    await revise("2026-10-25T00:00:00Z");
    expect(await blastRadius(db(), "test:revision")).toEqual([]);
  });
  it("D: upper endpoint is exclusive and filters every decision boundary", async () => {
    await revise("2026-10-19T00:00:00Z", "2026-10-22T12:00:00Z");
    expect(await blastRadius(db(), "test:revision")).toEqual([]);
  });
  it("E/F: Atlas reaches PO-827's 3 decisions, 3 actions, 4 business objects; PO-901 stays outside", async () => {
    const result = (await injectAtlasRevision(db()))!;
    expect(result.candidates).toHaveLength(10);
    expect(result.candidates.filter((c) => c.kind === "DECISION")).toHaveLength(3);
    expect(result.candidates.filter((c) => c.kind === "ACTION")).toHaveLength(3);
    expect(result.candidates.filter((c) => c.kind === "BUSINESS_OBJECT")).toHaveLength(4);
    expect(result.candidates.every((c) => !c.id.includes("PO-901"))).toBe(true);
    expect(result.control.outside).toBe(true);
    expect(result.control.refs).toHaveLength(10);
  });
  it("G: duplicate ingestion creates zero duplicate truth/revision/nodes/edges", async () => {
    const { input, replacement } = await revise("2026-10-19T00:00:00Z");
    const before = await counts();
    await ingestRevision(db(), input, replacement);
    expect(await counts()).toEqual(before);
  });
  it("G: duplicate ID with different evidence is rejected atomically", async () => {
    const { input, replacement } = await revise("2026-10-19T00:00:00Z");
    const before = await counts();
    await expect(ingestRevision(db(), input, { ...replacement, value: "other" })).rejects.toThrow(
      "incompatible payload",
    );
    expect(await counts()).toEqual(before);
  });
  it("rejects mismatched identity, interval, source, and conflicting predecessor", async () => {
    const { input, replacement } = await revise("2026-10-19T00:00:00Z");
    await expect(
      ingestRevision(db(), input, { ...replacement, sourceId: "other" }),
    ).rejects.toThrow("incompatible");
    await expect(
      ingestRevision(db(), input, { ...replacement, validFrom: "2026-10-20T00:00:00Z" }),
    ).rejects.toThrow("mismatch");
    await expect(
      ingestRevision(db(), { ...input, revisionId: "conflicting" }, replacement),
    ).rejects.toThrow("already revised");
    await expect(
      ingestRevision(
        db(),
        { ...input, previous: { ...input.previous, assertionId: "other" } },
        replacement,
      ),
    ).rejects.toThrow();
  });
  it("H: repeated graph construction leaves identical graph counts", async () => {
    await buildConsequenceGraph(db());
    const before = await counts();
    await buildConsequenceGraph(db());
    expect(await counts()).toEqual(before);
  });
  it("I/J/K: diamonds deduplicate, cycles terminate, ordering and path evidence repeat exactly", async () => {
    await injectAtlasRevision(db());
    const initial = await blastRadius(db(), ATLAS_REVISION_ID);
    const a = initial.find((c) => c.kind === "ACTION")!;
    const d = initial.find((c) => c.kind === "DECISION")!;
    await db()
      .insert(t.consequenceEdges)
      .values([
        { id: "test:cycle", fromNodeId: a.id, toNodeId: d.id, type: "CAUSED" },
        {
          id: "test:diamond",
          fromNodeId: d.id,
          toNodeId: initial.find((c) => c.kind === "BUSINESS_OBJECT")!.id,
          type: "CAUSED",
        },
      ]);
    const result = await blastRadius(db(), ATLAS_REVISION_ID);
    expect(result).toHaveLength(10);
    expect(new Set(result.map((c) => c.id)).size).toBe(10);
    expect(result.every((c) => new Set(c.path).size === c.path.length)).toBe(true);
    expect(await blastRadius(db(), ATLAS_REVISION_ID)).toEqual(result);
  });
  it("L/M/N: candidate-only output, no materiality or recovery writes, M1 business state unchanged", async () => {
    const before = await readDemoState(db());
    const calls = world.reasoner.calls.length;
    const result = (await injectAtlasRevision(db()))!;
    expect(result.candidates.every((c) => c.status === "CANDIDATE" && !("result" in c))).toBe(true);
    expect((await readDemoState(db())).purchaseOrders).toEqual(before.purchaseOrders);
    expect(world.reasoner.calls.length).toBe(calls);
    for (const table of [
      t.counterfactualAssessments,
      t.incidents,
      t.recoverySteps,
      t.recoveryReceipts,
    ])
      expect(await db().select().from(table)).toHaveLength(0);
    expect((await runSuccessWorld(world.deps)).status).toBe("ALREADY_COMPLETE");
  });
});
