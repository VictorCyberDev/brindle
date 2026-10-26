import { z } from "zod";

/**
 * Evidence Brindle accepts from a customer's agents through POST /api/v1/*. This is evidence
 * ingestion only. There is no field, endpoint or scope that lets a caller name an action to execute
 * or grant itself recovery authority.
 */
const id = z.string().trim().min(1).max(120);
const short = z.string().trim().min(1).max(300);
const instant = z.iso.datetime({ offset: true });

export const REVERSIBILITY = ["REVERSIBLE", "COMPENSABLE", "IRREVERSIBLE"] as const;

export const consequenceInputSchema = z.strictObject({
  objectType: id,
  objectId: id,
  description: short,
  /** Declared by the integration. Brindle shows it as declared and does not infer it. */
  reversibility: z.enum(REVERSIBILITY),
});

export const decisionIngestSchema = z.strictObject({
  agent: z.strictObject({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(300).optional(),
    owner: z.string().trim().max(80).optional(),
    connectedSystems: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
  }),
  decisionId: id,
  decidedAt: instant,
  summary: z.string().trim().min(3).max(300),
  action: z.strictObject({ type: id, target: id }),
  truthInputs: z
    .array(
      z.strictObject({
        subjectType: id,
        subjectId: id,
        factKey: id,
        value: z.json(),
      }),
    )
    .min(1)
    .max(20),
  consequences: z.array(consequenceInputSchema).max(20).default([]),
});
export type DecisionIngest = z.infer<typeof decisionIngestSchema>;

export const truthRevisionIngestSchema = z
  .strictObject({
    revisionId: id,
    subjectType: id,
    subjectId: id,
    factKey: id,
    previousValue: z.json(),
    newValue: z.json(),
    /** When the new value became true in the world (valid time). */
    effectiveFrom: instant,
    /** When Brindle's customer learned of it (observed time). */
    observedAt: instant,
  })
  .refine((r) => JSON.stringify(r.previousValue) !== JSON.stringify(r.newValue), {
    message: "previousValue and newValue are identical: nothing changed",
    path: ["newValue"],
  });
export type TruthRevisionIngest = z.infer<typeof truthRevisionIngestSchema>;

export const MAX_BODY_BYTES = 64 * 1024;
