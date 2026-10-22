import { resetSandbox } from "../demo/store";
import { createEphemeralDb, type DbHandle } from "../db/client";
import { MockFixtureTruthRowSource, MOCK_TRUTH_SOURCE_ID } from "../demo/mock/mock-fixture-truth";
import {
  MOCK_MODEL_ID,
  MockDeterministicReasoner,
  type MockCall,
} from "../demo/mock/mock-reasoner";
import { RowBackedTruthReader } from "../integrations/zetaris/reader";
import type { RawRow } from "../integrations/zetaris/rows";
import { ZETARIS_SEED } from "../demo/seed-data";
import type { WorldDeps } from "../demo/run";

export const FIXED_NOW = new Date("2026-10-22T12:00:00Z");

type Tables = Record<string, readonly RawRow[]>;

/** Seed rows with targeted edits, e.g. a disabled supplier or an expired certificate. */
export function seedWith(edit: (tables: Record<string, RawRow[]>) => void): Tables {
  const copy: Record<string, RawRow[]> = Object.fromEntries(
    Object.entries(ZETARIS_SEED).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]),
  );
  edit(copy);
  return copy;
}

export interface TestWorld {
  handle: DbHandle;
  deps: WorldDeps;
  reasoner: MockDeterministicReasoner;
  close: () => Promise<void>;
}

let shared: Promise<DbHandle> | undefined;

/**
 * One migrated in-process PostgreSQL per test file (starting PGlite is slow).
 * Each world starts from a reset sandbox, so tests stay isolated.
 */
function sharedDb(): Promise<DbHandle> {
  shared ??= createEphemeralDb();
  return shared;
}

/** MOCK world over in-process PostgreSQL with every migration applied and an empty sandbox. */
export async function createMockWorld(
  options: { tables?: Tables; override?: (call: MockCall) => unknown } = {},
): Promise<TestWorld> {
  const handle = await sharedDb();
  await resetSandbox(handle.db);
  const reasoner = new MockDeterministicReasoner(options.override);
  const truth = new RowBackedTruthReader(new MockFixtureTruthRowSource(options.tables), {
    sourceId: MOCK_TRUTH_SOURCE_ID,
    schema: "MOCK_SCHEMA",
    now: () => FIXED_NOW,
  });
  return {
    handle,
    reasoner,
    close: async () => undefined,
    deps: {
      db: handle.db,
      truth,
      reasoner,
      mode: "MOCK",
      truthSourceId: MOCK_TRUTH_SOURCE_ID,
      reasoningProvider: "MOCK",
      configuredModelId: MOCK_MODEL_ID,
      now: () => FIXED_NOW,
      newRunId: () => "run-test",
    },
  };
}
