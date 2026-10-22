import { z } from "zod";
import { idSchema, isoTimestampSchema } from "../common/schemas";
import { chosenActionSchema } from "../receipts/decision-receipt";
import { truthVersionRefSchema } from "../truth/assertion";

export const COUNTERFACTUAL_RESULTS = ["SAME", "CHANGED", "UNCERTAIN"] as const;
export const counterfactualResultSchema = z.enum(COUNTERFACTUAL_RESULTS);
export type CounterfactualResult = z.infer<typeof counterfactualResultSchema>;

/**
 * Counterfactual replay reconstructs the ORIGINAL decision context with the
 * CORRECTED fact substituted. It must not rerun against today's whole world.
 */
const reconstructionSchema = z.strictObject({
  originalContextRefs: z.array(truthVersionRefSchema).min(1),
  correctedFactRef: truthVersionRefSchema,
});

const baseShape = {
  assessmentId: idSchema,
  decisionId: idSchema,
  revisionId: idSchema,
  reconstruction: reconstructionSchema,
  assessedAt: isoTimestampSchema,
  modelId: idSchema.optional(),
  traceId: idSchema,
};

/**
 * UNCERTAIN is a first-class outcome with a mandatory reason. Nothing in this
 * module coerces it to SAME or CHANGED.
 */
export const counterfactualAssessmentSchema = z.discriminatedUnion("result", [
  z.strictObject({ ...baseShape, result: z.literal("SAME") }),
  z.strictObject({
    ...baseShape,
    result: z.literal("CHANGED"),
    counterfactualAction: chosenActionSchema,
  }),
  z.strictObject({
    ...baseShape,
    result: z.literal("UNCERTAIN"),
    uncertaintyReason: z.string().trim().min(1).max(2000),
  }),
]);

export type CounterfactualAssessment = z.infer<typeof counterfactualAssessmentSchema>;
