import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, providerModeOf, summarizeConfig } from "../config/env";
import { createEphemeralDb } from "../db/client";
import { OpenAiCompatibleNemotronReasoner } from "../integrations/nemotron/openai-compatible";
import { ZetarisSqlRowSource } from "../integrations/zetaris/http";
import { RowBackedTruthReader } from "../integrations/zetaris/reader";
import { chatDouble, type Seen, zetarisDouble } from "../test-support/protocol-doubles";
import { FIXED_NOW } from "../test-support/world";
import { MOCK_MODEL_ID } from "./mock/mock-reasoner";
import { runSuccessWorld } from "./run";
import { createWorldRuntime, LiveNotConfiguredError } from "./runtime";
import { getReceipt, readDemoState } from "./store";

const RUNTIME_TOKEN = "mt-test-SECRET-DO-NOT-LEAK-111111";
const ZETARIS_KEY = "zk-test-SECRET-DO-NOT-LEAK-654321";
const SECRET = RUNTIME_TOKEN;

const liveEnv = {
  BRINDLE_RUNTIME_MODE: "live",
  DATABASE_URL: "postgres://u:p@db.example.test:5432/brindle",
  ZETARIS_REST_URL: "http://localhost:8888/api/v1.0",
  ZETARIS_API_KEY: ZETARIS_KEY,
  ZETARIS_ORG_ID: "7",
  ZETARIS_SCHEMA: "brindle_truth",
  METERLESS_BASE_URL: "http://localhost:9000",
  METERLESS_RUNTIME_TOKEN: RUNTIME_TOKEN,
  METERLESS_MODEL: "meterless/auto",
};

describe("the real adapters drive the full world (protocol doubles at the HTTP edge)", () => {
  async function drive(reportedModel: string | null) {
    const handle = await createEphemeralDb();
    const zSeen: Seen[] = [];
    const nSeen: Seen[] = [];
    const source = new ZetarisSqlRowSource({
      restUrl: "http://localhost:8888/api/v1.0",
      apiKey: ZETARIS_KEY,
      orgId: 7,
      schema: "brindle_truth",
      fetch: zetarisDouble(zSeen),
    });
    const reasoner = new OpenAiCompatibleNemotronReasoner({
      route: {
        provider: "meterless",
        baseUrl: "http://localhost:9000",
        runtimeToken: RUNTIME_TOKEN,
        runtimeRoute: "meterless/auto",
      },
      fetch: chatDouble(nSeen, reportedModel),
    });
    const result = await runSuccessWorld({
      db: handle.db,
      truth: new RowBackedTruthReader(source, {
        sourceId: "zetaris",
        schema: "brindle_truth",
        now: () => FIXED_NOW,
      }),
      reasoner,
      // Declared MOCK on purpose: the HTTP edge is a protocol double, so this must never be recorded as LIVE.
      mode: "MOCK",
      truthSourceId: "zetaris",
      reasoningProvider: "meterless",
      configuredModelId: "route:meterless/auto",
      now: () => FIXED_NOW,
    });
    return { handle, result, zSeen, nSeen };
  }

  it("runs end to end through Zetaris REST + Meterless runtime adapters and records route and model separately", async () => {
    const { handle, result, zSeen, nSeen } = await drive("nvidia/nemotron-3-super");
    try {
      expect(result.status).toBe("COMPLETED");
      expect(nSeen).toHaveLength(6);
      expect(nSeen.every((r) => r.url === "http://localhost:9000/v1/chat/completions")).toBe(true);
      expect(zSeen.every((s) => s.url.endsWith("/sql-editor/sqls/run"))).toBe(true);
      const receipt = (await getReceipt(handle.db, "dec:PO-827:finance"))!;
      expect(receipt.modelId).toBe("nvidia/nemotron-3-super");
      const run = (await readDemoState(handle.db)).latestRun!;
      expect(run).toMatchObject({
        runtimeRoute: "meterless/auto",
        underlyingModel: "nvidia/nemotron-3-super",
      });
      const state = await readDemoState(handle.db);
      expect(state.purchaseOrders.map((p) => p.po.status)).toEqual([
        "RECEIVING_SCHEDULED",
        "RECEIVING_SCHEDULED",
      ]);
      for (const secret of [RUNTIME_TOKEN, ZETARIS_KEY]) {
        expect(JSON.stringify(state)).not.toContain(secret);
        expect(JSON.stringify(receipt)).not.toContain(secret);
      }
    } finally {
      await handle.close();
    }
  });

  it("when the runtime reports only a route, receipts say route:<id> and the underlying model is unproven", async () => {
    const { handle, result } = await drive("meterless/auto");
    try {
      expect(result.status).toBe("COMPLETED");
      const receipt = (await getReceipt(handle.db, "dec:PO-827:procurement"))!;
      expect(receipt.modelId).toBe("route:meterless/auto");
      const run = (await readDemoState(handle.db)).latestRun!;
      expect(run.runtimeRoute).toBe("meterless/auto");
      expect(run.underlyingModel).toBeNull();
    } finally {
      await handle.close();
    }
  });
});

