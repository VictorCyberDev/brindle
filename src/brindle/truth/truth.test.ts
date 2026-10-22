import { describe, expect, it } from "vitest";
import { T0, T1, T2 } from "../../test-support/fixtures";
import { truthAssertionSchema } from "./assertion";
import { createTruthRevision, isRetroactiveRevision, truthRevisionSchema } from "./revision";

const revisionInput = {
  revisionId: "rev_1",
  previous: { assertionId: "asr_1", version: 1 },
  replacement: { assertionId: "asr_1", version: 2 },
  effectiveTo: null,
};

describe("TruthRevision retroactivity", () => {
  it("is retroactive when valid time starts before Brindle learned of it", () => {
    const r = createTruthRevision({ ...revisionInput, effectiveFrom: T0, observedAt: T2 });
    expect(r.retroactive).toBe(true);
  });

  it("is not retroactive when effective in the future of observation", () => {
    const r = createTruthRevision({ ...revisionInput, effectiveFrom: T2, observedAt: T1 });
    expect(r.retroactive).toBe(false);
  });

  it("is not retroactive when effective time equals observed time", () => {
    expect(isRetroactiveRevision(T1, T1)).toBe(false);
  });

  it("compares instants, not strings (offset-aware)", () => {
    // 10:00+02:00 == 08:00Z, which is before 09:00Z
    expect(isRetroactiveRevision("2026-01-01T10:00:00+02:00", "2026-01-01T09:00:00Z")).toBe(true);
  });

  it("rejects a retroactive flag that disagrees with the timestamps", () => {
    const bad = { ...revisionInput, effectiveFrom: T0, observedAt: T2, retroactive: false };
    expect(truthRevisionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a revision across different logical facts or non-increasing versions", () => {
    const base = { ...revisionInput, effectiveFrom: T0, observedAt: T2, retroactive: true };
    expect(
      truthRevisionSchema.safeParse({ ...base, replacement: { assertionId: "asr_2", version: 2 } })
        .success,
    ).toBe(false);
    expect(
      truthRevisionSchema.safeParse({ ...base, replacement: { assertionId: "asr_1", version: 1 } })
        .success,
    ).toBe(false);
  });
});

describe("TruthAssertion bitemporality", () => {
  const assertion = {
    truthVersionId: "tv_1",
    assertionId: "asr_1",
    version: 1,
    subject: { entityType: "supplier", entityId: "sup_1" },
    sourceId: "zetaris",
    factKey: "certification.status",
    value: { status: "VALID" },
    validFrom: T0,
    validTo: null,
    observedAt: T1,
    provenance: { recordedBy: "ingest_1" },
  };

  it("keeps valid time and observed time as separate fields", () => {
    const parsed = truthAssertionSchema.parse(assertion);
    expect(parsed.validFrom).toBe(T0);
    expect(parsed.observedAt).toBe(T1);
  });

  it("rejects an empty or inverted valid-time range", () => {
    expect(truthAssertionSchema.safeParse({ ...assertion, validTo: T0 }).success).toBe(false);
  });
});
