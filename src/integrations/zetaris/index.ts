import type { EntityRef } from "../../brindle/common/schemas";
import type { TruthAssertion } from "../../brindle/truth/assertion";
import { IntegrationNotAvailableError } from "../errors";

/**
 * Zetaris is Brindle's governed, READ-ONLY truth plane. It observes; it never
 * mutates business state and is never Brindle's executor. Business mutations
 * go exclusively through registered RecoveryCapabilities (see ADR 0001).
 */
export interface TruthQuery {
  subject: EntityRef;
  factKey?: string;
  /** Valid-time filter: what was true in the world at this instant. */
  validAt?: string;
  /** Transaction-time filter: what Brindle/Zetaris knew as of this instant. */
  knownAsOf?: string;
}

export interface ZetarisTruthReader {
  readAssertions(query: TruthQuery): Promise<TruthAssertion[]>;
}

/** Exhaustive list of operations a Zetaris adapter may expose. Read-only by construction. */
export const ZETARIS_OPERATIONS = [
  "readAssertions",
] as const satisfies readonly (keyof ZetarisTruthReader)[];

/** Honest placeholder used when Zetaris is not configured/implemented. It fails loudly. */
export function createUnavailableZetarisReader(reason: string): ZetarisTruthReader {
  return {
    readAssertions() {
      return Promise.reject(new IntegrationNotAvailableError("zetaris", "readAssertions", reason));
    },
  };
}
