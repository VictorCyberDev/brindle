import { z } from "zod";
import { idSchema, isoTimestampSchema } from "../common/schemas";
import { effectClassificationSchema, type EffectClassification } from "../graph/effect";
import { assessInvariantClosure } from "../verification/closure";
import { invariantResultSchema } from "../verification/invariant-result";

export const RECOVERY_VERDICTS = ["RECOVERED", "RECOVERY_INCOMPLETE", "ESCALATED"] as const;
export const EFFECT_OUTCOMES = ["REVERSED", "COMPENSATED", "REMEDIATED", "UNRESOLVED"] as const;
export type EffectOutcome = (typeof EFFECT_OUTCOMES)[number];

/** Which outcome vocabulary is honest for each classification. */
const OUTCOME_FOR_CLASSIFICATION = {
  REVERSIBLE: "REVERSED",
  COMPENSABLE: "COMPENSATED",
  IRREVERSIBLE: "REMEDIATED",
} as const satisfies Record<EffectClassification, EffectOutcome>;

export const effectOutcomeSchema = z
  .strictObject({
    effectId: idSchema,
    classification: effectClassificationSchema,
    outcome: z.enum(EFFECT_OUTCOMES),
    stepIds: z.array(idSchema),
  })
  .superRefine((o, ctx) => {
    if (o.outcome !== "UNRESOLVED" && o.outcome !== OUTCOME_FOR_CLASSIFICATION[o.classification]) {
      ctx.addIssue({
        code: "custom",
        path: ["outcome"],
        message: `a ${o.classification} effect cannot have outcome ${o.outcome}`,
      });
    }
    if (o.outcome !== "UNRESOLVED" && o.stepIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["stepIds"], message: "a resolved effect needs steps" });
    }
  });

export const recoveryReceiptSchema = z
  .strictObject({
    receiptId: idSchema,
    incidentId: idSchema,
    revisionId: idSchema,
    verdict: z.enum(RECOVERY_VERDICTS),
    issuedAt: isoTimestampSchema,
    decisions: z.strictObject({
      preserved: z.array(idSchema),
      changed: z.array(idSchema),
      uncertain: z.array(idSchema),
    }),
    effectOutcomes: z.array(effectOutcomeSchema),
    requiredInvariantIds: z.array(idSchema).min(1),
    invariantResults: z.array(invariantResultSchema),
    traceId: idSchema,
  })
  .superRefine((r, ctx) => {
    const all = [...r.decisions.preserved, ...r.decisions.changed, ...r.decisions.uncertain];
    if (new Set(all).size !== all.length) {
      ctx.addIssue({
        code: "custom",
        path: ["decisions"],
        message: "a decision appears in more than one of preserved/changed/uncertain",
      });
    }
    r.invariantResults.forEach((res, i) => {
      if (res.incidentId !== r.incidentId) {
        ctx.addIssue({
          code: "custom",
          path: ["invariantResults", i, "incidentId"],
          message: "invariant result belongs to a different incident",
        });
      }
    });

    if (r.verdict === "RECOVERED") {
      if (r.effectOutcomes.some((o) => o.outcome === "UNRESOLVED")) {
        ctx.addIssue({
          code: "custom",
          path: ["verdict"],
          message: "RECOVERED with UNRESOLVED effects",
        });
      }
      if (r.decisions.uncertain.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["verdict"],
          message: "RECOVERED with UNCERTAIN decisions",
        });
      }
      const closure = assessInvariantClosure(r.invariantResults, r.requiredInvariantIds);
      if (!closure.closable) {
        ctx.addIssue({
          code: "custom",
          path: ["verdict"],
          message: `RECOVERED without invariant closure: ${closure.reasons.join("; ")}`,
        });
      }
    }
  });

export type RecoveryReceipt = z.infer<typeof recoveryReceiptSchema>;
