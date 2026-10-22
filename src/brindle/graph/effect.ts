import { z } from "zod";
import { entityRefSchema, idSchema, isoTimestampSchema } from "../common/schemas";

export const EFFECT_CLASSIFICATIONS = ["REVERSIBLE", "COMPENSABLE", "IRREVERSIBLE"] as const;

export const effectClassificationSchema = z.enum(EFFECT_CLASSIFICATIONS);
export type EffectClassification = z.infer<typeof effectClassificationSchema>;

/**
 * Effects are classified by deterministic rules, never by an LLM. `ruleId`
 * names the rule that produced the classification so it can be audited.
 */
export const effectSchema = z.strictObject({
  effectId: idSchema,
  /** The ACTION node in the consequence graph that produced this effect. */
  actionNodeId: idSchema,
  classification: effectClassificationSchema,
  target: entityRefSchema,
  description: z.string().trim().min(1).max(1000),
  classifiedBy: z.literal("DETERMINISTIC_RULE"),
  ruleId: idSchema,
  occurredAt: isoTimestampSchema,
});

export type Effect = z.infer<typeof effectSchema>;
