import { z } from "zod";
import { idSchema, isoTimestampSchema, toEpochMs } from "../common/schemas";
import type { RecoveryReceipt } from "../receipts/recovery-receipt";
import { assessInvariantClosure } from "../verification/closure";

export const INCIDENT_STATUSES = [
  "OPEN",
  "ANALYZING",
  "RECOVERY_PLANNED",
  "RECOVERING",
  "VERIFYING",
  "RECOVERY_INCOMPLETE",
  "ESCALATED",
  "RECOVERED",
] as const;

export const incidentStatusSchema = z.enum(INCIDENT_STATUSES);
export type IncidentStatus = z.infer<typeof incidentStatusSchema>;

/**
 * Explicit lifecycle. RECOVERED is reachable ONLY from VERIFYING and ONLY via
 * `closeIncident`, which demands a verified RecoveryReceipt. ANALYZING may go
 * straight to VERIFYING when analysis finds nothing to change: the invariants
 * must still be independently verified before closure.
 */
export const INCIDENT_TRANSITIONS: Readonly<Record<IncidentStatus, readonly IncidentStatus[]>> = {
  OPEN: ["ANALYZING", "ESCALATED"],
  ANALYZING: ["RECOVERY_PLANNED", "VERIFYING", "ESCALATED"],
  RECOVERY_PLANNED: ["RECOVERING", "ESCALATED"],
  RECOVERING: ["VERIFYING", "RECOVERY_INCOMPLETE", "ESCALATED"],
  VERIFYING: ["RECOVERED", "RECOVERY_INCOMPLETE", "ESCALATED"],
  RECOVERY_INCOMPLETE: ["RECOVERY_PLANNED", "ESCALATED"],
  ESCALATED: ["ANALYZING", "RECOVERY_PLANNED"],
  RECOVERED: [],
};

export function canTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  return INCIDENT_TRANSITIONS[from].includes(to);
}

export const incidentClosureSchema = z.strictObject({
  recoveryReceiptId: idSchema,
  invariantResultIds: z.array(idSchema).min(1),
  closedAt: isoTimestampSchema,
});

export const incidentSchema = z
  .strictObject({
    incidentId: idSchema,
    revisionId: idSchema,
    status: incidentStatusSchema,
    openedAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
    closure: incidentClosureSchema.nullable(),
  })
  .superRefine((i, ctx) => {
    if (i.status === "RECOVERED" && i.closure === null) {
      ctx.addIssue({
        code: "custom",
        path: ["closure"],
        message: "RECOVERED requires closure proof (receipt + invariant results)",
      });
    }
    if (i.status !== "RECOVERED" && i.closure !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["closure"],
        message: "only a RECOVERED incident may carry closure",
      });
    }
    if (toEpochMs(i.updatedAt) < toEpochMs(i.openedAt)) {
      ctx.addIssue({ code: "custom", path: ["updatedAt"], message: "updatedAt precedes openedAt" });
    }
  });

export type Incident = z.infer<typeof incidentSchema>;

export class IncidentTransitionError extends Error {
  override name = "IncidentTransitionError";
}

export function transitionIncident(incident: Incident, to: IncidentStatus, at: string): Incident {
  if (to === "RECOVERED") {
    throw new IncidentTransitionError("RECOVERED is only reachable through closeIncident()");
  }
  if (!canTransition(incident.status, to)) {
    throw new IncidentTransitionError(`illegal transition ${incident.status} -> ${to}`);
  }
  return incidentSchema.parse({ ...incident, status: to, updatedAt: at });
}

/** The only path to RECOVERED: a VERIFYING incident plus a receipt whose invariant closure holds. */
export function closeIncident(incident: Incident, receipt: RecoveryReceipt, at: string): Incident {
  if (incident.status !== "VERIFYING") {
    throw new IncidentTransitionError(`cannot close an incident in status ${incident.status}`);
  }
  if (receipt.incidentId !== incident.incidentId) {
    throw new IncidentTransitionError("receipt belongs to a different incident");
  }
  if (receipt.verdict !== "RECOVERED") {
    throw new IncidentTransitionError(`receipt verdict is ${receipt.verdict}, not RECOVERED`);
  }
  const closure = assessInvariantClosure(receipt.invariantResults, receipt.requiredInvariantIds);
  if (!closure.closable) {
    throw new IncidentTransitionError(`invariant closure not met: ${closure.reasons.join("; ")}`);
  }
  return incidentSchema.parse({
    ...incident,
    status: "RECOVERED",
    updatedAt: at,
    closure: {
      recoveryReceiptId: receipt.receiptId,
      invariantResultIds: receipt.invariantResults.map((r) => r.resultId),
      closedAt: at,
    },
  });
}
