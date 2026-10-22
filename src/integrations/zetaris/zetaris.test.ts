import { describe, expect, it } from "vitest";
import { json, type Seen, zetarisDouble } from "../../test-support/protocol-doubles";
import {
  assertReadOnlySql,
  buildSelect,
  ZETARIS_RUN_PATH,
  ZetarisRequestError,
  ZetarisSqlRowSource,
} from "./http";
import { RowBackedTruthReader, UnsupportedTruthQueryError } from "./reader";

/*
 * PROTOCOL TEST DOUBLE. Imitates the hackathon Participant Setup Guide
 * contract. It is not Zetaris and proves nothing about the live service.
 */
const KEY = "zk-test-SECRET-DO-NOT-LEAK-654321";
const REST = "http://localhost:8888/api/v1.0";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const source = (fetchImpl: typeof fetch) =>
  new ZetarisSqlRowSource({
    restUrl: REST,
    apiKey: KEY,
    orgId: 42,
    schema: "brindle_truth",
    fetch: fetchImpl,
  });

describe("Zetaris canonical hackathon contract", () => {
  it("POSTs to {ZETARIS_REST_URL}/sql-editor/sqls/run, never to the generic /query/sql cursor API", async () => {
    const seen: Seen[] = [];
    await source(zetarisDouble(seen)).selectRows("supplier_master", "SUP-ATLAS");
    expect(ZETARIS_RUN_PATH).toBe("/sql-editor/sqls/run");
    expect(seen).toHaveLength(1);
    expect(seen[0]!.method).toBe("POST");
    expect(seen[0]!.url).toBe("http://localhost:8888/api/v1.0/sql-editor/sqls/run");
    expect(seen.map((s) => s.url).join()).not.toMatch(/query\/sql/);
  });

  it("sends the documented headers and body", async () => {
    const seen: Seen[] = [];
    await source(zetarisDouble(seen)).selectRows("supplier_certifications", "SUP-ATLAS");
    const req = seen[0]!;
    expect(req.headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(req.headers.get("x-org-id")).toBe("42");
    expect(req.headers.get("x-request-id")).toMatch(UUID);
    expect(req.headers.get("content-type")).toBe("application/json");
    const body = req.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["limit", "queryId", "source", "sql"]);
    expect(body.queryId).toMatch(UUID);
    expect(body.source).toBe("SqlEditor");
    expect(body.limit).toBe(100);
    expect(Number.isInteger(body.limit)).toBe(true);
    expect(body.sql).toBe(
      "SELECT * FROM brindle_truth.supplier_certifications WHERE supplier_id = 'SUP-ATLAS'",
    );
  });

  it("uses a fresh request id and query id for every call", async () => {
    const seen: Seen[] = [];
    const s = source(zetarisDouble(seen));
    await s.selectRows("supplier_master", "SUP-ATLAS");
    await s.selectRows("supplier_master", "SUP-BOREAL");
    expect(new Set(seen.map((r) => r.headers.get("x-request-id"))).size).toBe(2);
    expect(new Set(seen.map((r) => (r.body as { queryId: string }).queryId)).size).toBe(2);
    expect(s.calls.map((c) => c.operation)).toEqual(["run", "run"]);
  });

  it("parses query results from `data`", async () => {
    const rows = await source((async () =>
      json({ data: [{ supplier_id: "SUP-ATLAS", extra: 1 }] })) as typeof fetch).selectRows(
      "supplier_master",
      "SUP-ATLAS",
    );
    expect(rows).toEqual([{ supplier_id: "SUP-ATLAS", extra: 1 }]);
    expect(
      await source((async () => json({ data: [] })) as typeof fetch).selectRows(
        "supplier_master",
        "X",
      ),
    ).toEqual([]);
  });

  it("rejects a response that does not expose an array of records in `data`", async () => {
    for (const body of [
      { records: [{ a: 1 }] },
      { data: "nope" },
      { data: { rows: [] } },
      { data: [1, 2] },
      [],
    ]) {
      await expect(
        source((async () => json(body)) as typeof fetch).selectRows("supplier_master", "SUP-ATLAS"),
      ).rejects.toBeInstanceOf(ZetarisRequestError);
    }
  });

  it("is read-only: only a single plain SELECT can ever be sent", async () => {
    expect(() => assertReadOnlySql("SELECT 1")).not.toThrow();
    for (const bad of [
      "DROP TABLE x",
      "DELETE FROM x",
      "SELECT 1; DROP TABLE x",
      "SELECT 1 -- hi",
      "INSERT INTO x VALUES (1)",
      "  update x set a=1",
      "WITH x AS (DELETE FROM y RETURNING *) SELECT 1",
    ]) {
      expect(() => assertReadOnlySql(bad)).toThrow();
    }
    expect(() => buildSelect("brindle_truth", "supplier_master", "x'; DROP TABLE y; --")).toThrow();
    expect(() => buildSelect("bad schema;", "supplier_master", "SUP-ATLAS")).toThrow();
    // Whatever the reader is asked, every SQL on the wire is a SELECT.
    const seen: Seen[] = [];
    const reader = new RowBackedTruthReader(source(zetarisDouble(seen)), {
      sourceId: "zetaris",
      schema: "brindle_truth",
      now: () => new Date("2026-10-22T00:00:00Z"),
    });
    await reader.readAssertions({ subject: { entityType: "supplier", entityId: "SUP-ATLAS" } });
    await reader.readAssertions({ subject: { entityType: "policy", entityId: "POL-PROC-001" } });
    expect(seen.length).toBe(3);
    for (const s of seen)
      expect((s.body as { sql: string }).sql).toMatch(
        /^SELECT \* FROM brindle_truth\.\w+ WHERE \w+ = '[A-Za-z0-9_-]+'$/,
      );
    expect(seen.every((s) => s.method === "POST" && s.url.endsWith(ZETARIS_RUN_PATH))).toBe(true);
  });

  it("normalizes the rows it reads into TruthAssertions", async () => {
    const reader = new RowBackedTruthReader(source(zetarisDouble([])), {
      sourceId: "zetaris",
      schema: "brindle_truth",
      now: () => new Date("2026-10-22T00:00:00Z"),
    });
    const assertions = await reader.readAssertions({
      subject: { entityType: "supplier", entityId: "SUP-ATLAS" },
    });
    expect(assertions.map((a) => a.factKey).sort()).toEqual([
      "certification.ISO-9001",
      "supplier.approval_status",
      "supplier.enabled",
      "supplier.legal_name",
    ]);
    expect(assertions.every((a) => a.sourceId === "zetaris")).toBe(true);
  });

  it("rejects unsupported or unsafe queries before any request", async () => {
    const seen: Seen[] = [];
    const reader = new RowBackedTruthReader(source(zetarisDouble(seen)), {
      sourceId: "zetaris",
      schema: "s",
      now: () => new Date(),
    });
    await expect(
      reader.readAssertions({
        subject: { entityType: "supplier", entityId: "SUP-ATLAS" },
        knownAsOf: "2026-01-01T00:00:00Z",
      }),
    ).rejects.toBeInstanceOf(UnsupportedTruthQueryError);
    await expect(
      reader.readAssertions({ subject: { entityType: "spaceship", entityId: "X" } }),
    ).rejects.toBeInstanceOf(UnsupportedTruthQueryError);
    await expect(
      reader.readAssertions({ subject: { entityType: "supplier", entityId: "a'; --" } }),
    ).rejects.toBeInstanceOf(UnsupportedTruthQueryError);
    expect(seen).toHaveLength(0);
  });

  it("fails loudly and never leaks the API key", async () => {
    const unreachable = source((() =>
      Promise.reject(new TypeError(`connect ECONNREFUSED ${KEY}`))) as typeof fetch);
    const e1 = await unreachable
      .selectRows("supplier_master", "SUP-ATLAS")
      .catch((e: unknown) => e);
    expect(e1).toBeInstanceOf(ZetarisRequestError);
    expect(String((e1 as Error).message)).not.toContain(KEY);

    const rejecting = source(
      (async () => new Response(`bad key ${KEY}`, { status: 401 })) as typeof fetch,
    );
    const e2 = await rejecting.selectRows("supplier_master", "SUP-ATLAS").catch((e: unknown) => e);
    expect(e2).toMatchObject({ httpStatus: 401 });
    expect(String((e2 as Error).message)).not.toContain(KEY);
    expect(JSON.stringify(rejecting.calls)).not.toContain(KEY);
    expect(JSON.stringify(e2)).not.toContain(KEY);
  });
});
