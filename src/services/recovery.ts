import { and, eq, like } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import * as t from "../db/schema";
import { effectSchema, type Effect } from "../brindle/graph/effect";
import {
  recoveryCapabilitySchema,
  RECOVERY_MODE_BY_CLASSIFICATION,
  type RecoveryCapability,
} from "../brindle/recovery/capability";
import { deriveIdempotencyKey } from "../brindle/recovery/idempotency";
import {
  incidentSchema,
  transitionIncident,
  type Incident,
  type IncidentStatus,
} from "../brindle/recovery/incident";
import { recoveryStepSchema, type RecoveryStep } from "../brindle/recovery/step";
import { jsonObjectSchema } from "../brindle/common/schemas";
import { canonical, fingerprint } from "./evidence";
import { readMateriality } from "./materiality";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** The permanent unrelated control: never a recovery target, always baselined and re-verified. */
export const CONTROL_PO_ID = "PO-901";

/**
 * The single purchase order a revision can touch: the (one) non-control PO of the revised supplier.
 * Fails closed when it is ambiguous or absent.
 */
export async function resolvePrimaryPo(
  db: Db | Tx,
  revisionId: string,
): Promise<{ supplierId: string; poId: string }> {
  const [revision] = await db
    .select()
    .from(t.truthRevisions)
    .where(eq(t.truthRevisions.id, revisionId));
  if (!revision) throw new Error("REVISION_NOT_FOUND");
  const [assertion] = await db
    .select()
    .from(t.truthAssertions)
    .where(
      and(
        eq(t.truthAssertions.assertionId, revision.previousAssertionId),
        eq(t.truthAssertions.version, revision.previousVersion),
      ),
    );
  if (!assertion || assertion.subjectType !== "supplier") throw new Error("SCOPE_UNRESOLVED");
  const pos = (
    await db
      .select()
      .from(t.purchaseOrders)
      .where(eq(t.purchaseOrders.supplierId, assertion.subjectId))
  ).filter((p) => p.id !== CONTROL_PO_ID && p.status !== "CANCELLED");
  if (pos.length !== 1) throw new Error("SCOPE_UNRESOLVED");
  return { supplierId: assertion.subjectId, poId: pos[0]!.id };
}
export interface RecoveryActor {
  id: string;
  authority: readonly string[];
}
const descriptors = [
  {
    capabilityId: "sandbox.po.cancel.v1",
    name: "Cancel open sandbox PO",
    mode: "REVERSE",
    targetEntityTypes: ["purchase_order"],
    requiredAuthority: ["sandbox.po.cancel"],
  },
  {
    capabilityId: "sandbox.finance.revoke.v1",
    name: "Revoke finance approval",
    mode: "COMPENSATE",
    targetEntityTypes: ["finance_approval"],
    requiredAuthority: ["sandbox.finance.revoke"],
  },
  {
    capabilityId: "sandbox.receiving.cancel.v1",
    name: "Cancel receiving allocation",
    mode: "COMPENSATE",
    targetEntityTypes: ["receiving_allocation"],
    requiredAuthority: ["sandbox.receiving.cancel"],
  },
  {
    capabilityId: "sandbox.notification.remediate.v1",
    name: "Record corrective compliance escalation",
    mode: "REMEDIATE",
    targetEntityTypes: ["supplier_notification"],
    requiredAuthority: ["sandbox.notification.remediate"],
  },
] as const;
export const RECOVERY_REGISTRY: readonly RecoveryCapability[] = Object.freeze(
  descriptors.map((d) => {
    const capability = recoveryCapabilitySchema.parse({
      ...d,
      version: "v1",
      bounds: { maxAffectedObjects: 1 },
      idempotency: { strategy: "DERIVED_KEY_V1" },
    });
    Object.freeze(capability.targetEntityTypes);
    Object.freeze(capability.requiredAuthority);
    Object.freeze(capability.bounds);
    Object.freeze(capability.idempotency);
    return Object.freeze(capability);
  }),
);
export const SANDBOX_RECOVERY_ACTOR: RecoveryActor = Object.freeze({
  id: "sandbox.operator",
  authority: Object.freeze(RECOVERY_REGISTRY.flatMap((c) => c.requiredAuthority)),
});
const paramsSchema = z.strictObject({
  targetId: z.string().min(1),
  poId: z.string().min(1),
  expectedBefore: jsonObjectSchema,
  planFingerprint: z.string().length(64),
  order: z.number().int().min(0).max(3),
});
export const incidentFromRow = (row: typeof t.incidents.$inferSelect): Incident =>
  incidentSchema.parse({
    incidentId: row.id,
    revisionId: row.revisionId,
    status: row.status,
    openedAt: row.openedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    closure: row.closure ?? null,
  });
