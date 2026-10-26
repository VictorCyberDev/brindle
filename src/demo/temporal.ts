import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import * as t from "../db/schema";
import { loadTruthByRefs } from "./store";
import { blastRadius, buildConsequenceGraph, ingestRevision } from "../services/temporal";

export const ATLAS_REVISION_ID = "demo:atlas-certification-revoked:v2";
export const CEDAR_REVISION_ID = "demo:cedar-certification-revoked:v2";

export interface RevocationScenario {
  revisionId: string;
  supplierId: string;
  /** PO whose procurement decision relied on the certification. */
  poId: string;
}
export const ATLAS_SCENARIO: RevocationScenario = {
  revisionId: ATLAS_REVISION_ID,
  supplierId: "SUP-ATLAS",
  poId: "PO-827",
};
export const CEDAR_SCENARIO: RevocationScenario = {
  revisionId: CEDAR_REVISION_ID,
  supplierId: "SUP-CEDAR",
  poId: "PO-933",
};

export const injectAtlasRevision = (db: Db) => injectCertificationRevoked(db, ATLAS_SCENARIO);

/** Explicit SANDBOX injection; never calls sponsors or recovery. Uses the persisted decision clock. */
export async function injectCertificationRevoked(db: Db, scenario: RevocationScenario) {
  const revisionId = scenario.revisionId;
  const [receipt] = await db
    .select()
    .from(t.decisionReceipts)
    .where(eq(t.decisionReceipts.id, `dec:${scenario.poId}:procurement`));
  const [control] = await db
    .select()
    .from(t.purchaseOrders)
    .where(eq(t.purchaseOrders.id, "PO-901"));
  if (!receipt || !control) throw new Error("run the successful sandbox world first");
  const all = await db
    .select()
    .from(t.truthAssertions)
    .where(eq(t.truthAssertions.subjectId, scenario.supplierId));
  const cert = all.find((a) => a.factKey === "certification.ISO-9001" && a.version === 1);
  if (!cert) throw new Error("certification v1 is missing");
  const [previous] = await loadTruthByRefs(db, [{ assertionId: cert.assertionId, version: 1 }]);
  if (
    !previous ||
    !previous.value ||
    typeof previous.value !== "object" ||
    Array.isArray(previous.value)
  )
    throw new Error("certification payload is malformed");
  const effectiveFrom = new Date(receipt.decidedAt.getTime() - 3 * 86400000).toISOString();
  const observedAt = new Date(
    Math.max(receipt.decidedAt.getTime() + 2 * 86400000, cert.observedAt.getTime() + 1),
  ).toISOString();
  await buildConsequenceGraph(db);
  await ingestRevision(
    db,
    {
      revisionId: revisionId,
      previous: { assertionId: previous.assertionId, version: 1 },
      replacement: { assertionId: previous.assertionId, version: 2 },
      effectiveFrom,
      effectiveTo: previous.validTo,
      observedAt,
    },
    {
      ...previous,
      truthVersionId: `${previous.assertionId}@v2`,
      version: 2,
      value: { ...previous.value, status: "REVOKED" },
      validFrom: effectiveFrom,
      observedAt,
      provenance: { recordedBy: "SANDBOX:M2-injection", sourceRecordRef: revisionId },
    },
  );
  return readTemporalDemo(db, revisionId);
}

export async function readTemporalDemo(db: Db, revisionId: string = ATLAS_REVISION_ID) {
  const [revision] = await db
    .select()
    .from(t.truthRevisions)
    .where(eq(t.truthRevisions.id, revisionId));
  if (!revision) return null;
  const truth = await loadTruthByRefs(db, [
    { assertionId: revision.previousAssertionId, version: revision.previousVersion },
    { assertionId: revision.replacementAssertionId, version: revision.replacementVersion },
  ]);
  const nodes = await db.select().from(t.consequenceNodes).orderBy(t.consequenceNodes.id);
  const edges = await db.select().from(t.consequenceEdges).orderBy(t.consequenceEdges.id);
  const candidates = await blastRadius(db, revision.id);
  const controlRefs = nodes
    .filter(
      (n) =>
        n.label?.includes("PO-901") ||
        (n.attributes as { targetId?: string }).targetId === "PO-901",
    )
    .map((n) => n.id);
  return {
    revision: {
      id: revision.id,
      effectiveFrom: revision.effectiveFrom.toISOString(),
      effectiveTo: revision.effectiveTo?.toISOString() ?? null,
      observedAt: revision.observedAt.toISOString(),
      retroactive: revision.retroactive,
    },
    truth,
    nodes,
    edges,
    candidates,
    control: {
      poId: "PO-901",
      refs: controlRefs,
      outside:
        controlRefs.length > 0 && controlRefs.every((id) => !candidates.some((c) => c.id === id)),
    },
  };
}
