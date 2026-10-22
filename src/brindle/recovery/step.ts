import { z } from "zod";
import { idSchema, isoTimestampSchema, jsonObjectSchema } from "../common/schemas";
import { effectClassificationSchema } from "../graph/effect";
import { isModeAllowedForClassification, recoveryModeSchema } from "./capability";
import { deriveIdempotencyKey } from "./idempotency";

export const RECOVERY_STEP_STATUSES = [
  "PLANNED",
  "EXECUTING",
  "SUCCEEDED",
  "FAILED",
  "SKIPPED",
] as const;

export const recoveryStepSchema = z
  .strictObject({
    stepId: idSchema,
    incidentId: idSchema,
    effectId: idSchema,
    capabilityId: idSchema,
    mode: recoveryModeSchema,
    effectClassification: effectClassificationSchema,
    idempotencyKey: z.string().regex(/^[0-9a-f]{64}$/),
    parameters: jsonObjectSchema,
    status: z.enum(RECOVERY_STEP_STATUSES),
    plannedAt: isoTimestampSchema,
    executedAt: isoTimestampSchema.nullable(),
  })
  .superRefine((s, ctx) => {
    if (!isModeAllowedForClassification(s.mode, s.effectClassification)) {
      ctx.addIssue({
        code: "custom",
        path: ["mode"],
        message: `mode ${s.mode} is not permitted for a ${s.effectClassification} effect`,
      });
    }
    const expected = deriveIdempotencyKey(s);
    if (s.idempotencyKey !== expected) {
      ctx.addIssue({
        code: "custom",
        path: ["idempotencyKey"],
        message: "idempotencyKey must be the deterministic key for (incident, effect, capability)",
      });
    }
    if (s.status === "PLANNED" && s.executedAt !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["executedAt"],
        message: "a PLANNED step has not executed",
      });
    }
  });

export type RecoveryStep = z.infer<typeof recoveryStepSchema>;