export async function moveIncident(
  tx: Tx,
  row: typeof t.incidents.$inferSelect,
  status: Exclude<IncidentStatus, "RECOVERED">,
) {
  const next = transitionIncident(incidentFromRow(row), status, new Date().toISOString());
  const [saved] = await tx
    .update(t.incidents)
    .set({ status: next.status, updatedAt: new Date(next.updatedAt) })
    .where(eq(t.incidents.id, row.id))
    .returning();
  return saved!;
}
export const stepFromRow = (row: typeof t.recoverySteps.$inferSelect): RecoveryStep =>
  recoveryStepSchema.parse({
    stepId: row.id,
    incidentId: row.incidentId,
    effectId: row.effectId,
    capabilityId: row.capabilityId,
    mode: row.mode,
    effectClassification: row.effectClassification,
    idempotencyKey: row.idempotencyKey,
    parameters: row.parameters,
    status: row.status,
    plannedAt: row.plannedAt.toISOString(),
    executedAt: row.executedAt?.toISOString() ?? null,
  });
export const effectFromRow = (r: typeof t.effects.$inferSelect): Effect =>
  effectSchema.parse({
    effectId: r.id,
    actionNodeId: r.actionNodeId,
    classification: r.classification,
    target: { entityType: r.targetType, entityId: r.targetId },
    description: r.description,
    classifiedBy: "DETERMINISTIC_RULE",
    ruleId: r.ruleId,
    occurredAt: r.occurredAt.toISOString(),
  });

