import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import * as t from "../db/schema";
import { loadTruthByRefs } from "../demo/store";
import { decisionReceiptSchema } from "../brindle/receipts/decision-receipt";
import { truthAssertionSchema, type TruthAssertion } from "../brindle/truth/assertion";
import { createTruthRevision, type TruthRevision } from "../brindle/truth/revision";
import type { ConsequenceEdgeType } from "../brindle/graph/edge";
import type { ConsequenceNodeKind } from "../brindle/graph/node";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
const nodeId = (kind: ConsequenceNodeKind, ref: string) => `${kind}:${ref}`;
function queryRows<T>(result: unknown): T[] {
  // drizzle postgres-js returns an array; drizzle PGlite returns { rows }.
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows))
    return result.rows as T[];
  throw new Error("unexpected database result shape");
}
const stamp = (s: string) => new Date(s);
const canonical = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v !== null && typeof v === "object")
    return `{${Object.entries(v)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`)
      .join(",")}}`;
  return JSON.stringify(v);
};

async function node(
  tx: Tx,
  kind: ConsequenceNodeKind,
  ref: string,
  label: string,
  attributes: Record<string, string> = {},
) {
  const id = nodeId(kind, ref);
  await tx
    .insert(t.consequenceNodes)
    .values({ id, kind, refId: ref, label, attributes })
    .onConflictDoNothing();
  return id;
}
async function edge(tx: Tx, from: string, to: string, type: ConsequenceEdgeType) {
  await tx
    .insert(t.consequenceEdges)
    .values({ id: JSON.stringify([from, to, type]), fromNodeId: from, toNodeId: to, type })
    .onConflictDoNothing();
}

/** Explicit world-time AND knowledge-time reconstruction; never a latest-row query. */
export async function truthAsKnownAt(
  db: Db,
  assertionId: string,
  worldAt: string,
  knownAt: string,
): Promise<TruthAssertion | null> {
  const rows = await db.execute<{ assertion_id: string; version: number }>(sql`
    SELECT a.assertion_id, a.version FROM truth_assertions a
    WHERE a.assertion_id = ${assertionId}
      AND a.observed_at <= ${knownAt}::timestamptz
      AND a.valid_from <= ${worldAt}::timestamptz
      AND (a.valid_to IS NULL OR a.valid_to > ${worldAt}::timestamptz)
      AND NOT EXISTS (
        SELECT 1 FROM truth_revisions r
        WHERE r.previous_assertion_id = a.assertion_id AND r.previous_version = a.version
          AND r.observed_at <= ${knownAt}::timestamptz
          AND r.effective_from <= ${worldAt}::timestamptz
          AND (r.effective_to IS NULL OR r.effective_to > ${worldAt}::timestamptz)
      )
    ORDER BY a.observed_at DESC, a.version DESC LIMIT 1
  `);
  const row = queryRows<{ assertion_id: string; version: number }>(rows)[0];
  return row
    ? (await loadTruthByRefs(db, [{ assertionId: row.assertion_id, version: row.version }]))[0]!
    : null;
}

/** One atomic append, revision and SUPERSEDES edge. No business executor is called. */
export async function ingestRevision(
  db: Db,
  input: Omit<TruthRevision, "retroactive">,
  replacementInput: TruthAssertion,
): Promise<TruthRevision> {
  const revision = createTruthRevision(input);
  const replacement = truthAssertionSchema.parse(replacementInput);
  if (
    replacement.assertionId !== revision.replacement.assertionId ||
    replacement.version !== revision.replacement.version ||
    stamp(replacement.validFrom).getTime() !== stamp(revision.effectiveFrom).getTime() ||
    (replacement.validTo === null ? null : stamp(replacement.validTo).getTime()) !==
      (revision.effectiveTo === null ? null : stamp(revision.effectiveTo).getTime()) ||
    stamp(replacement.observedAt).getTime() !== stamp(revision.observedAt).getTime()
  )
    throw new Error("revision/replacement interval or identity mismatch");
  return db.transaction(async (tx) => {
    // Serialize ingestion per fact with the persisted previous row. Duplicate concurrent deliveries
    // recheck identity after the lock; conflicting payloads fail without partial writes.
    const locked = await tx.execute(
      sql`SELECT id FROM truth_assertions WHERE assertion_id = ${revision.previous.assertionId} AND version = ${revision.previous.version} FOR UPDATE`,
    );
    if (queryRows(locked).length !== 1) throw new Error("previous truth version does not exist");
    const [previous] = await loadTruthByRefs(tx, [revision.previous]);
    if (
      !previous ||
      canonical(previous.subject) !== canonical(replacement.subject) ||
      previous.sourceId !== replacement.sourceId ||
      previous.factKey !== replacement.factKey ||
      stamp(previous.observedAt) > stamp(replacement.observedAt)
    )
      throw new Error("incompatible truth revision");
    const [existing] = await tx
      .select()
      .from(t.truthRevisions)
      .where(eq(t.truthRevisions.id, revision.revisionId));
    if (existing) {
      const same =
        existing.previousAssertionId === revision.previous.assertionId &&
        existing.previousVersion === revision.previous.version &&
        existing.replacementAssertionId === revision.replacement.assertionId &&
        existing.replacementVersion === revision.replacement.version &&
        existing.effectiveFrom.getTime() === stamp(revision.effectiveFrom).getTime() &&
        (existing.effectiveTo?.getTime() ?? null) ===
          (revision.effectiveTo ? stamp(revision.effectiveTo).getTime() : null) &&
        existing.observedAt.getTime() === stamp(revision.observedAt).getTime();
      const [saved] = await loadTruthByRefs(tx, [revision.replacement]);
      // Normalize timestamp spelling before comparing immutable evidence.
      const normalized = {
        ...replacement,
        validFrom: stamp(replacement.validFrom).toISOString(),
        validTo: replacement.validTo ? stamp(replacement.validTo).toISOString() : null,
        observedAt: stamp(replacement.observedAt).toISOString(),
      };
      if (!same || canonical(saved) !== canonical(normalized))
        throw new Error("revision ID reused with incompatible payload");
      return revision;
    }
    const competing = await tx
      .select()
      .from(t.truthRevisions)
      .where(
        and(
          eq(t.truthRevisions.previousAssertionId, revision.previous.assertionId),
          eq(t.truthRevisions.previousVersion, revision.previous.version),
        ),
      );
    if (competing.length)
      throw new Error("previous version already revised; revise its replacement");
    await tx.insert(t.truthAssertions).values({
      id: replacement.truthVersionId,
      assertionId: replacement.assertionId,
      version: replacement.version,
      subjectType: replacement.subject.entityType,
      subjectId: replacement.subject.entityId,
      sourceId: replacement.sourceId,
      factKey: replacement.factKey,
      value: replacement.value,
      validFrom: stamp(replacement.validFrom),
      validTo: replacement.validTo ? stamp(replacement.validTo) : null,
      observedAt: stamp(replacement.observedAt),
      provenance: replacement.provenance,
    });
    await tx.insert(t.truthRevisions).values({
      id: revision.revisionId,
      previousAssertionId: revision.previous.assertionId,
      previousVersion: revision.previous.version,
      replacementAssertionId: revision.replacement.assertionId,
      replacementVersion: revision.replacement.version,
      effectiveFrom: stamp(revision.effectiveFrom),
      effectiveTo: revision.effectiveTo ? stamp(revision.effectiveTo) : null,
      observedAt: stamp(revision.observedAt),
      retroactive: revision.retroactive,
    });
    const oldNode = await node(
      tx,
      "TRUTH_VERSION",
      previous.truthVersionId,
      `${previous.factKey} v${previous.version}`,
    );
    const newNode = await node(
      tx,
      "TRUTH_VERSION",
      replacement.truthVersionId,
      `${replacement.factKey} v${replacement.version}`,
    );
    await edge(tx, newNode, oldNode, "SUPERSEDES");
    return revision;
  });
}

/** Rebuild exclusively from receipts and committed executor effects. No PO-specific graph seed. */
export async function buildConsequenceGraph(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    const receipts = await tx.select().from(t.decisionReceipts).orderBy(t.decisionReceipts.id);
    const pos = await tx.select().from(t.purchaseOrders);
    const approvals = await tx.select().from(t.financeApprovals);
    const allocations = await tx.select().from(t.receivingAllocations);
    const notifications = await tx.select().from(t.supplierNotifications);
    const objects = [
      ...pos.map((p) => ({
        ref: p.id,
        decision: p.createdByDecisionId,
        label: `Purchase order ${p.id}`,
        poId: p.id,
      })),
      ...approvals.map((p) => ({
        ref: p.id,
        decision: p.decisionId,
        label: `Finance approval ${p.poId}`,
        poId: p.poId,
      })),
      ...allocations.map((p) => ({
        ref: p.id,
        decision: p.decisionId,
        label: `Receiving allocation ${p.poId}`,
        poId: p.poId,
      })),
      ...notifications.map((p) => ({
        ref: p.id,
        decision: p.decisionId,
        label: `Sandbox notification ${p.poId}`,
        poId: p.poId,
      })),
    ];
    for (const obj of objects)
      await node(tx, "BUSINESS_OBJECT", obj.ref, obj.label, { poId: obj.poId });
    for (const row of receipts) {
      const r = decisionReceiptSchema.parse(row.payload);
      const effects = objects.filter((o) => o.decision === r.decisionId);
      const d = await node(
        tx,
        "DECISION",
        r.decisionId,
        `${effects[0]?.poId ?? r.targetEntity.entityId} · ${r.agentId}`,
        { decidedAt: r.decidedAt, traceId: r.traceId, targetId: r.targetEntity.entityId },
      );
      for (const a of await loadTruthByRefs(tx, r.truthRefs)) {
        const truth = await node(
          tx,
          "TRUTH_VERSION",
          a.truthVersionId,
          `${a.factKey} v${a.version}`,
        );
        await edge(tx, truth, d, "INFORMED");
      }
      for (const evidence of r.evidence) {
        if (evidence.kind === "DOCUMENT" && objects.some((o) => o.ref === evidence.documentId)) {
          // A decision DEPENDS_ON the persisted object it explicitly cites. Discovery follows
          // this dependency in reverse, from prerequisite object to dependent decision.
          await edge(tx, d, nodeId("BUSINESS_OBJECT", evidence.documentId), "DEPENDS_ON");
        }
      }
      if (effects.length) {
        const a = await node(
          tx,
          "ACTION",
          r.decisionId,
          `${r.chosenAction.actionType} · ${effects[0]?.poId ?? r.targetEntity.entityId}`,
          { decisionId: r.decisionId, traceId: r.traceId },
        );
        await edge(tx, d, a, "CAUSED");
        for (const obj of effects) await edge(tx, a, nodeId("BUSINESS_OBJECT", obj.ref), "MUTATED");
      }
    }
  });
}

export interface Candidate {
  id: string;
  kind: ConsequenceNodeKind;
  ref_id: string;
  label: string | null;
  path: string[];
  depth: number;
  status: "CANDIDATE";
}

/** PostgreSQL simple-path recursion, temporal decision barriers and stable shortest-path evidence. */
export async function blastRadius(db: Db, revisionId: string): Promise<Candidate[]> {
  const [revision] = await db
    .select()
    .from(t.truthRevisions)
    .where(eq(t.truthRevisions.id, revisionId));
  if (!revision) throw new Error("revision not found");
  const result = await db.execute(sql`
    WITH RECURSIVE downstream AS (
      SELECT from_node_id AS source, to_node_id AS target FROM consequence_edges WHERE type IN ('INFORMED','CAUSED','MUTATED')
      UNION
      SELECT to_node_id, from_node_id FROM consequence_edges WHERE type IN ('DEPENDS_ON','DERIVED_FROM')
    ), walk AS (
      SELECT n.id, ARRAY[n.id]::text[] AS path, 0 AS depth
      FROM consequence_nodes n JOIN truth_assertions a ON n.kind = 'TRUTH_VERSION' AND n.ref_id = a.id
      WHERE a.assertion_id = ${revision.previousAssertionId} AND a.version = ${revision.previousVersion}
      UNION ALL
      SELECT n.id, w.path || n.id, w.depth + 1
      FROM walk w JOIN downstream e ON e.source = w.id JOIN consequence_nodes n ON n.id = e.target
      WHERE NOT n.id = ANY(w.path)
        AND (n.kind <> 'DECISION' OR EXISTS (
          SELECT 1 FROM decision_receipts d WHERE d.id = n.ref_id
            AND d.decided_at >= ${revision.effectiveFrom.toISOString()}::timestamptz
            AND (${revision.effectiveTo?.toISOString() ?? null}::timestamptz IS NULL OR d.decided_at < ${revision.effectiveTo?.toISOString() ?? null}::timestamptz)
            AND d.decided_at >= (SELECT valid_from FROM truth_assertions WHERE assertion_id = ${revision.previousAssertionId} AND version = ${revision.previousVersion})
            AND d.decided_at < COALESCE((SELECT valid_to FROM truth_assertions WHERE assertion_id = ${revision.previousAssertionId} AND version = ${revision.previousVersion}), 'infinity'::timestamptz)
        ))
    ), ranked AS (
      SELECT n.id, n.kind, n.ref_id, n.label, w.path, w.depth,
        row_number() OVER (PARTITION BY n.id ORDER BY w.depth, w.path COLLATE "C") AS rank
      FROM walk w JOIN consequence_nodes n ON n.id = w.id
      WHERE n.kind IN ('DECISION','ACTION','BUSINESS_OBJECT')
    )
    SELECT id, kind, ref_id, label, path, depth, 'CANDIDATE'::text AS status
    FROM ranked WHERE rank = 1 ORDER BY depth, id COLLATE "C"
  `);
  return queryRows<Candidate>(result);
}
