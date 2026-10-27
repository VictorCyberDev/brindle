import { describe, expect, it } from "vitest";
import { json, type Seen, zetarisDouble } from "../../test-support/protocol-doubles";
import {
  assertReadOnlySql,
  buildSelect,
  ZETARIS_RUN_PATH,
  ZetarisRequestError,
  ZetarisSqlRowSource,
} from "./http";
import { ZetarisResponseShapeUnsupportedError } from "./errors";
import { RowBackedTruthReader, UnsupportedTruthQueryError } from "./reader";
import { classifyZetarisResponse, resolveColumnNames } from "./response-shape";

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

describe("Zetaris response families (data may be object rows or positional rows)", () => {
  const run = (body: unknown) =>
    source((async () => json(body)) as typeof fetch).selectRows("supplier_master", "SUP-ATLAS");

  it("1. object-row `data` still works and is classified OBJECT_ROWS", async () => {
    expect(await run({ data: [{ supplier_id: "SUP-ATLAS" }] })).toEqual([
      { supplier_id: "SUP-ATLAS" },
    ]);
    const s = source((async () => json({ data: [{ a: 1 }, { a: 2 }] })) as typeof fetch);
    await s.selectRows("supplier_master", "SUP-ATLAS");
    expect(s.calls[0]!.responseShape).toMatchObject({
      family: "OBJECT_ROWS",
      rowCount: 2,
      dataType: "array",
    });
  });

  it("2. positional-row `data` is recognized as a legitimate response family", () => {
    expect(classifyZetarisResponse({ data: [["SUP-ATLAS", "Atlas Components", true]] })).toEqual({
      family: "POSITIONAL_ROWS",
      dataType: "array",
      rowCount: 1,
      firstRowWidth: 3,
      topLevelKeys: ["data"],
      columnMetadata: "NONE_RECOGNIZED",
    });
    expect(classifyZetarisResponse({ data: [] }).family).toBe("EMPTY");
    expect(classifyZetarisResponse({ data: [{ a: 1 }] }).family).toBe("OBJECT_ROWS");
    expect(classifyZetarisResponse({ data: [{ a: 1 }, ["x"]] }).family).toBe("MIXED_ROWS");
    expect(classifyZetarisResponse({ data: "x" }).family).toBe("UNRECOGNIZED");
    expect(classifyZetarisResponse({ nodata: [] }).family).toBe("UNRECOGNIZED");
    expect(classifyZetarisResponse([]).family).toBe("UNRECOGNIZED");
  });

  it("3. undocumented metadata aliases are not used to guess column order", () => {
    for (const metadata of [
      { columns: ["supplier_id"] },
      { schema: [{ name: "supplier_id" }] },
      { meta: ["supplier_id"] },
      { fields: ["supplier_id"] },
    ]) {
      expect(resolveColumnNames({ data: [["SUP-ATLAS"]], ...metadata })).toBeNull();
    }
  });

  it("maps positional rows using the live HeaderRows contract and reports its metadata source", async () => {
    const body = {
      headers: ["legal_name", "supplier_id"],
      data: [["Atlas Components", "SUP-ATLAS"]],
      total: 1,
      timeUsed: 8,
    };
    expect(await run(body)).toEqual([{ legal_name: "Atlas Components", supplier_id: "SUP-ATLAS" }]);
    expect(classifyZetarisResponse(body)).toMatchObject({
      family: "POSITIONAL_ROWS",
      columnMetadata: "HEADERS",
      firstRowWidth: 2,
    });
    expect(await run({ headers: ["one"], data: [["1"]], total: 1, timeUsed: 3 })).toEqual([
      { one: "1" },
    ]);
  });

  it("rejects malformed or ambiguous headers and inconsistent row widths", async () => {
    for (const headers of [
      [],
      [""],
      [" supplier_id"],
      ["supplier_id "],
      [null],
      [1],
      ["supplier_id", "supplier_id"],
      ["supplier_id", "SUPPLIER_ID"],
    ]) {
      expect(resolveColumnNames({ headers })).toBeNull();
      await expect(run({ headers, data: [["SUP-ATLAS"]] })).rejects.toBeInstanceOf(
        ZetarisResponseShapeUnsupportedError,
      );
    }
    for (const data of [[["SUP-ATLAS", "extra"]], [["SUP-ATLAS"], []]]) {
      await expect(run({ headers: ["supplier_id"], data })).rejects.toBeInstanceOf(
        ZetarisResponseShapeUnsupportedError,
      );
    }
  });

  it("4. positional rows without usable column metadata fail with the dedicated compatibility error", async () => {
    const error = await run({
      data: [["SUP-ATLAS", "Atlas Components"]],
      columns: ["supplier_id", "legal_name"],
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ZetarisResponseShapeUnsupportedError);
    expect(error).toBeInstanceOf(ZetarisRequestError);
    expect((error as ZetarisResponseShapeUnsupportedError).shape).toMatchObject({
      family: "POSITIONAL_ROWS",
      rowCount: 1,
      firstRowWidth: 2,
      topLevelKeys: ["columns", "data"],
    });
    expect((error as Error).message).toMatch(/POSITIONAL_ROWS.*cannot be normalized/s);
  });

  it("5. the compatibility error carries no secrets and no row values", async () => {
    const body = { data: [["SUP-ATLAS", KEY, "tenant-secret-value"]], note: `bearer ${KEY}` };
    const s = source((async () => json(body)) as typeof fetch);
    const error = (await s
      .selectRows("supplier_master", "SUP-ATLAS")
      .catch((e: unknown) => e)) as ZetarisResponseShapeUnsupportedError;
    const everything = JSON.stringify({
      message: error.message,
      shape: error.shape,
      calls: s.calls,
      name: error.name,
      status: error.httpStatus,
    });
    for (const secret of [KEY, "tenant-secret-value", "SUP-ATLAS"])
      expect(everything).not.toContain(secret);
    expect(error.shape.topLevelKeys).toEqual(["data", "note"]); // key names only
  });

  it("6. the smoke-test response `data: [[1]]` is classified, not treated as impossible", async () => {
    expect(classifyZetarisResponse({ data: [[1]] })).toMatchObject({
      family: "POSITIONAL_ROWS",
      rowCount: 1,
      firstRowWidth: 1,
    });
    const s = source((async () => json({ data: [[1]] })) as typeof fetch);
    const error = await s.selectRows("supplier_master", "SUP-ATLAS").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ZetarisResponseShapeUnsupportedError);
    expect(s.calls[0]!.responseShape?.family).toBe("POSITIONAL_ROWS"); // surfaced to the live probe
  });

  it("does not misreport unusable bodies as positional or as JSON failures", async () => {
    for (const body of [{ data: "nope" }, { data: { rows: [] } }, { data: [1, 2] }, []]) {
      const error = await run(body).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ZetarisResponseShapeUnsupportedError);
      expect((error as ZetarisResponseShapeUnsupportedError).shape.family).toBe("UNRECOGNIZED");
    }
  });
});