/** Full business/receipt snapshot used to prove unrelated preservation, including database row clocks. */
export async function businessSnapshot(db: Db, poId: string) {
  const [pos, finance, receiving, notifications, receipts] = await Promise.all([
    db.select().from(t.purchaseOrders).where(eq(t.purchaseOrders.id, poId)),
    db
      .select()
      .from(t.financeApprovals)
      .where(eq(t.financeApprovals.poId, poId))
      .orderBy(t.financeApprovals.id),
    db
      .select()
      .from(t.receivingAllocations)
      .where(eq(t.receivingAllocations.poId, poId))
      .orderBy(t.receivingAllocations.id),
    db
      .select()
      .from(t.supplierNotifications)
      .where(eq(t.supplierNotifications.poId, poId))
      .orderBy(t.supplierNotifications.id),
    db
      .select()
      .from(t.decisionReceipts)
      .where(like(t.decisionReceipts.id, `dec:${poId}:%`))
      .orderBy(t.decisionReceipts.id),
  ]);
  return json({ pos, finance, receiving, notifications, receipts });
}
const rules = {
  purchase_order: {
    classification: "REVERSIBLE",
    ruleId: "sandbox.pending-po.v1",
    capabilityId: "sandbox.po.cancel.v1",
    order: 2,
  },
  finance_approval: {
    classification: "COMPENSABLE",
    ruleId: "sandbox.finance-revocation.v1",
    capabilityId: "sandbox.finance.revoke.v1",
    order: 1,
  },
  receiving_allocation: {
    classification: "COMPENSABLE",
    ruleId: "sandbox.receiving-cancellation.v1",
    capabilityId: "sandbox.receiving.cancel.v1",
    order: 0,
  },
  supplier_notification: {
    classification: "IRREVERSIBLE",
    ruleId: "sandbox.notification-history.v1",
    capabilityId: "sandbox.notification.remediate.v1",
    order: 3,
  },
} as const;
type TargetType = keyof typeof rules;
async function targetRecord(
  db: Db,
  type: TargetType,
  id: string,
): Promise<Record<string, unknown> | null> {
  const table =
    type === "purchase_order"
      ? t.purchaseOrders
      : type === "finance_approval"
        ? t.financeApprovals
        : type === "receiving_allocation"
          ? t.receivingAllocations
          : t.supplierNotifications;
  const rows = await db.select().from(table).where(eq(table.id, id));
  return rows[0] ? (json(rows[0]) as unknown as Record<string, unknown>) : null;
}
export function validateRecoveryStep(
  stepInput: RecoveryStep,
  effect: Effect,
  actor: RecoveryActor,
  affectedObjects = 1,
  availableIds: readonly string[] = RECOVERY_REGISTRY.map((c) => c.capabilityId),
) {
  const step = recoveryStepSchema.parse(stepInput),
    params = paramsSchema.parse(step.parameters);
  const capability = RECOVERY_REGISTRY.find((c) => c.capabilityId === step.capabilityId);
  if (!capability) throw new Error("UNKNOWN_CAPABILITY");
  if (!availableIds.includes(capability.capabilityId)) throw new Error("CAPABILITY_UNAVAILABLE");
  if (!actor.id || capability.requiredAuthority.some((a) => !actor.authority.includes(a)))
    throw new Error("AUTHORITY_MISSING");
  if (affectedObjects !== 1 || affectedObjects > capability.bounds.maxAffectedObjects)
    throw new Error("OBJECT_BOUND_EXCEEDED");
  if (
    !capability.targetEntityTypes.includes(effect.target.entityType) ||
    capability.mode !== step.mode ||
    effect.effectId !== step.effectId ||
    effect.classification !== step.effectClassification ||
    params.targetId !== effect.target.entityId
  )
    throw new Error("CAPABILITY_EFFECT_MISMATCH");
  if (
    !(effect.target.entityType in rules) ||
    rules[effect.target.entityType as TargetType].capabilityId !== step.capabilityId
  )
    throw new Error("UNSUPPORTED_EFFECT");
  const expectedPo =
    effect.target.entityType === "purchase_order" ? params.targetId : params.expectedBefore.poId;
  if (
    expectedPo !== params.poId ||
    params.poId === CONTROL_PO_ID ||
    params.expectedBefore.id !== params.targetId
  )
    throw new Error("TARGET_OUTSIDE_SANDBOX_BOUND");
  return { step, params, capability };
}
const assessmentDigest = (m: Awaited<ReturnType<typeof readMateriality>>) =>
  fingerprint(
    m.assessments.map((v) => ({
      id: v.assessment.assessmentId,
      inputHash: v.evidenceHash,
      assessment: v.assessment,
    })),
  );
export interface PlanEvidence {
  assessmentHash: string;
  control: Awaited<ReturnType<typeof businessSnapshot>>;
  primaryBefore: Awaited<ReturnType<typeof businessSnapshot>>;
  preservedConsequences: string[];
  blockedConsequences: string[];
  effectIds: string[];
  stepIds: string[];
  reason: string | null;
  claim: string;
}
export async function readRecovery(db: Db, revisionId: string) {
  const id = `incident:${revisionId}:v1`;
  const [row] = await db.select().from(t.incidents).where(eq(t.incidents.id, id));
  if (!row) return null;
  const steps = await db.select().from(t.recoverySteps).where(eq(t.recoverySteps.incidentId, id));
  const evidence = await db
    .select()
    .from(t.recoveryEvidence)
    .where(eq(t.recoveryEvidence.incidentId, id))
    .orderBy(t.recoveryEvidence.id);
  const plan = evidence.find((e) => e.kind === "PLAN")?.payload as PlanEvidence | undefined;
  const effects: Effect[] = [];
  for (const effectId of plan?.effectIds ?? []) {
    const [e] = await db.select().from(t.effects).where(eq(t.effects.id, effectId));
    if (!e) throw new Error("planned effect missing");
    effects.push(effectFromRow(e));
  }
  return {
    incident: incidentFromRow(row),
    steps: steps
      .map(stepFromRow)
      .sort(
        (a, b) =>
          Number(a.parameters.order) - Number(b.parameters.order) ||
          a.stepId.localeCompare(b.stepId),
      ),
    effects,
    evidence,
    plan: plan ?? null,
  };
}

