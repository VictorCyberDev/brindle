/** Test-only builders. Valid-by-default objects; tests override the field under test. */
import type { DecisionReceipt } from "../brindle/receipts/decision-receipt";
import type { RecoveryReceipt } from "../brindle/receipts/recovery-receipt";
import type { Incident } from "../brindle/recovery/incident";
import type { InvariantResult } from "../brindle/verification/invariant-result";
import { deriveIdempotencyKey } from "../brindle/recovery/idempotency";
import type { RecoveryStep } from "../brindle/recovery/step";

export const T0 = "2026-01-01T00:00:00Z";
export const T1 = "2026-02-01T00:00:00Z";
export const T2 = "2026-03-01T00:00:00Z";
export const T3 = "2026-04-01T00:00:00Z";

export function decisionReceipt(overrides: Partial<DecisionReceipt> = {}): DecisionReceipt {
  return {
    decisionId: "dec_1",
    agentId: "agent_a",
    objective: "Issue purchase order if supplier is compliant",
    decidedAt: T1,
    truthRefs: [{ assertionId: "asr_1", version: 1 }],
    memoryRefs: [{ memoryId: "mem_1", kind: "DECISION_CONTEXT", version: 1 }],
    policyVersion: "policy_v1",
    modelId: "model_x",
    promptVersion: "prompt_v1",
    schemaVersion: "schema_v1",
    chosenAction: { actionType: "issue_po", parameters: { amount: 100 } },
    targetEntity: { entityType: "supplier", entityId: "sup_1" },
    justification: {
      summary: "Supplier certificate valid",
      factors: [{ factor: "certificate status", evidenceIds: ["ev_1", "ev_2"] }],
    },
    evidence: [
      { kind: "TRUTH_VERSION", evidenceId: "ev_1", assertionId: "asr_1", version: 1 },
      { kind: "MEMORY", evidenceId: "ev_2", memoryId: "mem_1" },
    ],
    traceId: "trace_1",
    ...overrides,
  };
}

export function invariantResult(overrides: Partial<InvariantResult> = {}): InvariantResult {
  return {
    resultId: "res_1",
    incidentId: "inc_1",
    invariantId: "inv_1",
    status: "PASS",
    verifierId: "verifier_1",
    observation: { kind: "FRESH_INDEPENDENT_READ", source: "zetaris", observedAt: T3 },
    verifiedAt: T3,
    ...overrides,
  };
}

export function recoveryStep(overrides: Partial<RecoveryStep> = {}): RecoveryStep {
  const base = { incidentId: "inc_1", effectId: "eff_1", capabilityId: "cap_1" };
  return {
    stepId: "step_1",
    ...base,
    mode: "COMPENSATE",
    effectClassification: "COMPENSABLE",
    idempotencyKey: deriveIdempotencyKey(base),
    parameters: {},
    status: "PLANNED",
    plannedAt: T2,
    executedAt: null,
    ...overrides,
  };
}

export function recoveryReceipt(overrides: Partial<RecoveryReceipt> = {}): RecoveryReceipt {
  return {
    receiptId: "rr_1",
    incidentId: "inc_1",
    revisionId: "rev_1",
    verdict: "RECOVERED",
    issuedAt: T3,
    decisions: { preserved: ["dec_2"], changed: ["dec_1"], uncertain: [] },
    effectOutcomes: [
      {
        effectId: "eff_1",
        classification: "COMPENSABLE",
        outcome: "COMPENSATED",
        stepIds: ["step_1"],
      },
      {
        effectId: "eff_2",
        classification: "IRREVERSIBLE",
        outcome: "REMEDIATED",
        stepIds: ["step_2"],
      },
    ],
    requiredInvariantIds: ["inv_1"],
    invariantResults: [invariantResult()],
    traceId: "trace_9",
    ...overrides,
  };
}

export function incident(overrides: Partial<Incident> = {}): Incident {
  return {
    incidentId: "inc_1",
    revisionId: "rev_1",
    status: "OPEN",
    openedAt: T2,
    updatedAt: T2,
    closure: null,
    ...overrides,
  };
}
