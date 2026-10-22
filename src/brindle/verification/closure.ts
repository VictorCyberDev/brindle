import { toEpochMs } from "../common/schemas";
import type { InvariantResult } from "./invariant-result";

export type ClosureAssessment =
  { closable: true } | { closable: false; reasons: readonly string[] };

/**
 * Deterministic invariant closure. An incident is closable only when EVERY
 * required invariant has a latest result that is PASS. ERROR counts as not
 * passing. A tie between differing statuses at the same instant fails safe.
 */
export function assessInvariantClosure(
  results: readonly InvariantResult[],
  requiredInvariantIds: readonly string[],
): ClosureAssessment {
  const reasons: string[] = [];
  if (requiredInvariantIds.length === 0) {
    reasons.push("no required invariants were specified");
  }

  for (const invariantId of new Set(requiredInvariantIds)) {
    const forInvariant = results.filter((r) => r.invariantId === invariantId);
    if (forInvariant.length === 0) {
      reasons.push(`invariant "${invariantId}" has no result`);
      continue;
    }
    const latestAt = Math.max(...forInvariant.map((r) => toEpochMs(r.verifiedAt)));
    const latest = forInvariant.filter((r) => toEpochMs(r.verifiedAt) === latestAt);
    if (latest.some((r) => r.status !== "PASS")) {
      reasons.push(`invariant "${invariantId}" is not passing in its latest result`);
    }
  }

  return reasons.length === 0 ? { closable: true } : { closable: false, reasons };
}
