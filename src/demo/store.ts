import { and, desc, eq, like, sql } from "drizzle-orm";
import type {
  FinanceApproval,
  PurchaseOrder,
  ReceivingAllocation,
  SupplierNotification,
} from "../brindle/business/sandbox";
import { decisionReceiptSchema, type DecisionReceipt } from "../brindle/receipts/decision-receipt";
import {
  truthAssertionSchema,
  type TruthAssertion,
  type TruthVersionRef,
} from "../brindle/truth/assertion";
import type { Db } from "../db/client";
import * as t from "../db/schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
const iso = (d: Date) => d.toISOString();

/* ----------------------------- truth persistence ---------------------------- */

const sameFact = (a: TruthAssertion, b: TruthAssertion) =>
  JSON.stringify(a.value) === JSON.stringify(b.value) &&
  a.validFrom === b.validFrom &&
  a.validTo === b.validTo;

function rowToAssertion(r: typeof t.truthAssertions.$inferSelect): TruthAssertion {
  return truthAssertionSchema.parse({
    truthVersionId: r.id,
    assertionId: r.assertionId,
    version: r.version,
    subject: { entityType: r.subjectType, entityId: r.subjectId },
    sourceId: r.sourceId,
    factKey: r.factKey,
    value: r.value,
    validFrom: iso(r.validFrom),
    validTo: r.validTo ? iso(r.validTo) : null,
    observedAt: iso(r.observedAt),
    provenance: r.provenance,
  });
}

/**
 * Persists normalized assertions as immutable versions. An unchanged fact
 * reuses its existing version; a changed fact becomes the next version (no
 * TruthRevision is created here: revision handling is M2). Returns the
 * persisted versions, which are what decision receipts must reference.
 */
export async function persistTruth(
  db: Db,
  assertions: readonly TruthAssertion[],
): Promise<TruthAssertion[]> {
  return db.transaction(async (tx) => {
    const persisted: TruthAssertion[] = [];
    for (const a of assertions) {
      const [latest] = await tx
        .select()
        .from(t.truthAssertions)
        .where(eq(t.truthAssertions.assertionId, a.assertionId))
        .orderBy(desc(t.truthAssertions.version))
        .limit(1);
      if (latest && sameFact(rowToAssertion(latest), a)) {
        persisted.push(rowToAssertion(latest));
        continue;
      }
      const version = latest ? latest.version + 1 : 1;
      const next = truthAssertionSchema.parse({
        ...a,
        version,
        truthVersionId: `${a.assertionId}@v${version}`,
      });
      await tx.insert(t.truthAssertions).values({
        id: next.truthVersionId,
        assertionId: next.assertionId,
        version: next.version,
        subjectType: next.subject.entityType,
        subjectId: next.subject.entityId,
        sourceId: next.sourceId,
        factKey: next.factKey,
        value: next.value,
        validFrom: new Date(next.validFrom),
        validTo: next.validTo ? new Date(next.validTo) : null,
        observedAt: new Date(next.observedAt),
        provenance: next.provenance,
      });
      persisted.push(next);
    }
    return persisted;
  });
}

export async function loadTruthByRefs(
  db: Db,
  refs: readonly TruthVersionRef[],
): Promise<TruthAssertion[]> {
  const out: TruthAssertion[] = [];
  for (const ref of refs) {
    const [row] = await db
      .select()
      .from(t.truthAssertions)
      .where(
        and(
          eq(t.truthAssertions.assertionId, ref.assertionId),
          eq(t.truthAssertions.version, ref.version),
        ),
      );
    if (!row)
      throw new Error(`truth reference ${ref.assertionId}@v${ref.version} is not persisted`);
    out.push(rowToAssertion(row));
  }
  return out;
}

/* ----------------------------- sandbox reads -------------------------------- */

const poFromRow = (r: typeof t.purchaseOrders.$inferSelect): PurchaseOrder => ({
  poId: r.id,
  supplierId: r.supplierId,
  supplierName: r.supplierName,
  description: r.description,
  amountCents: r.amountCents,
  currency: r.currency,
  status: r.status,
  createdByDecisionId: r.createdByDecisionId,
  createdAt: iso(r.placedAt),
});

export async function getPo(db: Db, poId: string): Promise<PurchaseOrder | undefined> {
  const [r] = await db.select().from(t.purchaseOrders).where(eq(t.purchaseOrders.id, poId));
  return r ? poFromRow(r) : undefined;
}

export async function getApproval(db: Db, poId: string): Promise<FinanceApproval | undefined> {
  const [r] = await db.select().from(t.financeApprovals).where(eq(t.financeApprovals.poId, poId));
  return r
    ? {
        approvalId: r.id,
        poId: r.poId,
        approvedAmountCents: r.approvedAmountCents,
        currency: r.currency,
        decisionId: r.decisionId,
        approvedAt: iso(r.approvedAt),
      }
    : undefined;
}

