import { z } from "zod";
import {
  entityRefSchema,
  idSchema,
  isoTimestampSchema,
  jsonValueSchema,
  toEpochMs,
} from "../common/schemas";

/**
 * Bitemporal semantics (see docs/ARCHITECTURE.md):
 *  - valid time    = [validFrom, validTo): when the fact was true in the world.
 *  - observed time = observedAt: when Brindle learned this version of the fact.
 * The two are never conflated; a late correction has validFrom < observedAt.
 */
export const truthVersionRefSchema = z.strictObject({
  assertionId: idSchema,
  version: z.number().int().min(1),
});

export type TruthVersionRef = z.infer<typeof truthVersionRefSchema>;

export const truthProvenanceSchema = z.strictObject({
  /** Brindle component or reader that recorded this version. */
  recordedBy: idSchema,
  /** Pointer into the source system's own record, if it exposes one. */
  sourceRecordRef: z.string().trim().min(1).optional(),
});

export const truthAssertionSchema = z
  .strictObject({
    /** Identity of this specific version row. */
    truthVersionId: idSchema,
    /** Stable identity of the logical fact across all of its versions. */
    assertionId: idSchema,
    version: z.number().int().min(1),
    subject: entityRefSchema,
    sourceId: idSchema,
    factKey: idSchema,
    value: jsonValueSchema,
    validFrom: isoTimestampSchema,
    /** null = open-ended. */
    validTo: isoTimestampSchema.nullable(),
    observedAt: isoTimestampSchema,
    provenance: truthProvenanceSchema,
  })
  .refine((a) => a.validTo === null || toEpochMs(a.validTo) > toEpochMs(a.validFrom), {
    message: "validTo must be after validFrom (or null for open-ended)",
    path: ["validTo"],
  });

export type TruthAssertion = z.infer<typeof truthAssertionSchema>;