/** Smallest set after consequences proven unaffected are removed; no global optimality claim. */
export async function planRecovery(db: Db, revisionId: string, actor: RecoveryActor) {
  const materiality = await readMateriality(db, revisionId),
    hash = assessmentDigest(materiality);
  const prior = await readRecovery(db, revisionId);
  if (prior) {
    if (prior.plan?.assessmentHash !== hash) throw new Error("IMMUTABLE_PLAN_CONFLICT");
    return prior;
  }
  const id = `incident:${revisionId}:v1`;
  await db.transaction(async (tx) => {
    await tx
      .select()
      .from(t.truthRevisions)
      .where(eq(t.truthRevisions.id, revisionId))
      .for("update");
    const [exists] = await tx.select().from(t.incidents).where(eq(t.incidents.id, id));
    if (exists) return;
    const now = new Date();
    const scope = await resolvePrimaryPo(tx, revisionId);
    const [opened] = await tx
      .insert(t.incidents)
      .values({ id, revisionId, status: "OPEN", openedAt: now, updatedAt: now })
      .returning();
    let incident = await moveIncident(tx, opened!, "ANALYZING");
    const plan: PlanEvidence = {
      assessmentHash: hash,
      control: await businessSnapshot(tx, CONTROL_PO_ID),
      primaryBefore: await businessSnapshot(tx, scope.poId),
      preservedConsequences: materiality.consequences
        .filter((c) => c.treatment === "PRESERVE")
        .map((c) => c.id),
      blockedConsequences: materiality.consequences
        .filter((c) => c.treatment.startsWith("BLOCKED"))
        .map((c) => c.id),
      effectIds: [],
      stepIds: [],
      reason: null,
      claim:
        "The smallest recovery set after Brindle has removed consequences proven counterfactually unaffected.",
    };
    const retain = materiality.consequences.filter(
      (c) => c.kind === "BUSINESS_OBJECT" && c.treatment === "M4_ANALYSIS",
    );
    if (
      !materiality.complete ||
      plan.blockedConsequences.length ||
      materiality.assessments.some((a) => a.assessment.result === "UNCERTAIN")
    )
      plan.reason = "MATERIALITY_INCOMPLETE_OR_UNCERTAIN";
    if (plan.control.pos.length !== 1 || plan.control.pos[0]?.status !== "RECEIVING_SCHEDULED")
      plan.reason = "CONTROL_BASELINE_UNAVAILABLE";
    const pending: {
      effect: Effect;
      before: Record<string, unknown>;
      order: number;
      capabilityId: string;
    }[] = [];
    if (!plan.reason) {
      const seen = new Set<string>();
      for (const candidate of retain) {
        let found = false;
        for (const type of Object.keys(rules) as TargetType[]) {
          const before = await targetRecord(tx, type, candidate.ref_id);
          if (!before) continue;
          const poId = type === "purchase_order" ? before.id : before.poId;
          if (poId !== scope.poId) throw new Error("TARGET_OUTSIDE_SANDBOX_BOUND");
          const key = `${type}:${candidate.ref_id}`;
          if (seen.has(key)) {
            found = true;
            break;
          }
          seen.add(key);
          const owner = String(
            type === "purchase_order" ? before.createdByDecisionId : before.decisionId,
          );
          const [action] = await tx
            .select()
            .from(t.consequenceNodes)
            .where(and(eq(t.consequenceNodes.kind, "ACTION"), eq(t.consequenceNodes.refId, owner)));
          if (!action) throw new Error("COMMITTED_ACTION_EVIDENCE_MISSING");
          const rule = rules[type];
          if (
            type === "purchase_order" &&
            !["CREATED", "APPROVED", "RECEIVING_SCHEDULED"].includes(String(before.status))
          )
            throw new Error("PO_NOT_SAFELY_CANCELLABLE");
          const occurredAt = String(
            before.placedAt ?? before.approvedAt ?? before.allocatedAt ?? before.recordedAt,
          );
          const effect = effectSchema.parse({
            effectId: `effect:${key}`,
            actionNodeId: action.id,
            classification: rule.classification,
            target: { entityType: type, entityId: candidate.ref_id },
            description: candidate.label ?? key,
            classifiedBy: "DETERMINISTIC_RULE",
            ruleId: rule.ruleId,
            occurredAt,
          });
          pending.push({ effect, before, order: rule.order, capabilityId: rule.capabilityId });
          found = true;
          break;
        }
        if (!found) throw new Error("UNSUPPORTED_OR_MISSING_BUSINESS_EFFECT");
      }
      if (pending.length > 4) throw new Error("PLAN_OBJECT_BOUND_EXCEEDED");
      for (const p of pending.sort(
        (a, b) => a.order - b.order || a.effect.effectId.localeCompare(b.effect.effectId),
      )) {
        const e = p.effect,
          stepId = `step:${id}:${e.effectId}`;
        const step = recoveryStepSchema.parse({
          stepId,
          incidentId: id,
          effectId: e.effectId,
          capabilityId: p.capabilityId,
          mode: RECOVERY_MODE_BY_CLASSIFICATION[e.classification],
          effectClassification: e.classification,
          idempotencyKey: deriveIdempotencyKey({
            incidentId: id,
            effectId: e.effectId,
            capabilityId: p.capabilityId,
          }),
          parameters: {
            targetId: e.target.entityId,
            poId: scope.poId,
            expectedBefore: p.before,
            planFingerprint: hash,
            order: p.order,
          },
          status: "PLANNED",
          plannedAt: now.toISOString(),
          executedAt: null,
        });
        validateRecoveryStep(step, e, actor);
        await tx
          .insert(t.effects)
          .values({
            id: e.effectId,
            actionNodeId: e.actionNodeId,
            classification: e.classification,
            targetType: e.target.entityType,
            targetId: e.target.entityId,
            description: e.description,
            ruleId: e.ruleId,
            occurredAt: new Date(e.occurredAt),
          })
          .onConflictDoNothing();
        const [persistedEffect] = await tx
          .select()
          .from(t.effects)
          .where(eq(t.effects.id, e.effectId));
        if (!persistedEffect || canonical(effectFromRow(persistedEffect)) !== canonical(e))
          throw new Error("IMMUTABLE_EFFECT_CONFLICT");
        await tx.insert(t.recoverySteps).values({
          id: step.stepId,
          incidentId: id,
          effectId: e.effectId,
          capabilityId: step.capabilityId,
          mode: step.mode,
          effectClassification: e.classification,
          idempotencyKey: step.idempotencyKey,
          parameters: step.parameters,
          status: step.status,
          plannedAt: now,
        });
        plan.effectIds.push(e.effectId);
        plan.stepIds.push(step.stepId);
      }
    }
    await tx
      .insert(t.recoveryEvidence)
      .values({ id: `plan:${id}`, incidentId: id, kind: "PLAN", payload: plan, recordedAt: now });
    incident = await moveIncident(
      tx,
      incident,
      plan.reason ? "ESCALATED" : pending.length ? "RECOVERY_PLANNED" : "VERIFYING",
    );
    void incident;
  });
  return (await readRecovery(db, revisionId))!;
}

