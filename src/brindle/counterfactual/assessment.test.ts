import { describe, expect, it } from "vitest";
import { T2 } from "../../test-support/fixtures";
import { COUNTERFACTUAL_RESULTS, counterfactualAssessmentSchema } from "./assessment";

const base = {
  assessmentId: "ca_1",
  decisionId: "dec_1",
  revisionId: "rev_1",
  reconstruction: {
    originalContextRefs: [{ assertionId: "asr_1", version: 1 }],
    correctedFactRef: { assertionId: "asr_1", version: 2 },
  },
  assessedAt: T2,
  traceId: "trace_1",
};

describe("CounterfactualAssessment", () => {
  it("has exactly SAME, CHANGED and UNCERTAIN", () => {
    expect([...COUNTERFACTUAL_RESULTS]).toEqual(["SAME", "CHANGED", "UNCERTAIN"]);
  });

  it("keeps UNCERTAIN as a first-class result, never coerced", () => {
    const parsed = counterfactualAssessmentSchema.parse({
      ...base,
      result: "UNCERTAIN",
      uncertaintyReason: "Policy threshold is ambiguous for this supplier tier",
    });
    expect(parsed.result).toBe("UNCERTAIN");
  });

  it("refuses UNCERTAIN without a reason and CHANGED without the counterfactual action", () => {
    expect(counterfactualAssessmentSchema.safeParse({ ...base, result: "UNCERTAIN" }).success).toBe(
      false,
    );
    expect(counterfactualAssessmentSchema.safeParse({ ...base, result: "CHANGED" }).success).toBe(
      false,
    );
  });

  it("accepts SAME and CHANGED, and rejects other verdicts", () => {
    expect(counterfactualAssessmentSchema.safeParse({ ...base, result: "SAME" }).success).toBe(
      true,
    );
    expect(
      counterfactualAssessmentSchema.safeParse({
        ...base,
        result: "CHANGED",
        counterfactualAction: { actionType: "hold_po", parameters: {} },
      }).success,
    ).toBe(true);
    expect(counterfactualAssessmentSchema.safeParse({ ...base, result: "MAYBE" }).success).toBe(
      false,
    );
  });

  it("requires the original context plus the corrected fact", () => {
    const noContext = {
      ...base,
      result: "SAME",
      reconstruction: { ...base.reconstruction, originalContextRefs: [] },
    };
    expect(counterfactualAssessmentSchema.safeParse(noContext).success).toBe(false);
  });
});
