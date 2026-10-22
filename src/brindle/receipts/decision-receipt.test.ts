import { describe, expect, it } from "vitest";
import { decisionReceipt } from "../../test-support/fixtures";
import { decisionReceiptSchema } from "./decision-receipt";

const parse = (v: unknown) => decisionReceiptSchema.safeParse(v);

describe("DecisionReceipt validation", () => {
  it("accepts a well-formed receipt", () => {
    expect(parse(decisionReceipt()).success).toBe(true);
  });

  it("rejects empty evidence", () => {
    expect(parse(decisionReceipt({ evidence: [] })).success).toBe(false);
  });

  it("rejects evidence with an unknown kind or missing fields", () => {
    const base = decisionReceipt();
    expect(parse({ ...base, evidence: [{ kind: "VIBES", evidenceId: "ev_1" }] }).success).toBe(
      false,
    );
    expect(
      parse({ ...base, evidence: [{ kind: "TRUTH_VERSION", evidenceId: "ev_1" }] }).success,
    ).toBe(false);
  });

  it("rejects duplicate evidence ids and justification citing unknown evidence", () => {
    const base = decisionReceipt();
    const dup = [...base.evidence, base.evidence[0]];
    expect(parse({ ...base, evidence: dup }).success).toBe(false);
    expect(
      parse({
        ...base,
        justification: { ...base.justification, factors: [{ factor: "x", evidenceIds: ["nope"] }] },
      }).success,
    ).toBe(false);
  });

  it("rejects truth evidence that is not a declared truth reference", () => {
    const r = decisionReceipt({
      evidence: [{ kind: "TRUTH_VERSION", evidenceId: "ev_1", assertionId: "other", version: 1 }],
      justification: { summary: "s", factors: [{ factor: "f", evidenceIds: ["ev_1"] }] },
    });
    expect(parse(r).success).toBe(false);
  });

  it("has no place for hidden chain-of-thought (strict schema)", () => {
    expect(parse({ ...decisionReceipt(), chainOfThought: "private reasoning" }).success).toBe(
      false,
    );
  });
});