describe("mock vs live separation", () => {
  afterEach(() => undefined);

  it("local runtime is MOCK with labelled doubles, even if credentials are present", async () => {
    const config = loadConfig({ ...liveEnv, BRINDLE_RUNTIME_MODE: "local", DATABASE_URL: "" });
    expect(providerModeOf(config)).toBe("MOCK");
    const runtime = await createWorldRuntime(config);
    try {
      expect(runtime.deps).toMatchObject({
        mode: "MOCK",
        reasoningProvider: "MOCK",
        configuredModelId: MOCK_MODEL_ID,
      });
      expect(runtime.deps.truthSourceId).toMatch(/^MOCK:/);
      expect(runtime.handle.kind).toBe("pglite");
      expect(runtime.zetarisCalls()).toHaveLength(0);
    } finally {
      await runtime.handle.close();
    }
  });

  it("live config selects LIVE with the real adapters and real identifiers (no network needed to construct)", async () => {
    const config = loadConfig(liveEnv);
    expect(providerModeOf(config)).toBe("LIVE");
    // Construct against a throwaway local DB handle path: createWorldRuntime would open DATABASE_URL lazily (postgres.js connects on first query).
    const runtime = await createWorldRuntime(config);
    try {
      expect(runtime.deps).toMatchObject({
        mode: "LIVE",
        truthSourceId: "zetaris",
        reasoningProvider: "meterless",
        configuredModelId: "route:meterless/auto",
      });
      expect(runtime.handle.kind).toBe("postgres");
    } finally {
      await runtime.handle.close();
    }
  });

  it("live mode refuses to start without configuration instead of falling back to mocks", async () => {
    const base = loadConfig({});
    await expect(createWorldRuntime({ ...base, runtimeMode: "live" })).rejects.toThrow(
      /DATABASE_URL/,
    );
    await expect(
      createWorldRuntime({
        ...base,
        runtimeMode: "live",
        databaseUrl: "postgres://u:p@h.example.test/db",
      }),
    ).rejects.toBeInstanceOf(LiveNotConfiguredError);
    expect(() => loadConfig({ BRINDLE_RUNTIME_MODE: "live" })).toThrow(/ZETARIS/);
  });

  it("competition LIVE mode refuses to run without Meterless configuration", async () => {
    const noMeterless = {
      ...liveEnv,
      METERLESS_BASE_URL: "",
      METERLESS_RUNTIME_TOKEN: "",
      METERLESS_MODEL: "",
    };
    expect(() => loadConfig(noMeterless)).toThrow(
      /METERLESS_BASE_URL.*METERLESS_RUNTIME_TOKEN.*METERLESS_MODEL/s,
    );
    // Partial Meterless configuration is also refused.
    expect(() => loadConfig({ ...liveEnv, METERLESS_MODEL: "" })).toThrow(/partially configured/);
    // Having direct-NVIDIA credentials does not silently stand in for the primary runtime.
    expect(() =>
      loadConfig({ ...noMeterless, NVIDIA_API_KEY: "nv", NEMOTRON_MODEL_ID: "nvidia/nemotron-x" }),
    ).toThrow(/Meterless Nightshift is the primary runtime/);
    // The runtime itself also refuses (defence in depth) if handed such a config.
    const base = loadConfig({ ...liveEnv, BRINDLE_RUNTIME_MODE: "local" });
    await expect(
      createWorldRuntime({
        ...base,
        runtimeMode: "live",
        databaseUrl: "postgres://u:p@h.example.test/db",
        meterless: { status: "unconfigured" },
        nemotron: { status: "unconfigured" },
      }),
    ).rejects.toBeInstanceOf(LiveNotConfiguredError);
  });

  it("direct NVIDIA is secondary: explicit opt-in, Nemotron-family model only", () => {
    const direct = {
      ...liveEnv,
      METERLESS_BASE_URL: "",
      METERLESS_RUNTIME_TOKEN: "",
      METERLESS_MODEL: "",
      NEMOTRON_PROVIDER: "nvidia",
      NVIDIA_API_KEY: "nv-secret",
      NEMOTRON_MODEL_ID: "nvidia/nemotron-3-super",
    };
    expect(loadConfig(direct).nemotron).toMatchObject({
      provider: "nvidia",
      modelId: "nvidia/nemotron-3-super",
    });
    expect(() =>
      loadConfig({ ...direct, NEMOTRON_MODEL_ID: "meta/llama-3.1-70b-instruct" }),
    ).toThrow(/Nemotron-family/);
  });

  it("the live probe commands refuse to run without credentials", () => {
    const run = (script: string) =>
      spawnSync("npx", ["tsx", script], {
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
          BRINDLE_RUNTIME_MODE: "local",
        } as unknown as NodeJS.ProcessEnv,
        encoding: "utf8",
      });
    const z = run("scripts/live/zetaris.mts");
    expect(z.status).toBe(3);
    expect(z.stderr).toContain("REFUSING TO RUN");
    const n = run("scripts/live/nemotron.mts");
    expect(n.status).toBe(3);
    expect(n.stderr).toContain("REFUSING TO RUN");
  }, 90_000);
});

describe("no sponsor secret is exposed", () => {
  it("config summaries and error messages contain identifiers only", () => {
    const summary = JSON.stringify(summarizeConfig(loadConfig(liveEnv)));
    for (const secret of [SECRET, ZETARIS_KEY, "db.example.test"])
      expect(summary).not.toContain(secret);
    expect(summary).toContain("meterless/auto"); // the route id is an identifier, not a secret
    expect(summary).not.toContain("localhost:9000");
    try {
      loadConfig({ ...liveEnv, ZETARIS_ORG_ID: "not-a-number" });
      expect.unreachable();
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(ZETARIS_KEY);
      expect(String((error as Error).message)).not.toContain(SECRET);
    }
  });
});