export async function getAllocation(
  db: Db,
  poId: string,
): Promise<ReceivingAllocation | undefined> {
  const [r] = await db
    .select()
    .from(t.receivingAllocations)
    .where(eq(t.receivingAllocations.poId, poId));
  return r
    ? {
        allocationId: r.id,
        poId: r.poId,
        dockId: r.dockId,
        expectedArrival: iso(r.expectedArrival),
        decisionId: r.decisionId,
        createdAt: iso(r.allocatedAt),
      }
    : undefined;
}

export async function getNotification(
  db: Db,
  poId: string,
): Promise<SupplierNotification | undefined> {
  const [r] = await db
    .select()
    .from(t.supplierNotifications)
    .where(eq(t.supplierNotifications.poId, poId));
  return r
    ? {
        notificationId: r.id,
        poId: r.poId,
        supplierId: r.supplierId,
        channel: "SANDBOX_RECORD",
        subject: r.subject,
        decisionId: r.decisionId,
        recordedAt: iso(r.recordedAt),
      }
    : undefined;
}

export async function getReceipt(db: Db, decisionId: string): Promise<DecisionReceipt | undefined> {
  const [r] = await db
    .select()
    .from(t.decisionReceipts)
    .where(eq(t.decisionReceipts.id, decisionId));
  return r ? decisionReceiptSchema.parse(r.payload) : undefined;
}

/* ------------------------ gated sandbox executors --------------------------- */
/* Each executor persists the DecisionReceipt and the business effect in ONE
   transaction, so a business effect can never exist without its receipt. They
   are only called after an authorization gate returned allowed. */

async function insertReceipt(tx: Tx, receipt: DecisionReceipt): Promise<void> {
  await tx.insert(t.decisionReceipts).values({
    id: receipt.decisionId,
    agentId: receipt.agentId,
    objective: receipt.objective,
    decidedAt: new Date(receipt.decidedAt),
    policyVersion: receipt.policyVersion,
    modelId: receipt.modelId,
    promptVersion: receipt.promptVersion,
    schemaVersion: receipt.schemaVersion,
    actionType: receipt.chosenAction.actionType,
    targetType: receipt.targetEntity.entityType,
    targetId: receipt.targetEntity.entityId,
    traceId: receipt.traceId,
    payload: receipt,
  });
}

export function executeCreatePo(
  db: Db,
  receipt: DecisionReceipt,
  po: PurchaseOrder,
): Promise<void> {
  return db.transaction(async (tx) => {
    await insertReceipt(tx, receipt);
    await tx.insert(t.purchaseOrders).values({
      id: po.poId,
      supplierId: po.supplierId,
      supplierName: po.supplierName,
      description: po.description,
      amountCents: po.amountCents,
      currency: po.currency,
      status: "CREATED",
      createdByDecisionId: po.createdByDecisionId,
      placedAt: new Date(po.createdAt),
    });
  });
}

export function executeApprovePo(
  db: Db,
  receipt: DecisionReceipt,
  approval: FinanceApproval,
): Promise<void> {
  return db.transaction(async (tx) => {
    await insertReceipt(tx, receipt);
    const updated = await tx
      .update(t.purchaseOrders)
      .set({ status: "APPROVED" })
      .where(and(eq(t.purchaseOrders.id, approval.poId), eq(t.purchaseOrders.status, "CREATED")))
      .returning({ id: t.purchaseOrders.id });
    if (updated.length !== 1) throw new Error("PO was not in CREATED state at execution time");
    await tx.insert(t.financeApprovals).values({
      id: approval.approvalId,
      poId: approval.poId,
      approvedAmountCents: approval.approvedAmountCents,
      currency: approval.currency,
      decisionId: approval.decisionId,
      approvedAt: new Date(approval.approvedAt),
    });
  });
}

