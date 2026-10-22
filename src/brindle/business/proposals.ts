import { z } from "zod";
import { idSchema } from "../common/schemas";

/**
 * What a reasoning model may return. Strict and closed: only the locked demo
 * decisions exist, and a model cannot add fields, tools or action names.
 * These are PROPOSALS; the deterministic gates in authorization.ts decide.
 */
const rationaleSchema = z.strictObject({
  summary: z.string().trim().min(1).max(1500),
  factors: z
    .array(
      z.strictObject({
        factor: z.string().trim().min(1).max(400),
        evidenceIds: z.array(idSchema).min(1),
      }),
    )
    .min(1)
    .max(8),
});

const proposalShape = {
  target: idSchema,
  rationale: rationaleSchema,
  /** Self-reported confidence, 0..1. Advisory only. */
  confidence: z.number().min(0).max(1),
  uncertainty: z.string().trim().max(500).optional(),
};

export const PROCUREMENT_DECISIONS = ["SELECT_SUPPLIER", "DECLINE_SUPPLIER"] as const;
export const FINANCE_DECISIONS = ["APPROVE_PO", "REJECT_PO"] as const;
export const OPERATIONS_DECISIONS = ["SCHEDULE_RECEIVING", "HOLD_RECEIVING"] as const;

export const procurementProposalSchema = z.strictObject({
  decision: z.enum(PROCUREMENT_DECISIONS),
  ...proposalShape,
});
export const financeProposalSchema = z.strictObject({
  decision: z.enum(FINANCE_DECISIONS),
  ...proposalShape,
});
export const operationsProposalSchema = z.strictObject({
  decision: z.enum(OPERATIONS_DECISIONS),
  ...proposalShape,
});

export type ProcurementProposal = z.infer<typeof procurementProposalSchema>;
export type FinanceProposal = z.infer<typeof financeProposalSchema>;
export type OperationsProposal = z.infer<typeof operationsProposalSchema>;

export type BusinessActor = "PROCUREMENT" | "FINANCE" | "OPERATIONS";

/** Every evidence id a model cites must be one it was shown. Returns the offenders. */
export function unknownCitedEvidence(
  proposal: { rationale: z.infer<typeof rationaleSchema> },
  presentedEvidenceIds: readonly string[],
): string[] {
  const allowed = new Set(presentedEvidenceIds);
  return proposal.rationale.factors.flatMap((f) => f.evidenceIds).filter((id) => !allowed.has(id));
}
