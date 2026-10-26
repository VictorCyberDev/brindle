import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import * as t from "../db/schema";
import {
  invariantResultSchema,
  type InvariantResult,
} from "../brindle/verification/invariant-result";
import { recoveryReceiptSchema, type RecoveryReceipt } from "../brindle/receipts/recovery-receipt";
import { closeIncident } from "../brindle/recovery/incident";
import { canonical } from "./evidence";
import { readMateriality } from "./materiality";
import {
  CONTROL_PO_ID,
  type effectFromRow,
  incidentFromRow,
  moveIncident,
  readRecovery,
  type stepFromRow,
} from "./recovery";
import {
  FreshReadFailed,
  readFreshRecoveryState,
  VERIFIER_SOURCE,
  type FreshState,
} from "./fresh-verifier";

export const REQUIRED_INVARIANTS = [
  "prohibited-vendor-open-pos",
  "invalid-po-finance-approvals",
  "invalid-po-receiving-allocations",
  "irreversible-consequences-handled",
  "unrelated-control-preserved",
  "no-duplicate-compensation",
] as const;
export function assertFreshInvariant(
  result: InvariantResult,
  startedAt: string,
  executedAt: string | null,
) {
  invariantResultSchema.parse(result);
  const observed = new Date(result.observation.observedAt).getTime(),
    verified = new Date(result.verifiedAt).getTime();
  if (
    result.observation.source !== VERIFIER_SOURCE ||
    observed < new Date(startedAt).getTime() ||
    verified < observed ||
    (executedAt && observed < new Date(executedAt).getTime())
  )
    throw new Error("STALE_OR_UNREGISTERED_VERIFICATION_EVIDENCE");
}
function validRemediation(payload: unknown, notificationId: string) {
  const p = payload as {
    remediation?: { kind?: string; notificationId?: string; owner?: string; status?: string };
  };
  return (
    p?.remediation?.kind === "CORRECTIVE_ESCALATION_RECORDED" &&
    p.remediation.notificationId === notificationId &&
    p.remediation.owner === "COMPLIANCE" &&
    p.remediation.status === "OPEN"
  );
}
function executionMatches(
  state: FreshState,
  step: ReturnType<typeof stepFromRow>,
  effect: ReturnType<typeof effectFromRow>,
) {
  const matches = state.evidence.filter(
    (e) => e.stepId === step.stepId && (e.kind === "EXECUTION" || e.kind === "REMEDIATION"),
  );
  if (matches.length !== 1 || step.status !== "SUCCEEDED") return false;
  const e = matches[0]!,
    payload = e.payload as {
      capabilityId?: string;
      idempotencyKey?: string;
      before?: unknown;
      after?: unknown;
    };
  if (
    e.incidentId !== step.incidentId ||
    payload.capabilityId !== step.capabilityId ||
    payload.idempotencyKey !== step.idempotencyKey ||
    canonical(payload.before) !== canonical(step.parameters.expectedBefore)
  )
    return false;
  const id = effect.target.entityId;
  if (effect.target.entityType === "purchase_order")
    return (
      canonical(state.pos.find((p) => p.id === id)) ===
      canonical({ ...(step.parameters.expectedBefore as object), status: "CANCELLED" })
    );
  if (effect.target.entityType === "finance_approval")
    return !state.finance.some((p) => p.id === id);
  if (effect.target.entityType === "receiving_allocation")
    return !state.receiving.some((p) => p.id === id);
  if (effect.target.entityType === "supplier_notification")
    return (
      e.kind === "REMEDIATION" &&
      validRemediation(e.payload, id) &&
      canonical(state.notifications.find((n) => n.id === id)) ===
        canonical(step.parameters.expectedBefore)
    );
  return false;
}
function inspect(
  state: FreshState,
  recovery: NonNullable<Awaited<ReturnType<typeof readRecovery>>>,
  replacementStatus: unknown,
) {
  const plan = recovery.plan!;
  const invalid = replacementStatus === "REVOKED";
  const supplier = plan.primaryBefore.pos[0]?.supplierId;
  const primaryPoId = plan.primaryBefore.pos[0]?.id;
  const prohibitedOpen = state.pos.filter(
    (p) => p.supplierId === supplier && p.status !== "CANCELLED" && invalid,
  ).length;
  const activeFinance = state.finance.filter((p) => p.poId === primaryPoId && invalid).length;
  const activeReceiving = state.receiving.filter((p) => p.poId === primaryPoId && invalid).length;
  const control = {
    pos: state.pos.filter((p) => p.id === CONTROL_PO_ID),
    finance: state.finance.filter((p) => p.poId === CONTROL_PO_ID),
    receiving: state.receiving.filter((p) => p.poId === CONTROL_PO_ID),
    notifications: state.notifications.filter((p) => p.poId === CONTROL_PO_ID),
    receipts: state.controlReceipts,
  };
  const controlUnchanged = canonical(control) === canonical(plan.control);
  const resolved = new Map<string, boolean>();
  for (const effect of recovery.effects) {
    const step = recovery.steps.find((s) => s.effectId === effect.effectId);
    resolved.set(effect.effectId, Boolean(step && executionMatches(state, step, effect)));
  }
  const unhandled = recovery.effects.filter(
    (e) => e.classification === "IRREVERSIBLE" && !resolved.get(e.effectId),
  ).length;
  const groups = new Map<string, number>();
  for (const event of state.evidence.filter(
    (e) => e.kind === "EXECUTION" || e.kind === "REMEDIATION",
  )) {
    const step = state.steps.find((s) => s.id === event.stepId),
      effect = recovery.effects.find((e) => e.effectId === step?.effectId);
    const key =
      effect && step ? canonical([effect.target, step.capabilityId]) : `unknown:${event.id}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  const duplicates = [...groups.values()].reduce((sum, n) => sum + Math.max(0, n - 1), 0);
  const complete =
    recovery.steps.every((step) => Boolean(resolved.get(step.effectId))) &&
    state.evidence.filter((e) => e.kind === "EXECUTION" || e.kind === "REMEDIATION").length ===
      recovery.steps.length;
  return {
    values: [
      { pass: prohibitedOpen === 0, detail: { prohibitedOpen } },
      { pass: activeFinance === 0, detail: { activeFinance } },
      { pass: activeReceiving === 0, detail: { activeReceiving } },
      {
        pass: unhandled === 0,
        detail: {
          unhandled,
          originalNotificationRetained: state.notifications.some(
            (n) => n.id === `notif:${primaryPoId}`,
          ),
        },
      },
      { pass: controlUnchanged, detail: { controlUnchanged } },
      {
        pass: duplicates === 0 && complete,
        detail: { duplicateCompensations: duplicates, executionEvidenceComplete: complete },
      },
    ],
    resolved,
    metrics: {
      prohibitedOpen,
      activeFinance,
      activeReceiving,
      unhandled,
      controlUnchanged,
      duplicateCompensations: duplicates,
    },
  };
}
function resultFromRow(r: typeof t.invariantResults.$inferSelect): InvariantResult {
  return invariantResultSchema.parse({
    resultId: r.id,
    incidentId: r.incidentId,
    invariantId: r.invariantId,
    status: r.status,
    verifierId: r.verifierId,
    observation: r.observation,
    detail: r.detail,
    verifiedAt: r.verifiedAt.toISOString(),
  });
}

/** Receipt references must resolve to exact persisted assessments, steps and invariant evidence. */
export async function validateReceiptEvidence(db: Db, input: RecoveryReceipt) {
  const receipt = recoveryReceiptSchema.parse(input),
    recovery = await readRecovery(db, receipt.revisionId);
  if (
    !recovery ||
    recovery.incident.incidentId !== receipt.incidentId ||
    recovery.incident.revisionId !== receipt.revisionId
  )
    throw new Error("RECEIPT_INCIDENT_MISMATCH");
  if (
    canonical([...receipt.requiredInvariantIds].sort()) !==
    canonical([...REQUIRED_INVARIANTS].sort())
  )
    throw new Error("REQUIRED_INVARIANTS_MISMATCH");
  if (
    canonical(receipt.effectOutcomes.map((e) => e.effectId).sort()) !==
    canonical(recovery.effects.map((e) => e.effectId).sort())
  )
    throw new Error("EFFECT_EVIDENCE_MISMATCH");
  for (const outcome of receipt.effectOutcomes) {
    const stepIds = recovery.steps
      .filter((s) => s.effectId === outcome.effectId)
      .map((s) => s.stepId)
      .sort();
    if (canonical([...outcome.stepIds].sort()) !== canonical(stepIds))
      throw new Error("STEP_EVIDENCE_MISMATCH");
  }
  const materiality = await readMateriality(db, receipt.revisionId);
  const expected = {
    preserved: [
      ...materiality.assessments
        .filter((a) => a.assessment.result === "SAME")
        .map((a) => a.assessment.decisionId),
      ...(recovery.plan?.control.receipts.map((r) => r.id) ?? []),
    ].sort(),
    changed: materiality.assessments
      .filter((a) => a.assessment.result === "CHANGED")
      .map((a) => a.assessment.decisionId)
      .sort(),
    uncertain: materiality.assessments
      .filter((a) => a.assessment.result === "UNCERTAIN")
      .map((a) => a.assessment.decisionId)
      .sort(),
  };
  if (
    canonical({
      preserved: [...receipt.decisions.preserved].sort(),
      changed: [...receipt.decisions.changed].sort(),
      uncertain: [...receipt.decisions.uncertain].sort(),
    }) !== canonical(expected)
  )
    throw new Error("ASSESSMENT_EVIDENCE_MISMATCH");
  for (const result of receipt.invariantResults) {
    const [row] = await db
      .select()
      .from(t.invariantResults)
      .where(eq(t.invariantResults.id, result.resultId));
    if (!row || canonical(resultFromRow(row)) !== canonical(result))
      throw new Error("INVARIANT_EVIDENCE_MISMATCH");
  }
  return receipt;
}

export async function readProof(db: Db, revisionId: string) {
  const rows = await db
    .select()
    .from(t.recoveryReceipts)
    .where(eq(t.recoveryReceipts.revisionId, revisionId))
    .orderBy(t.recoveryReceipts.issuedAt);
  const receipts = rows.map((r) => recoveryReceiptSchema.parse(r.payload));
  const receipt = receipts.at(-1) ?? null;
  const recovery = await readRecovery(db, revisionId);
  const materiality = receipt ? await readMateriality(db, revisionId) : null;
  const metrics = receipt
    ? {
        consequencesExamined: materiality!.consequences.length + materiality!.examined,
        materiallyAffected: receipt.effectOutcomes.length,
        preservedDecisions: receipt.decisions.preserved.length,
        automaticallyRecovered: receipt.effectOutcomes.filter(
          (e) => e.outcome === "REVERSED" || e.outcome === "COMPENSATED",
        ).length,
        safelyRemediated: receipt.effectOutcomes.filter((e) => e.outcome === "REMEDIATED").length,
        residualViolations: receipt.invariantResults.filter((r) => r.status !== "PASS").length,
        duplicateCompensations: Number(
          (
            receipt.invariantResults.find((r) => r.invariantId === "no-duplicate-compensation")
              ?.detail as { duplicateCompensations?: number } | undefined
          )?.duplicateCompensations ?? 0,
        ),
      }
    : null;
  return { receipt, receipts, recovery, metrics };
}

/** Independent verification transaction. The sole service path to RECOVERED calls closeIncident. */
export async function verifyRecovery(db: Db, revisionId: string) {
  const existing = await readRecovery(db, revisionId);
  if (!existing?.plan) throw new Error("RECOVERY_PLAN_REQUIRED");
  if (existing.incident.status === "RECOVERED") return readProof(db, revisionId);
  if (existing.incident.status !== "VERIFYING" && existing.incident.status !== "ESCALATED")
    throw new Error("VERIFICATION_REQUIRES_EXECUTED_RECOVERY");
  const startedAt = new Date().toISOString();
  const persist = async (failedRead: boolean) =>
    db.transaction(
      async (tx) => {
        const [incident] = await tx
          .select()
          .from(t.incidents)
          .where(eq(t.incidents.id, existing.incident.incidentId))
          .for("update");
        if (!incident) throw new Error("INCIDENT_MISSING");
        if (incident.status === "RECOVERED") return;
        if (incident.status !== "VERIFYING" && incident.status !== "ESCALATED")
          throw new Error("VERIFICATION_REQUIRES_EXECUTED_RECOVERY");
        const previous = await tx
          .select()
          .from(t.recoveryReceipts)
          .where(eq(t.recoveryReceipts.incidentId, incident.id));
        if (previous.length >= 3) throw new Error("VERIFICATION_RETRY_BOUND_EXCEEDED");
        const attempt = previous.length + 1;
        const recovery = (await readRecovery(tx, revisionId))!;
        const materiality = await readMateriality(tx, revisionId);
        const [revision] = await tx
          .select()
          .from(t.truthRevisions)
          .where(eq(t.truthRevisions.id, revisionId));
        const [replacement] = await tx
          .select()
          .from(t.truthAssertions)
          .where(eq(t.truthAssertions.assertionId, revision!.replacementAssertionId))
          .then((rows) => rows.filter((r) => r.version === revision!.replacementVersion));
        const status = (replacement?.value as { status?: unknown })?.status;
        if (status !== "VALID" && status !== "REVOKED")
          throw new Error("UNSUPPORTED_VERIFICATION_TRUTH_STATE");
        const state = failedRead ? null : await readFreshRecoveryState(tx, incident.id);
        const inspected = state ? inspect(state, recovery, status) : null;
        const observedAt = state?.observation.observedAt ?? new Date().toISOString();
        const verifiedAt = new Date(
          Math.max(Date.now(), new Date(observedAt).getTime()),
        ).toISOString();
        const latestExecuted =
          recovery.steps
            .map((s) => s.executedAt)
            .filter((s): s is string => s !== null)
            .sort()
            .at(-1) ?? null;
        const results = REQUIRED_INVARIANTS.map((id, i) =>
          invariantResultSchema.parse({
            resultId: `invariant:${incident.id}:${attempt}:${id}`,
            incidentId: incident.id,
            invariantId: id,
            status: failedRead ? "ERROR" : inspected!.values[i]!.pass ? "PASS" : "FAIL",
            verifierId: "brindle.independent-sandbox-verifier.v1",
            observation: { kind: "FRESH_INDEPENDENT_READ", source: VERIFIER_SOURCE, observedAt },
            detail: failedRead
              ? { error: "fresh database read failed; no successful state observation claimed" }
              : inspected!.values[i]!.detail,
            verifiedAt,
          }),
        );
        for (const result of results) {
          assertFreshInvariant(result, startedAt, latestExecuted);
          await tx.insert(t.invariantResults).values({
            id: result.resultId,
            incidentId: incident.id,
            invariantId: result.invariantId,
            status: result.status,
            verifierId: result.verifierId,
            observation: result.observation,
            detail: result.detail,
            verifiedAt: new Date(result.verifiedAt),
          });
        }
        const effectOutcomes = recovery.effects.map((e) => ({
          effectId: e.effectId,
          classification: e.classification,
          outcome: inspected?.resolved.get(e.effectId)
            ? e.classification === "REVERSIBLE"
              ? "REVERSED"
              : e.classification === "COMPENSABLE"
                ? "COMPENSATED"
                : "REMEDIATED"
            : "UNRESOLVED",
          stepIds: recovery.steps.filter((s) => s.effectId === e.effectId).map((s) => s.stepId),
        }));
        const uncertain = materiality.assessments
          .filter((a) => a.assessment.result === "UNCERTAIN")
          .map((a) => a.assessment.decisionId);
        const eligible =
          incident.status === "VERIFYING" &&
          materiality.complete &&
          uncertain.length === 0 &&
          results.every((r) => r.status === "PASS") &&
          effectOutcomes.every((e) => e.outcome !== "UNRESOLVED");
        const verdict = eligible
          ? "RECOVERED"
          : incident.status === "ESCALATED" || attempt >= 3
            ? "ESCALATED"
            : "RECOVERY_INCOMPLETE";
        const receipt = recoveryReceiptSchema.parse({
          receiptId: `receipt:${incident.id}:${attempt}`,
          incidentId: incident.id,
          revisionId,
          verdict,
          issuedAt: verifiedAt,
          decisions: {
            preserved: [
              ...new Set([
                ...materiality.assessments
                  .filter((a) => a.assessment.result === "SAME")
                  .map((a) => a.assessment.decisionId),
                ...recovery.plan!.control.receipts.map((r) => r.id),
              ]),
            ].sort(),
            changed: materiality.assessments
              .filter((a) => a.assessment.result === "CHANGED")
              .map((a) => a.assessment.decisionId)
              .sort(),
            uncertain: uncertain.sort(),
          },
          effectOutcomes,
          requiredInvariantIds: [...REQUIRED_INVARIANTS],
          invariantResults: results,
          traceId: `trace:proof:${incident.id}:${attempt}`,
        });
        await validateReceiptEvidence(tx, receipt);
        await tx.insert(t.recoveryReceipts).values({
          id: receipt.receiptId,
          incidentId: incident.id,
          revisionId,
          verdict: receipt.verdict,
          issuedAt: new Date(receipt.issuedAt),
          payload: receipt,
        });
        if (eligible) {
          const closed = closeIncident(incidentFromRow(incident), receipt, verifiedAt);
          await tx
            .update(t.incidents)
            .set({
              status: closed.status,
              closure: closed.closure,
              closureReceiptId: receipt.receiptId,
              updatedAt: new Date(closed.updatedAt),
            })
            .where(eq(t.incidents.id, incident.id));
        } else if (incident.status === "VERIFYING")
          await moveIncident(
            tx,
            incident,
            verdict === "ESCALATED" ? "ESCALATED" : "RECOVERY_INCOMPLETE",
          );
      },
      { isolationLevel: "serializable" },
    );
  try {
    await persist(false);
  } catch (error) {
    if (!(error instanceof FreshReadFailed)) throw error;
    await persist(true);
  }
  return readProof(db, revisionId);
}
