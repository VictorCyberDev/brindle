import { z } from "zod";
import { idSchema, isoTimestampSchema, toEpochMs } from "../common/schemas";
import { truthVersionRefSchema } from "./assertion";

/**
 * A revision is retroactive when the corrected truth takes effect (valid time)
 * strictly before the moment Brindle learned of it (observed time). Equal
 * instants are NOT retroactive: nothing happened in the gap.
 */
export function isRetroactiveRevision(effectiveFrom: string, observedAt: string): boolean {
  return toEpochMs(effectiveFrom) < toEpochMs(observedAt);
}

export const truthRevisionSchema = z
  .strictObject({
    revisionId: idSchema,
    previous: truthVersionRefSchema,
    replacement: truthVersionRefSchema,
    effectiveFrom: isoTimestampSchema,
    effectiveTo: isoTimestampSchema.nullable(),
    observedAt: isoTimestampSchema,
    retroactive: z.boolean(),
  })
  .superRefine((r, ctx) => {
    if (r.previous.assertionId !== r.replacement.assertionId) {
      ctx.addIssue({
        code: "custom",
        path: ["replacement", "assertionId"],
        message: "a revision replaces a version of the same logical fact",
      });
    } else if (r.replacement.version <= r.previous.version) {
      ctx.addIssue({
        code: "custom",
        path: ["replacement", "version"],
        message: "replacement version must be greater than the previous version",
      });
    }
    if (r.effectiveTo !== null && toEpochMs(r.effectiveTo) <= toEpochMs(r.effectiveFrom)) {
      ctx.addIssue({
        code: "custom",
        path: ["effectiveTo"],
        message: "effectiveTo must be after effectiveFrom",
      });
    }
    if (r.retroactive !== isRetroactiveRevision(r.effectiveFrom, r.observedAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["retroactive"],
        message: "retroactive flag disagrees with effectiveFrom vs observedAt",
      });
    }
  });

export type TruthRevision = z.infer<typeof truthRevisionSchema>;

/** Builds a validated revision, deriving `retroactive` instead of trusting the caller. */
export function createTruthRevision(input: Omit<TruthRevision, "retroactive">): TruthRevision {
  return truthRevisionSchema.parse({
    ...input,
    retroactive: isRetroactiveRevision(input.effectiveFrom, input.observedAt),
  });
}
