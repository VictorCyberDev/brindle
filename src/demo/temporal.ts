import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import * as t from "../db/schema";
import { loadTruthByRefs } from "./store";
import { blastRadius, buildConsequenceGraph, ingestRevision } from "../services/temporal";

export const ATLAS_REVISION_ID = "demo:atlas-certification-revoked:v2";

/** Explicit SANDBOX injection; never calls sponsors or recovery. Uses the persisted decision clock. */
export async function injectAtlasRevision(db: Db) {
  const [receipt] = await db
    .select()
    .from(t.decisionReceipts)
    .where(eq(t.decisionReceipts.id, "dec:PO-827:procurement"));
  const [control] = await db
    .select()
    .from(t.purchaseOrders)
    .where(eq(t.purchaseOrders.id, "PO-901"));
  if (!receipt || !control) throw new Error("run the successful sandbox world first");
  const all = await db
    .select()
    .from(t.truthAssertions)
    .where(eq(t.truthAssertions.subjectId, "SUP-ATLAS"));
  const cert = all.find((a) => a.factKey === "certification.ISO-9001" && a.version === 1);
  if (!cert) throw new Error("Atlas certification v1 is missing");
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
      revisionId: ATLAS_REVISION_ID,
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
      provenance: { recordedBy: "SANDBOX:M2-injection", sourceRecordRef: ATLAS_REVISION_ID },
    },
  );
  return readTemporalDemo(db);
}

export async function readTemporalDemo(db: Db) {
  const [revision] = await db
    .select()
    .from(t.truthRevisions)
    .where(eq(t.truthRevisions.id, ATLAS_REVISION_ID));
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
