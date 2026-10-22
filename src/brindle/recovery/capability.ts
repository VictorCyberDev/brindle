import { z } from "zod";
import { idSchema } from "../common/schemas";
import type { EffectClassification } from "../graph/effect";

export const RECOVERY_MODES = ["REVERSE", "COMPENSATE", "REMEDIATE"] as const;
export const recoveryModeSchema = z.enum(RECOVERY_MODES);
export type RecoveryMode = z.infer<typeof recoveryModeSchema>;

/**
 * The only recovery mode permitted for each effect classification.
 * IRREVERSIBLE effects can be remediated, never reversed or "rolled back".
 */
export const RECOVERY_MODE_BY_CLASSIFICATION = {
  REVERSIBLE: "REVERSE",
  COMPENSABLE: "COMPENSATE",
  IRREVERSIBLE: "REMEDIATE",
} as const satisfies Record<EffectClassification, RecoveryMode>;

export function isModeAllowedForClassification(
  mode: RecoveryMode,
  classification: EffectClassification,
): boolean {
  return RECOVERY_MODE_BY_CLASSIFICATION[classification] === mode;
}

/**
 * Descriptor of a registered, bounded business mutation. This is the ONLY
 * route by which Brindle may later change business state. The registry and
 * executors arrive in M4; M0 fixes the shape.
 */
export const recoveryCapabilitySchema = z.strictObject({
  capabilityId: idSchema,
  name: z.string().trim().min(1).max(200),
  version: idSchema,
  mode: recoveryModeSchema,
  targetEntityTypes: z.array(idSchema).min(1),
  /** Deterministic authority: permissions the acting identity must hold. */
  requiredAuthority: z.array(idSchema).min(1),
  bounds: z.strictObject({ maxAffectedObjects: z.number().int().min(1) }),
  idempotency: z.strictObject({ strategy: z.literal("DERIVED_KEY_V1") }),
});

export type RecoveryCapability = z.infer<typeof recoveryCapabilitySchema>;