export function executeScheduleReceiving(
  db: Db,
  receipt: DecisionReceipt,
  allocation: ReceivingAllocation,
  notification: SupplierNotification,
): Promise<void> {
  return db.transaction(async (tx) => {
    await insertReceipt(tx, receipt);
    const updated = await tx
      .update(t.purchaseOrders)
      .set({ status: "RECEIVING_SCHEDULED" })
      .where(and(eq(t.purchaseOrders.id, allocation.poId), eq(t.purchaseOrders.status, "APPROVED")))
      .returning({ id: t.purchaseOrders.id });
    if (updated.length !== 1) throw new Error("PO was not in APPROVED state at execution time");
    await tx.insert(t.receivingAllocations).values({
      id: allocation.allocationId,
      poId: allocation.poId,
      dockId: allocation.dockId,
      expectedArrival: new Date(allocation.expectedArrival),
      decisionId: allocation.decisionId,
      allocatedAt: new Date(allocation.createdAt),
    });
    // SANDBOX business record only. Nothing is transmitted to any supplier.
    await tx.insert(t.supplierNotifications).values({
      id: notification.notificationId,
      poId: notification.poId,
      supplierId: notification.supplierId,
      channel: notification.channel,
      subject: notification.subject,
      decisionId: notification.decisionId,
      recordedAt: new Date(notification.recordedAt),
    });
  });
}

/* --------------------------------- runs ------------------------------------- */

export interface RunRecord {
  runId: string;
  mode: "LIVE" | "MOCK";
  status: "COMPLETED" | "BLOCKED" | "FAILED";
  truthSourceId: string;
  reasoningProvider: string;
  modelId: string;
  traceId: string;
  startedAt: string;
  finishedAt: string;
  detail: unknown;
}

export async function recordRun(db: Db, run: RunRecord): Promise<void> {
  await db.insert(t.demoRuns).values({
    id: run.runId,
    mode: run.mode,
    status: run.status,
    truthSourceId: run.truthSourceId,
    reasoningProvider: run.reasoningProvider,
    modelId: run.modelId,
    traceId: run.traceId,
    startedAt: new Date(run.startedAt),
    finishedAt: new Date(run.finishedAt),
    detail: run.detail ?? {},
  });
}

/* --------------------------------- reset ------------------------------------ */

/**
 * Deterministic reset of the SANDBOX business system and the truth/receipts
 * written by M1 runs. It touches only Brindle's own tables; it cannot affect
 * Zetaris. It refuses to run if later-milestone data (revisions, incidents)
 * exists, so it can never silently destroy incident history.
 */
export async function resetSandbox(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    const [{ n: revisions } = { n: 0 }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(t.truthRevisions);
    const [{ n: incidents } = { n: 0 }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(t.incidents);
    if (revisions > 0 || incidents > 0) {
      throw new Error(
        "reset refused: truth revisions or incidents exist; this reset only covers M1 demo state",
      );
    }
    await tx.delete(t.supplierNotifications);
    await tx.delete(t.receivingAllocations);
    await tx.delete(t.financeApprovals);
    await tx.delete(t.purchaseOrders);
    await tx.delete(t.demoRuns);
    await tx.delete(t.decisionReceipts);
    await tx.delete(t.truthAssertions);
  });
}

/* --------------------------------- state ------------------------------------ */

export interface DemoState {
  purchaseOrders: {
    po: PurchaseOrder;
    approval: FinanceApproval | null;
    allocation: ReceivingAllocation | null;
    notification: SupplierNotification | null;
    decisionReceiptCount: number;
  }[];
  decisionReceiptCount: number;
  truth: { assertion: TruthAssertion }[];
  latestRun: Omit<RunRecord, "detail"> | null;
}

export async function readDemoState(db: Db): Promise<DemoState> {
  const pos = await db.select().from(t.purchaseOrders).orderBy(t.purchaseOrders.id);
  const receipts = await db.select({ id: t.decisionReceipts.id }).from(t.decisionReceipts);
  const truth = await db
    .select()
    .from(t.truthAssertions)
    .orderBy(t.truthAssertions.subjectId, t.truthAssertions.factKey);
  const [run] = await db.select().from(t.demoRuns).orderBy(desc(t.demoRuns.startedAt)).limit(1);

  const purchaseOrders: DemoState["purchaseOrders"] = [];
  for (const row of pos) {
    const poId = row.id;
    const count = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.decisionReceipts)
      .where(like(t.decisionReceipts.id, `dec:${poId}:%`));
    purchaseOrders.push({
      po: poFromRow(row),
      approval: (await getApproval(db, poId)) ?? null,
      allocation: (await getAllocation(db, poId)) ?? null,
      notification: (await getNotification(db, poId)) ?? null,
      decisionReceiptCount: count[0]?.n ?? 0,
    });
  }
  return {
    purchaseOrders,
    decisionReceiptCount: receipts.length,
    truth: truth.map((r) => ({ assertion: rowToAssertion(r) })),
    latestRun: run
      ? {
          runId: run.id,
          mode: run.mode,
          status: run.status,
          truthSourceId: run.truthSourceId,
          reasoningProvider: run.reasoningProvider,
          modelId: run.modelId,
          traceId: run.traceId,
          startedAt: iso(run.startedAt),
          finishedAt: iso(run.finishedAt),
        }
      : null,
  };
}
