import type { TruthAssertion } from "../../brindle/truth/assertion";
import { toEpochMs } from "../../brindle/common/schemas";
import type { TruthQuery, ZetarisTruthReader } from "./contract";
import {
  type NormalizationContext,
  normalizeCertifications,
  normalizePolicy,
  normalizeSupplierMaster,
  type RawRow,
  TRUTH_TABLES,
  type TruthTable,
} from "./rows";

/**
 * Where raw truth rows come from. Implemented by the live Zetaris SQL client
 * and, for tests/offline work only, by an explicitly MOCK fixture source.
 * `key` is a plain identifier value; implementations must never build SQL from anything else.
 */
export interface TruthRowSource {
  selectRows(table: TruthTable, key: string): Promise<RawRow[]>;
}

const SAFE_KEY = /^[A-Za-z0-9_-]{1,64}$/;

export class UnsupportedTruthQueryError extends Error {
  override name = "UnsupportedTruthQueryError";
}

/**
 * ZetarisTruthReader over any TruthRowSource. Normalization is shared, so a
 * mock source still exercises the exact production normalization path.
 */
export class RowBackedTruthReader implements ZetarisTruthReader {
  constructor(
    private readonly rows: TruthRowSource,
    private readonly options: { sourceId: string; schema: string; now: () => Date },
  ) {}

  async readAssertions(query: TruthQuery): Promise<TruthAssertion[]> {
    if (query.knownAsOf !== undefined) {
      throw new UnsupportedTruthQueryError(
        "knownAsOf (transaction-time history) is not available from the current-state truth tables until M2",
      );
    }
    const { entityType, entityId } = query.subject;
    if (!SAFE_KEY.test(entityId))
      throw new UnsupportedTruthQueryError("entityId is not a plain identifier");

    const ctx: NormalizationContext = {
      sourceId: this.options.sourceId,
      observedAt: this.options.now().toISOString(),
      schema: this.options.schema,
    };

    let assertions: TruthAssertion[];
    if (entityType === "supplier") {
      const [master, certs] = await Promise.all([
        this.rows.selectRows(TRUTH_TABLES.supplierMaster, entityId),
        this.rows.selectRows(TRUTH_TABLES.supplierCertifications, entityId),
      ]);
      assertions = [
        ...normalizeSupplierMaster(master, ctx),
        ...normalizeCertifications(certs, ctx),
      ];
    } else if (entityType === "policy") {
      assertions = normalizePolicy(
        await this.rows.selectRows(TRUTH_TABLES.procurementPolicy, entityId),
        ctx,
      );
    } else {
      throw new UnsupportedTruthQueryError(`unsupported entityType "${entityType}"`);
    }

    return assertions.filter(
      (a) =>
        (query.factKey === undefined || a.factKey === query.factKey) &&
        (query.validAt === undefined ||
          (toEpochMs(a.validFrom) <= toEpochMs(query.validAt) &&
            (a.validTo === null || toEpochMs(query.validAt) < toEpochMs(a.validTo)))),
    );
  }
}
