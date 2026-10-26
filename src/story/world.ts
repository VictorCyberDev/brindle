import { createEphemeralDb, type DbHandle } from "../db/client";
import { MockFixtureTruthRowSource, MOCK_TRUTH_SOURCE_ID } from "../demo/mock/mock-fixture-truth";
import {
  MOCK_MODEL_ID,
  MockDeterministicReasoner,
  type MockCall,
} from "../demo/mock/mock-reasoner";
import type { WorldDeps } from "../demo/run";
import { ZETARIS_SEED } from "../demo/seed-data";
import { RowBackedTruthReader } from "../integrations/zetaris/reader";
import type { RawRow } from "../integrations/zetaris/rows";

/** Fixed clock used by the executable evaluation, so reruns are comparable. */
export const EVAL_CLOCK = new Date("2026-10-22T12:00:00Z");

export interface IsolatedWorld {
  handle: DbHandle;
  deps: WorldDeps;
  reasoner: MockDeterministicReasoner;
  /** Moves the world clock (decisions are stamped with it). */
  setClock: (to: Date) => void;
  close: () => Promise<void>;
}

/**
 * A brand-new, private, in-process PostgreSQL (PGlite) with every migration applied, running the
 * REAL Brindle engine over labelled MOCK truth and a MOCK reasoner. Nothing is shared between
 * worlds, so a public visitor can never see or disturb anyone else's run, and no production
 * database is touched.
 */
export async function createIsolatedWorld(
  options: {
    clock?: Date;
    tables?: Record<string, readonly RawRow[]>;
    override?: (call: MockCall) => unknown;
  } = {},
): Promise<IsolatedWorld> {
  let clock = options.clock ?? EVAL_CLOCK;
  const handle = await createEphemeralDb();
  const reasoner = new MockDeterministicReasoner(options.override);
  const tables = options.tables ?? ZETARIS_SEED;
  const now = () => clock;
  const truth = new RowBackedTruthReader(new MockFixtureTruthRowSource(tables), {
    sourceId: MOCK_TRUTH_SOURCE_ID,
    schema: "MOCK_SCHEMA",
    now,
  });
  return {
    handle,
    reasoner,
    setClock: (to) => {
      clock = to;
    },
    close: () => handle.close(),
    deps: {
      db: handle.db,
      truth,
      reasoner,
      mode: "MOCK",
      truthSourceId: MOCK_TRUTH_SOURCE_ID,
      reasoningProvider: "MOCK",
      configuredModelId: MOCK_MODEL_ID,
      now,
      newRunId: () => `run-${clock.toISOString()}`,
    },
  };
}
