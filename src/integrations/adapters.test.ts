import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MOCK_MODEL_ID } from "../demo/mock/mock-reasoner";
import { ZETARIS_SEED } from "../demo/seed-data";
import { json, type Seen, zetarisDouble } from "../test-support/protocol-doubles";
import { ReasoningOutputInvalidError } from "./nemotron";
import {
  extractJsonObject,
  OpenAiCompatibleNemotronReasoner,
  ReasoningProviderError,
} from "./nemotron/openai-compatible";
import {
  assertReadOnlySql,
  buildSelect,
  ZetarisRequestError,
  ZetarisSqlRowSource,
} from "./zetaris/http";
import { RowBackedTruthReader, UnsupportedTruthQueryError } from "./zetaris/reader";
import {
  assertionIdFor,
  normalizeCertifications,
  normalizeSupplierMaster,
  TruthNormalizationError,
} from "./zetaris/rows";

/*
 * PROTOCOL TEST DOUBLES. These stand in for the Zetaris and OpenAI-compatible
 * HTTP APIs to check that our adapters speak the documented protocol. They are
 * not Zetaris, not Nemotron, and prove nothing about the sponsors' live services.
 */

const SECRET = "sk-test-SECRET-DO-NOT-LEAK-123456";
describe("Zetaris adapter speaks the documented protocol (protocol double)", () => {
  it("authenticates with Bearer + X-Org-ID + X-Request-ID, runs a read-only SELECT, and closes the cursor", async () => {
    const seen: Seen[] = [];
    const source = new ZetarisSqlRowSource({
      baseUrl: "https://tenant.example.test",
      apiKey: SECRET,
      orgId: 42,
      schema: "brindle_truth",
      fetch: zetarisDouble(seen),
    });
    const reader = new RowBackedTruthReader(source, {
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
    const starts = seen.filter((s) => s.url.endsWith("/start"));
    expect(starts).toHaveLength(2); // supplier_master + supplier_certifications
    for (const s of starts) {
      expect(s.method).toBe("POST");
      expect(s.headers.get("authorization")).toBe(`Bearer ${SECRET}`);
      expect(s.headers.get("x-org-id")).toBe("42");
      expect(s.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
      expect(s.body).toMatchObject({ pageLimit: 100 });
      expect((s.body as { select: string }).select).toMatch(
        /^SELECT \* FROM brindle_truth\.supplier_(master|certifications) WHERE supplier_id = 'SUP-ATLAS'$/,
      );
    }
    expect(seen.filter((s) => s.method === "DELETE" && s.url.endsWith("/close/qt-1"))).toHaveLength(
      2,
    );
    // Only ever SELECT / close: no write verb is ever issued.
    expect(seen.every((s) => ["POST", "DELETE"].includes(s.method))).toBe(true);
  });

  it("can only produce a single plain SELECT", () => {
    expect(() => assertReadOnlySql("SELECT 1")).not.toThrow();
    for (const bad of [
      "DROP TABLE x",
      "DELETE FROM x",
      "SELECT 1; DROP TABLE x",
      "SELECT 1 -- hi",
      "INSERT INTO x VALUES (1)",
      "  update x set a=1",
    ]) {
      expect(() => assertReadOnlySql(bad)).toThrow();
    }
    expect(() => buildSelect("brindle_truth", "supplier_master", "x'; DROP TABLE y; --")).toThrow();
    expect(() => buildSelect("bad schema;", "supplier_master", "SUP-ATLAS")).toThrow();
  });

  it("fails loudly and never leaks the token when Zetaris is unreachable or rejects us", async () => {
    const unreachable = new ZetarisSqlRowSource({
      baseUrl: "https://tenant.example.test",
      apiKey: SECRET,
      orgId: 1,
      schema: "s",
      fetch: (() =>
        Promise.reject(new TypeError(`connect ECONNREFUSED with ${SECRET}`))) as typeof fetch,
    });
    const error = await unreachable
      .selectRows("supplier_master", "SUP-ATLAS")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ZetarisRequestError);
    expect(String((error as Error).message)).not.toContain(SECRET);

    const rejecting = new ZetarisSqlRowSource({
      baseUrl: "https://tenant.example.test",
      apiKey: SECRET,
      orgId: 1,
      schema: "s",
      fetch: (async () => new Response(`bad token ${SECRET}`, { status: 401 })) as typeof fetch,
    });
    const rejected = await rejecting
      .selectRows("supplier_master", "SUP-ATLAS")
      .catch((e: unknown) => e);
    expect(rejected).toMatchObject({ httpStatus: 401 });
    expect(String((rejected as Error).message)).not.toContain(SECRET);
    expect(JSON.stringify(rejecting.calls)).not.toContain(SECRET);
  });

  it("rejects responses that do not match the documented shape, and unsupported queries", async () => {
    const odd = new ZetarisSqlRowSource({
      baseUrl: "https://t.example.test",
      apiKey: SECRET,
      orgId: 1,
      schema: "s",
      fetch: (async () => json({ unexpected: true })) as typeof fetch,
    });
    await expect(odd.selectRows("supplier_master", "SUP-ATLAS")).rejects.toBeInstanceOf(
      ZetarisRequestError,
    );

    const reader = new RowBackedTruthReader(
      { selectRows: async () => [] },
      { sourceId: "zetaris", schema: "s", now: () => new Date() },
    );
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
  });
});

describe("truth normalization", () => {
  const ctx = { sourceId: "zetaris", observedAt: "2026-10-22T00:00:00Z", schema: "s" };

  it("maps Zetaris-style rows (any key case, string booleans, UTC timestamps) to TruthAssertions", () => {
    const [enabled] = normalizeSupplierMaster(
      [
        {
          SUPPLIER_ID: "SUP-ATLAS",
          LEGAL_NAME: "Atlas Components",
          ENABLED: "TRUE",
          APPROVAL_STATUS: "APPROVED",
          UPDATED_AT: "2025-01-15 00:00:00",
        },
      ],
      ctx,
    ).filter((a) => a.factKey === "supplier.enabled");
    expect(enabled).toMatchObject({
      value: true,
      validFrom: "2025-01-15T00:00:00.000Z",
      validTo: null,
      observedAt: ctx.observedAt,
      sourceId: "zetaris",
    });
    expect(enabled!.provenance.sourceRecordRef).toBe("s.supplier_master#SUP-ATLAS");
  });

  it("derives certification valid time from the row, keeping observed time separate", () => {
    const [cert] = normalizeCertifications([ZETARIS_SEED.supplier_certifications[0]], ctx);
    expect(cert).toMatchObject({
      factKey: "certification.ISO-9001",
      validFrom: "2025-01-15T00:00:00.000Z",
      validTo: "2030-01-14T00:00:00.000Z",
    });
    expect(cert!.observedAt).toBe(ctx.observedAt);
    expect(cert!.value).toEqual({
      certificationId: "CERT-ATLAS-9001",
      certificationType: "ISO-9001",
      status: "VALID",
    });
  });

  it("assigns stable, source-scoped assertion identities", () => {
    const a = assertionIdFor("zetaris", "supplier", "SUP-ATLAS", "supplier.enabled");
    expect(a).toBe(assertionIdFor("zetaris", "supplier", "SUP-ATLAS", "supplier.enabled"));
    expect(a).not.toBe(
      assertionIdFor("MOCK:zetaris-fixture", "supplier", "SUP-ATLAS", "supplier.enabled"),
    );
    expect(a).not.toBe(assertionIdFor("zetaris", "supplier", "SUP-BOREAL", "supplier.enabled"));
  });

  it("fails closed on rows it cannot parse", () => {
    const bad = {
      supplier_id: "S",
      legal_name: "n",
      enabled: "maybe",
      approval_status: "APPROVED",
      updated_at: "2025-01-01",
    };
    expect(() => normalizeSupplierMaster([bad], ctx)).toThrow(TruthNormalizationError);
    expect(() =>
      normalizeSupplierMaster([{ ...bad, enabled: "true", updated_at: "garbage" }], ctx),
    ).toThrow(TruthNormalizationError);
    expect(() => normalizeCertifications([{ certification_id: "c" }], ctx)).toThrow(
      TruthNormalizationError,
    );
  });
});

describe("OpenAI-compatible Nemotron reasoner speaks the documented protocol (protocol double)", () => {
  const schema = z.strictObject({ decision: z.enum(["A", "B"]) });
  const meta = {
    task: "DECISION" as const,
    promptVersion: "p",
    schemaVersion: "s",
    traceId: "tr",
    input: { hello: "world" },
  };
  const make = (respond: (req: Seen) => Response, seen: Seen[] = []) =>
    new OpenAiCompatibleNemotronReasoner({
      provider: "nvidia",
      baseUrl: "https://nim.example.test/v1",
      apiKey: SECRET,
      modelId: "nvidia/test-model",
      fetch: (async (url: RequestInfo | URL, init?: RequestInit) => {
        const s = {
          method: init?.method ?? "GET",
          url: String(url),
          headers: new Headers(init?.headers),
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        };
        seen.push(s);
        return respond(s);
      }) as typeof fetch,
    });
  const completion = (content: string) =>
    json(
      { model: "nvidia/test-model-served", choices: [{ message: { content } }] },
      { headers: { "x-request-id": "req-123" } },
    );

  it("sends a tool-free chat completion and returns schema-validated output with provenance", async () => {
    const seen: Seen[] = [];
    const reasoner = make(
      () => completion('<think>private reasoning</think>\n```json\n{"decision":"A"}\n```'),
      seen,
    );
    const result = await reasoner.reason({ meta, outputSchema: schema });

    expect(result).toMatchObject({
      output: { decision: "A" },
      modelId: "nvidia/test-model-served",
      provider: "nvidia",
      providerRequestId: "req-123",
      traceId: "tr",
    });
    const req = seen[0]!;
    expect(req.url).toBe("https://nim.example.test/v1/chat/completions");
    expect(req.headers.get("authorization")).toBe(`Bearer ${SECRET}`);
    const body = req.body as Record<string, unknown>;
    expect(body).toMatchObject({ model: "nvidia/test-model", temperature: 0, stream: false });
    for (const forbidden of ["tools", "functions", "tool_choice", "function_call"])
      expect(body).not.toHaveProperty(forbidden);
    expect(JSON.stringify(result)).not.toContain("private reasoning");
  });

  it("lists models from GET /models", async () => {
    const reasoner = make(() => json({ data: [{ id: "a" }, { id: "nvidia/test-model" }] }));
    expect(await reasoner.listModels()).toEqual(["a", "nvidia/test-model"]);
  });

  it("rejects non-JSON, schema-violating and extra-field output", async () => {
    await expect(
      make(() => completion("I think A.")).reason({ meta, outputSchema: schema }),
    ).rejects.toBeInstanceOf(ReasoningProviderError);
    await expect(
      make(() => completion('{"decision":"C"}')).reason({ meta, outputSchema: schema }),
    ).rejects.toBeInstanceOf(ReasoningOutputInvalidError);
    await expect(
      make(() => completion('{"decision":"A","tool":"rm -rf"}')).reason({
        meta,
        outputSchema: schema,
      }),
    ).rejects.toBeInstanceOf(ReasoningOutputInvalidError);
  });

  it("surfaces provider failures without leaking the key", async () => {
    const reasoner = make(() => new Response(`unauthorized ${SECRET}`, { status: 401 }));
    const error = await reasoner.reason({ meta, outputSchema: schema }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReasoningProviderError);
    expect(String((error as Error).message)).not.toContain(SECRET);
    expect(JSON.stringify(reasoner.calls)).not.toContain(SECRET);
    const unreachable = new OpenAiCompatibleNemotronReasoner({
      provider: "meterless",
      baseUrl: "http://192.168.1.20:8088/v1",
      apiKey: SECRET,
      modelId: "m",
      fetch: (() => Promise.reject(new TypeError(SECRET))) as typeof fetch,
    });
    const e2 = await unreachable.reason({ meta, outputSchema: schema }).catch((e: unknown) => e);
    expect(String((e2 as Error).message)).not.toContain(SECRET);
  });

  it("extracts JSON from noisy model text", () => {
    expect(extractJsonObject('Sure! {"a":1} done')).toEqual({ a: 1 });
    expect(() => extractJsonObject("no json")).toThrow(ReasoningProviderError);
  });

  it("the mock model id can never be mistaken for a sponsor model", () => {
    expect(MOCK_MODEL_ID).toMatch(/^MOCK:/);
  });
});
