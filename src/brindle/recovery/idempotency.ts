import { createHash } from "node:crypto";

export interface IdempotencyKeyInput {
  incidentId: string;
  effectId: string;
  capabilityId: string;
}

/**
 * Deterministic idempotency key (strategy DERIVED_KEY_V1). The same incident,
 * effect and capability always yield the same key; no clocks, no randomness.
 */
export function deriveIdempotencyKey(input: IdempotencyKeyInput): string {
  const canonical = JSON.stringify([
    "brindle:idem:v1",
    input.incidentId,
    input.effectId,
    input.capabilityId,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}
