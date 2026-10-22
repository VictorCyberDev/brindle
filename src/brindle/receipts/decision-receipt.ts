import { z } from "zod";
import { entityRefSchema, idSchema, isoTimestampSchema, jsonObjectSchema } from "../common/schemas";
import { memoryRefSchema } from "../memory/memory-ref";
import { truthVersionRefSchema } from "../truth/assertion";

/**
 * Evidence is inspectable and typed. A DecisionReceipt deliberately has no
 * field for hidden chain-of-thought; the schema is strict, so extra keys are rejected.
 */
export const evidenceItemSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("TRUTH_VERSION"),
    evidenceId: idSchema,
    assertionId: idSchema,
    version: z.number().int().min(1),
  }),
  z.strictObject({
    kind: z.literal("MEMORY"),
    evidenceId: idSchema,
    memoryId: idSchema,
  }),
  z.strictObject({
    kind: z.literal("POLICY"),
    evidenceId: idSchema,
    policyId: idSchema,
    policyVersion: idSchema,
  }),
  z.strictObject({
    kind: z.literal("DOCUMENT"),
    evidenceId: idSchema,
    documentId: idSchema,
  }),
]);

export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

export const justificationSchema = z.strictObject({
  summary: z.string().trim().min(1).max(2000),
  factors: z
    .array(
      z.strictObject({
        factor: z.string().trim().min(1).max(500),
        evidenceIds: z.array(idSchema).min(1),
      }),
    )
    .min(1),
});

export const chosenActionSchema = z.strictObject({
  actionType: idSchema,
  parameters: jsonObjectSchema,
});

export const decisionReceiptSchema = z
  .strictObject({
    decisionId: idSchema,
    agentId: idSchema,
    objective: z.string().trim().min(1).max(2000),
    decidedAt: isoTimestampSchema,
    truthRefs: z.array(truthVersionRefSchema).min(1),
    memoryRefs: z.array(memoryRefSchema).default([]),
    policyVersion: idSchema,
    modelId: idSchema,
    promptVersion: idSchema,
    schemaVersion: idSchema,
    chosenAction: chosenActionSchema,
    targetEntity: entityRefSchema,
    justification: justificationSchema,
    evidence: z.array(evidenceItemSchema).min(1),
    traceId: idSchema,
  })
  .superRefine((d, ctx) => {
    const evidenceIds = new Set<string>();
    d.evidence.forEach((e, i) => {
      if (evidenceIds.has(e.evidenceId)) {
        ctx.addIssue({
          code: "custom",
          path: ["evidence", i, "evidenceId"],
          message: `duplicate evidenceId "${e.evidenceId}"`,
        });
      }
      evidenceIds.add(e.evidenceId);
    });

    d.justification.factors.forEach((f, fi) =>
      f.evidenceIds.forEach((id, ii) => {
        if (!evidenceIds.has(id)) {
          ctx.addIssue({
            code: "custom",
            path: ["justification", "factors", fi, "evidenceIds", ii],
            message: `justification cites unknown evidenceId "${id}"`,
          });
        }
      }),
    );

    const truthKeys = new Set(d.truthRefs.map((t) => `${t.assertionId}@${t.version}`));
    const memoryIds = new Set(d.memoryRefs.map((m) => m.memoryId));
    d.evidence.forEach((e, i) => {
      if (e.kind === "TRUTH_VERSION" && !truthKeys.has(`${e.assertionId}@${e.version}`)) {
        ctx.addIssue({
          code: "custom",
          path: ["evidence", i],
          message: "TRUTH_VERSION evidence must be declared in truthRefs",
        });
      }
      if (e.kind === "MEMORY" && !memoryIds.has(e.memoryId)) {
        ctx.addIssue({
          code: "custom",
          path: ["evidence", i],
          message: "MEMORY evidence must be declared in memoryRefs",
        });
      }
    });
  });

export type DecisionReceipt = z.infer<typeof decisionReceiptSchema>;
