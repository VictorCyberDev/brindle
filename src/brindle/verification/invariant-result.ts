import { z } from "zod";
import { idSchema, isoTimestampSchema, jsonValueSchema } from "../common/schemas";

export const INVARIANT_STATUSES = ["PASS", "FAIL", "ERROR"] as const;

/**
 * Closure evidence must be a FRESH, INDEPENDENT read of authoritative state.
 * An executor's success response is not representable here by construction.
 */
export const invariantObservationSchema = z.strictObject({
  kind: z.literal("FRESH_INDEPENDENT_READ"),
  source: idSchema,
  observedAt: isoTimestampSchema,
});

export const invariantResultSchema = z.strictObject({
  resultId: idSchema,
  incidentId: idSchema,
  invariantId: idSchema,
  status: z.enum(INVARIANT_STATUSES),
  verifierId: idSchema,
  observation: invariantObservationSchema,
  detail: jsonValueSchema.optional(),
  verifiedAt: isoTimestampSchema,
});

export type InvariantResult = z.infer<typeof invariantResultSchema>;