export async function executeRecovery(
  db: Db,
  revisionId: string,
  actor: RecoveryActor,
  availableIds: readonly string[] = RECOVERY_REGISTRY.map((c) => c.capabilityId),
) {
  let recovery = await readRecovery(db, revisionId);
  if (!recovery?.plan) throw new Error("RECOVERY_PLAN_REQUIRED");
  if (recovery.plan.assessmentHash !== assessmentDigest(await readMateriality(db, revisionId)))
    throw new Error("IMMUTABLE_PLAN_CONFLICT");
  if (recovery.incident.status === "VERIFYING" || recovery.incident.status === "RECOVERED")
    return recovery;
  if (recovery.incident.status === "ESCALATED") throw new Error("INCIDENT_ESCALATED");
  await db.transaction(async (tx) => {
    let [row] = await tx
      .select()
      .from(t.incidents)
      .where(eq(t.incidents.id, recovery!.incident.incidentId))
      .for("update");
    if (row!.status === "RECOVERY_INCOMPLETE")
      row = await moveIncident(tx, row!, "RECOVERY_PLANNED");
    if (row!.status === "RECOVERY_PLANNED") await moveIncident(tx, row!, "RECOVERING");
  });
  for (const planned of recovery.steps) {
    try {
      await db.transaction(async (tx) => {
        const [incident] = await tx
          .select()
          .from(t.incidents)
          .where(eq(t.incidents.id, planned.incidentId))
          .for("update");
        if (incident?.status !== "RECOVERING") throw new Error("INCIDENT_NOT_RECOVERING");
        const [row] = await tx
          .select()
          .from(t.recoverySteps)
          .where(eq(t.recoverySteps.id, planned.stepId))
          .for("update");
        if (!row) throw new Error("STEP_MISSING");
        const step = stepFromRow(row);
        const [effectRow] = await tx
          .select()
          .from(t.effects)
          .where(eq(t.effects.id, step.effectId));
        if (!effectRow) throw new Error("EFFECT_MISSING");
        const effect = effectFromRow(effectRow);
        const [event] = await tx
          .select()
          .from(t.recoveryEvidence)
          .where(eq(t.recoveryEvidence.id, `execution:${step.stepId}`));
        if (event) {
          if (step.status !== "SUCCEEDED") throw new Error("EXECUTION_LEDGER_CONFLICT");
          return;
        }
        if (step.status === "SUCCEEDED") throw new Error("EXECUTION_EVIDENCE_MISSING");
        const failures = await tx
          .select()
          .from(t.recoveryEvidence)
          .where(
            and(eq(t.recoveryEvidence.stepId, step.stepId), eq(t.recoveryEvidence.kind, "FAILURE")),
          );
        if (failures.length >= 3) throw new Error("RETRY_BOUND_EXCEEDED");
        const { params } = validateRecoveryStep(step, effect, actor, 1, availableIds);
        if (params.planFingerprint !== recovery!.plan!.assessmentHash)
          throw new Error("IMMUTABLE_PLAN_CONFLICT");
        const baseline = recovery!.plan!.primaryBefore;
        if (params.poId !== baseline.pos[0]?.id) throw new Error("TARGET_OUTSIDE_SANDBOX_BOUND");
        const baselineRows =
          effect.target.entityType === "purchase_order"
            ? baseline.pos
            : effect.target.entityType === "finance_approval"
              ? baseline.finance
              : effect.target.entityType === "receiving_allocation"
                ? baseline.receiving
                : baseline.notifications;
        if (
          canonical(baselineRows.find((r) => r.id === params.targetId)) !==
          canonical(params.expectedBefore)
        )
          throw new Error("IMMUTABLE_PLAN_CONFLICT");
        const type = effect.target.entityType as TargetType;
        const before = await targetRecord(tx, type, params.targetId);
        if (canonical(before) !== canonical(params.expectedBefore))
          throw new Error("PRECONDITION_CHANGED");
        await tx
          .update(t.recoverySteps)
          .set({ status: "EXECUTING" })
          .where(eq(t.recoverySteps.id, step.stepId));
        if (type === "receiving_allocation")
          await tx
            .delete(t.receivingAllocations)
            .where(eq(t.receivingAllocations.id, params.targetId));
        else if (type === "finance_approval")
          await tx.delete(t.financeApprovals).where(eq(t.financeApprovals.id, params.targetId));
        else if (type === "purchase_order") {
          const children = await Promise.all([
            tx.select().from(t.financeApprovals).where(eq(t.financeApprovals.poId, params.poId)),
            tx
              .select()
              .from(t.receivingAllocations)
              .where(eq(t.receivingAllocations.poId, params.poId)),
          ]);
          if (children.some((c) => c.length)) throw new Error("ACTIVE_DEPENDENT_PRECONDITION");
          await tx
            .update(t.purchaseOrders)
            .set({ status: "CANCELLED" })
            .where(eq(t.purchaseOrders.id, params.targetId));
        }
        const remediation =
          type === "supplier_notification"
            ? {
                kind: "CORRECTIVE_ESCALATION_RECORDED",
                notificationId: params.targetId,
                owner: "COMPLIANCE",
                status: "OPEN",
                message:
                  "Original notification remains historical fact. Compliance must review and arrange corrective communication; no external message was sent.",
              }
            : null;
        const after = await targetRecord(tx, type, params.targetId),
          now = new Date();
        await tx.insert(t.recoveryEvidence).values({
          id: `execution:${step.stepId}`,
          incidentId: step.incidentId,
          stepId: step.stepId,
          kind: remediation ? "REMEDIATION" : "EXECUTION",
          payload: {
            capabilityId: step.capabilityId,
            idempotencyKey: step.idempotencyKey,
            actor: { id: actor.id, authority: [...actor.authority] },
            before,
            after,
            remediation,
          },
          recordedAt: now,
        });
        await tx
          .update(t.recoverySteps)
          .set({ status: "SUCCEEDED", executedAt: now })
          .where(eq(t.recoverySteps.id, step.stepId));
      });
    } catch (error) {
      const code =
        error instanceof Error && /^[A-Z_]+$/.test(error.message)
          ? error.message
          : "COMPENSATOR_FAILED";
      await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(t.incidents)
          .where(eq(t.incidents.id, planned.incidentId))
          .for("update");
        if (!row || row.status !== "RECOVERING") return;
        const failures = await tx
          .select()
          .from(t.recoveryEvidence)
          .where(
            and(
              eq(t.recoveryEvidence.stepId, planned.stepId),
              eq(t.recoveryEvidence.kind, "FAILURE"),
            ),
          );
        if (failures.length < 3)
          await tx.insert(t.recoveryEvidence).values({
            id: `failure:${planned.stepId}:${failures.length + 1}`,
            incidentId: planned.incidentId,
            stepId: planned.stepId,
            kind: "FAILURE",
            payload: { code, attempt: failures.length + 1 },
            recordedAt: new Date(),
          });
        await tx
          .update(t.recoverySteps)
          .set({ status: "FAILED" })
          .where(eq(t.recoverySteps.id, planned.stepId));
        await moveIncident(
          tx,
          row,
          code === "RETRY_BOUND_EXCEEDED" ? "ESCALATED" : "RECOVERY_INCOMPLETE",
        );
      });
      return (await readRecovery(db, revisionId))!;
    }
  }
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(t.incidents)
      .where(eq(t.incidents.id, recovery!.incident.incidentId))
      .for("update");
    const steps = await tx
      .select()
      .from(t.recoverySteps)
      .where(eq(t.recoverySteps.incidentId, row!.id));
    if (row!.status === "RECOVERING" && steps.every((s) => s.status === "SUCCEEDED"))
      await moveIncident(tx, row!, "VERIFYING");
  });
  recovery = (await readRecovery(db, revisionId))!;
  return recovery;
}
