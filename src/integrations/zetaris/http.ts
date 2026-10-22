import { randomUUID } from "node:crypto";
import { z } from "zod";
import { IntegrationNotAvailableError } from "../errors";
import type { RawRow, TruthTable } from "./rows";
import { TRUTH_TABLES } from "./rows";
import type { TruthRowSource } from "./reader";

/**
 * LIVE Zetaris SQL client, implemented against Zetaris's published OpenAPI
 * spec (https://api.saas.enterprise.zetaris.com/redoc/docs.yaml, v1):
 *   POST   /api/v1.0/query/sql/start            {select, pageLimit}  -> OpenSqlResponse
 *   GET    /api/v1.0/query/sql/page             ?queryToken&pageLimit&pageNumber
 *   DELETE /api/v1.0/query/sql/close/{queryToken}
 * Auth: `Authorization: Bearer <Zetaris API token>`, plus `X-Org-ID` (int64)
 * and `X-Request-ID` (uuid) on every call.
 *
 * READ-ONLY by construction: SQL is only ever produced from the fixed
 * templates below, there is no method that accepts caller-supplied SQL, and a
 * guard rejects anything that is not a single SELECT.
 */
export interface ZetarisHttpConfig {
  baseUrl: string;
  apiKey: string;
  orgId: number;
  schema: string;
  fetch?: typeof fetch;
}

export interface ZetarisCallRecord {
  requestId: string;
  operation: "start" | "page" | "close";
  httpStatus: number;
  /** Response-side correlation header, if Zetaris returns one. */
  serverRequestId: string | null;
}

const openSqlResponse = z.object({
  records: z.array(z.record(z.string(), z.unknown())).optional(),
  pageNumber: z.number(),
  pageLimit: z.number(),
  totalCount: z.number(),
  totalPages: z.number(),
  queryToken: z.string().min(1),
});

const PAGE_LIMIT = 100;
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
    const first = await this.call("start", "POST", "/api/v1.0/query/sql/start", {
      select: sql,
      pageLimit: PAGE_LIMIT,
    });
    const page = openSqlResponse.safeParse(first);
    if (!page.success) {
      throw new ZetarisRequestError(
        "Zetaris start response did not match the documented OpenSqlResponse shape",
        null,
        "n/a",
      );
    }
    try {
      if (page.data.totalPages > 1) {
        throw new IntegrationNotAvailableError(
          "zetaris",
          "selectRows",
          "multi-page results are not supported in M1 (truth tables are expected to be tiny)",
        );
      }
      return (page.data.records ?? []) as RawRow[];
    } finally {
      await this.close(page.data.queryToken);
    }
  }

  private async close(queryToken: string): Promise<void> {
    try {
      await this.call(
        "close",
        "DELETE",
        `/api/v1.0/query/sql/close/${encodeURIComponent(queryToken)}`,
      );
    } catch {
      // Best-effort cleanup of a server-side cursor; never mask the real outcome.
    }
  }

  private async call(
    operation: ZetarisCallRecord["operation"],
    method: "POST" | "GET" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const requestId = randomUUID();
    let res: Response;
    try {
      res = await this.doFetch(`${this.config.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "X-Org-ID": String(this.config.orgId),
          "X-Request-ID": requestId,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
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
      operation,
      httpStatus: res.status,
      serverRequestId: res.headers.get("x-request-id"),
    });
    if (!res.ok) {
      // Body is not echoed: it may contain tenant details. Status + our request id suffice for support.
      throw new ZetarisRequestError(
        `Zetaris ${operation} failed with HTTP ${res.status}`,
        res.status,
        requestId,
      );
    }
    return operation === "close" ? null : res.json();
  }
}
