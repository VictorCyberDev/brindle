import type { RawRow, TruthTable } from "../../integrations/zetaris/rows";
import type { TruthRowSource } from "../../integrations/zetaris/reader";
import { ZETARIS_SEED } from "../seed-data";

/** sourceId stamped on every assertion produced from the fixture: never "zetaris". */
export const MOCK_TRUTH_SOURCE_ID = "MOCK:zetaris-fixture";

/**
 * MOCK. NOT ZETARIS. A TruthRowSource that serves the local seed rows so that
 * tests and offline development can run. No network call is made and its
 * output must never be presented as sponsor evidence.
 */
export class MockFixtureTruthRowSource implements TruthRowSource {
  constructor(private readonly tables: Record<string, readonly RawRow[]> = ZETARIS_SEED) {}

  selectRows(table: TruthTable, key: string): Promise<RawRow[]> {
    const keyColumn = table === "procurement_policy" ? "policy_id" : "supplier_id";
    return Promise.resolve(
      (this.tables[table] ?? []).filter((r) => r[keyColumn] === key).map((r) => ({ ...r })),
    );
  }
}
