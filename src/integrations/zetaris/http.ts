import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { TruthRowSource } from "./reader";
import type { RawRow, TruthTable } from "./rows";
import { TRUTH_TABLES } from "./rows";

/**
 * LIVE Zetaris SQL client, implemented against the hackathon Participant Setup
 * Guide contract (Zetaris runs as a local Docker truth plane; REST base e.g.
 * http://localhost:8888/api/v1.0, configured via ZETARIS_REST_URL):
 *
 *   POST {ZETARIS_REST_URL}/sql-editor/sqls/run
 *   Authorization: Bearer <Zetaris API key>
 *   X-Org-ID: <org id>
 *   X-Request-ID: <fresh uuid>
 *   Content-Type: application/json
 *   {"queryId": "<fresh uuid>", "sql": "<fixed read-only SELECT>", "source": "SqlEditor", "limit": <int>}
 *
 * The query results are exposed through the response's `data`.
 *
 * READ-ONLY by construction: SQL is only ever produced from the fixed
 * template below, there is no method that accepts caller-supplied SQL, and a
 * guard rejects anything that is not a single SELECT.
 *
 * (The earlier /query/sql/start|page|close cursor API from Zetaris's generic
 * OpenAPI spec is NOT the hackathon path and is not used.)
 */
export interface ZetarisHttpConfig {
  /** Full REST base including version path, e.g. http://localhost:8888/api/v1.0 */
  restUrl: string;
  apiKey: string;
  orgId: number;
  schema: string;
  fetch?: typeof fetch;
}

export const ZETARIS_RUN_PATH = "/sql-editor/sqls/run";
export const ZETARIS_SOURCE = "SqlEditor";
/** Truth tables are tiny; the limit is a hard bound, not a pagination size. */
export const ZETARIS_ROW_LIMIT = 100;

export interface ZetarisCallRecord {
  requestId: string;
  queryId: string;
  operation: "run";
  httpStatus: number;
  /** Response-side correlation header, if Zetaris returns one. */
  serverRequestId: string | null;
}

/** Documented shape: results live in `data`. Records must be objects (column -> value). */
const runResponseSchema = z.object({ data: z.array(z.record(z.string(), z.unknown())) });

const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const KEY = /^[A-Za-z0-9_-]{1,64}$/;
const KEY_COLUMN: Record<TruthTable, string> = {
  [TRUTH_TABLES.supplierMaster]: "supplier_id",
  [TRUTH_TABLES.supplierCertifications]: "supplier_id",
  [TRUTH_TABLES.procurementPolicy]: "policy_id",
};

export function assertReadOnlySql(sql: string): void {
  if (!/^\s*select\s/i.test(sql) || sql.includes(";") || /--|\/\*/.test(sql)) {
    throw new Error("refusing to run: only a single plain SELECT statement is permitted");
  }
}

export function buildSelect(schema: string, table: TruthTable, key: string): string {
  if (!IDENT.test(schema)) throw new Error("invalid schema identifier");
  if (!KEY.test(key)) throw new Error("invalid key");
  const sql = `SELECT * FROM ${schema}.${table} WHERE ${KEY_COLUMN[table]} = '${key}'`;
  assertReadOnlySql(sql);
  return sql;
}

export class ZetarisRequestError extends Error {
  override name = "ZetarisRequestError";
  constructor(
    message: string,
    public readonly httpStatus: number | null,
    public readonly requestId: string,
  ) {
    super(message);
  }
}

export class ZetarisSqlRowSource implements TruthRowSource {
  /** Secret-free log of every HTTP call made, for live probes and evidence. */
  readonly calls: ZetarisCallRecord[] = [];
  private readonly doFetch: typeof fetch;

  constructor(private readonly config: ZetarisHttpConfig) {
    this.doFetch = config.fetch ?? fetch;
  }

  async selectRows(table: TruthTable, key: string): Promise<RawRow[]> {
    const sql = buildSelect(this.config.schema, table, key);
    const requestId = randomUUID();
    const queryId = randomUUID();
    let res: Response;
    try {
      res = await this.doFetch(`${this.config.restUrl}${ZETARIS_RUN_PATH}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "X-Org-ID": String(this.config.orgId),
          "X-Request-ID": requestId,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ queryId, sql, source: ZETARIS_SOURCE, limit: ZETARIS_ROW_LIMIT }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      throw new ZetarisRequestError(
        `Zetaris is not reachable (${error instanceof Error ? error.name : "network error"})`,
        null,
        requestId,
      );
    }
    this.calls.push({
      requestId,
      queryId,
      operation: "run",
      httpStatus: res.status,
      serverRequestId: res.headers.get("x-request-id"),
    });
    if (!res.ok) {
      // Body is not echoed: it may contain tenant details. Status + our request id suffice for support.
      throw new ZetarisRequestError(
        `Zetaris run failed with HTTP ${res.status}`,
        res.status,
        requestId,
      );
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new ZetarisRequestError("Zetaris response was not JSON", res.status, requestId);
    }
    const parsed = runResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new ZetarisRequestError(
        "Zetaris response did not expose an array of records in `data`",
        res.status,
        requestId,
      );
    }
    if (parsed.data.data.length >= ZETARIS_ROW_LIMIT) {
      throw new ZetarisRequestError(
        "Zetaris result reached the row limit; truth tables must be tiny",
        res.status,
        requestId,
      );
    }
    return parsed.data.data as RawRow[];
  }
}
