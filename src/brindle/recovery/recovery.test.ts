import { describe, expect, it } from "vitest";
import {
  incident,
  invariantResult,
  recoveryReceipt,
  recoveryStep,
  T3,
} from "../../test-support/fixtures";
import { recoveryReceiptSchema } from "../receipts/recovery-receipt";
import { assessInvariantClosure } from "../verification/closure";
import { RECOVERY_MODE_BY_CLASSIFICATION, isModeAllowedForClassification } from "./capability";
import { deriveIdempotencyKey } from "./idempotency";
import {
  INCIDENT_STATUSES,
  IncidentTransitionError,
  canTransition,
  closeIncident,
  incidentSchema,
  transitionIncident,
} from "./incident";
import { recoveryStepSchema } from "./step";

describe("Incident cannot be falsely RECOVERED", () => {
  it("rejects RECOVERED without closure proof", () => {
    expect(incidentSchema.safeParse(incident({ status: "RECOVERED", closure: null })).success).toBe(
      false,
    );
  });

  it("rejects closure proof on a non-RECOVERED incident", () => {
    const closure = { recoveryReceiptId: "rr_1", invariantResultIds: ["res_1"], closedAt: T3 };
    expect(incidentSchema.safeParse(incident({ status: "VERIFYING", closure })).success).toBe(
      false,
    );
  });

  it("transitionIncident can never reach RECOVERED", () => {
    const verifying = incident({ status: "VERIFYING" });
    expect(() => transitionIncident(verifying, "RECOVERED", T3)).toThrow(IncidentTransitionError);
  });

  it("only VERIFYING may precede RECOVERED, and RECOVERED is terminal", () => {
    const sources = INCIDENT_STATUSES.filter((s) => canTransition(s, "RECOVERED"));
    expect(sources).toEqual(["VERIFYING"]);
    expect(INCIDENT_STATUSES.some((s) => canTransition("RECOVERED", s))).toBe(false);
  });

  it("walks the happy path through legal transitions", () => {
    let i = incident();
    for (const next of ["ANALYZING", "RECOVERY_PLANNED", "RECOVERING", "VERIFYING"] as const) {
      i = transitionIncident(i, next, T3);
    }
    expect(i.status).toBe("VERIFYING");
    expect(() => transitionIncident(incident(), "RECOVERING", T3)).toThrow(IncidentTransitionError);
  });

  it("closeIncident succeeds only with a receipt whose invariants all pass", () => {
    const verifying = incident({ status: "VERIFYING" });
    const closed = closeIncident(verifying, recoveryReceipt(), T3);
    expect(closed.status).toBe("RECOVERED");
    expect(closed.closure?.invariantResultIds).toEqual(["res_1"]);
  });

  it("closeIncident refuses non-VERIFYING incidents and non-RECOVERED receipts", () => {
    expect(() => closeIncident(incident({ status: "RECOVERING" }), recoveryReceipt(), T3)).toThrow(
      IncidentTransitionError,
    );
    const incomplete = recoveryReceipt({ verdict: "RECOVERY_INCOMPLETE" });
    expect(() => closeIncident(incident({ status: "VERIFYING" }), incomplete, T3)).toThrow(
      IncidentTransitionError,
    );
  });
});

describe("Invariant closure is deterministic and fails safe", () => {
  const required = ["inv_1"];
  it("is not closable with no results, an ERROR, or a FAIL", () => {
    expect(assessInvariantClosure([], required).closable).toBe(false);
    expect(assessInvariantClosure([invariantResult({ status: "ERROR" })], required).closable).toBe(
      false,
    );
    expect(assessInvariantClosure([invariantResult({ status: "FAIL" })], required).closable).toBe(
      false,
    );
    expect(assessInvariantClosure([invariantResult()], []).closable).toBe(false);
  });

  it("uses the latest result per invariant", () => {
    const failThenPass = [
      invariantResult({ resultId: "a", status: "FAIL", verifiedAt: "2026-04-01T00:00:00Z" }),
      invariantResult({ resultId: "b", status: "PASS", verifiedAt: "2026-04-02T00:00:00Z" }),
    ];
    expect(assessInvariantClosure(failThenPass, required).closable).toBe(true);
    const passThenFail = [
      failThenPass[1]!,
      { ...failThenPass[0]!, verifiedAt: "2026-04-03T00:00:00Z" },
    ];
    expect(assessInvariantClosure(passThenFail, required).closable).toBe(false);
  });

  it("an executor success response is not representable as closure evidence", () => {
    const r = {
      ...invariantResult(),
      observation: { kind: "EXECUTOR_SUCCESS_RESPONSE", source: "x", observedAt: T3 },
    };
    expect(
      recoveryReceiptSchema.safeParse(recoveryReceipt({ invariantResults: [r as never] })).success,
    ).toBe(false);
  });
});

describe("RecoveryReceipt honesty", () => {
  it("refuses RECOVERED verdict without passing invariants", () => {
    const r = recoveryReceipt({ invariantResults: [invariantResult({ status: "FAIL" })] });
    expect(recoveryReceiptSchema.safeParse(r).success).toBe(false);
  });

  it("refuses to describe an IRREVERSIBLE effect as reversed or compensated", () => {
    for (const outcome of ["REVERSED", "COMPENSATED"] as const) {
      const r = recoveryReceipt({
        effectOutcomes: [
          { effectId: "eff_2", classification: "IRREVERSIBLE", outcome, stepIds: ["s"] },
        ],
      });
      expect(recoveryReceiptSchema.safeParse(r).success).toBe(false);
    }
  });

  it("refuses RECOVERED while decisions are UNCERTAIN or effects UNRESOLVED", () => {
    expect(
      recoveryReceiptSchema.safeParse(
        recoveryReceipt({ decisions: { preserved: [], changed: [], uncertain: ["dec_9"] } }),
      ).success,
    ).toBe(false);
    expect(
      recoveryReceiptSchema.safeParse(
        recoveryReceipt({
          effectOutcomes: [
            { effectId: "e", classification: "COMPENSABLE", outcome: "UNRESOLVED", stepIds: [] },
          ],
        }),
      ).success,
    ).toBe(false);
  });
});

describe("Recovery capability modes and idempotency", () => {
  it("maps each classification to exactly one honest mode", () => {
    expect(RECOVERY_MODE_BY_CLASSIFICATION).toEqual({
      REVERSIBLE: "REVERSE",
      COMPENSABLE: "COMPENSATE",
      IRREVERSIBLE: "REMEDIATE",
    });
    expect(isModeAllowedForClassification("REVERSE", "IRREVERSIBLE")).toBe(false);
    expect(isModeAllowedForClassification("COMPENSATE", "IRREVERSIBLE")).toBe(false);
  });

  it("rejects a step that reverses an irreversible effect", () => {
    const bad = recoveryStep({ mode: "REVERSE", effectClassification: "IRREVERSIBLE" });
    expect(recoveryStepSchema.safeParse(bad).success).toBe(false);
    const ok = recoveryStep({ mode: "REMEDIATE", effectClassification: "IRREVERSIBLE" });
    expect(recoveryStepSchema.safeParse(ok).success).toBe(true);
  });

  it("derives idempotency keys deterministically and rejects forged ones", () => {
    const input = { incidentId: "i", effectId: "e", capabilityId: "c" };
    expect(deriveIdempotencyKey(input)).toBe(deriveIdempotencyKey({ ...input }));
    expect(deriveIdempotencyKey(input)).not.toBe(
      deriveIdempotencyKey({ ...input, effectId: "e2" }),
    );
    expect(
      recoveryStepSchema.safeParse(recoveryStep({ idempotencyKey: "a".repeat(64) })).success,
    ).toBe(false);
  });
});
