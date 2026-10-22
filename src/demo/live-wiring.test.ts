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

const SECRET = "sk-test-SECRET-DO-NOT-LEAK-123456";
const ZETARIS_KEY = "zk-test-SECRET-DO-NOT-LEAK-654321";

const liveEnv = {
  BRINDLE_RUNTIME_MODE: "live",
  DATABASE_URL: "postgres://u:p@db.example.test:5432/brindle",
  ZETARIS_BASE_URL: "https://tenant.example.test",
  ZETARIS_API_KEY: ZETARIS_KEY,
  ZETARIS_ORG_ID: "7",
  ZETARIS_SCHEMA: "brindle_truth",
  NEMOTRON_PROVIDER: "nvidia",
  NEMOTRON_MODEL_ID: "nvidia/test-model",
  NVIDIA_API_KEY: SECRET,
};

describe("the real adapters drive the full world (protocol doubles at the HTTP edge)", () => {
  it("runs end to end through RowBackedTruthReader + ZetarisSqlRowSource + OpenAiCompatibleNemotronReasoner", async () => {
    const handle = await createEphemeralDb();
    try {
      const zSeen: Seen[] = [];
      const nSeen: Seen[] = [];
      const source = new ZetarisSqlRowSource({
        baseUrl: "https://tenant.example.test",
        apiKey: ZETARIS_KEY,
        orgId: 7,
        schema: "brindle_truth",
        fetch: zetarisDouble(zSeen),
      });
      const reasoner = new OpenAiCompatibleNemotronReasoner({
        provider: "nvidia",
        baseUrl: "https://nim.example.test/v1",
        apiKey: SECRET,
        modelId: "nvidia/test-model",
        fetch: chatDouble(nSeen),
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
        reasoningProvider: "nvidia",
        configuredModelId: "nvidia/test-model",
        now: () => FIXED_NOW,
      });
      expect(result.status).toBe("COMPLETED");
      expect(nSeen).toHaveLength(6);
      expect(zSeen.some((s) => s.method === "POST")).toBe(true);

      const receipt = (await getReceipt(handle.db, "dec:PO-827:finance"))!;
      expect(receipt.modelId).toBe("protocol-double-model");
      const state = await readDemoState(handle.db);
      expect(state.purchaseOrders.map((p) => p.po.status)).toEqual([
        "RECEIVING_SCHEDULED",
        "RECEIVING_SCHEDULED",
      ]);
      // Credentials appear nowhere in what was persisted.
      expect(JSON.stringify(state)).not.toContain(SECRET);
      expect(JSON.stringify(state)).not.toContain(ZETARIS_KEY);
      expect(JSON.stringify(receipt)).not.toContain(SECRET);
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
        reasoningProvider: "nvidia",
        configuredModelId: "nvidia/test-model",
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
    for (const secret of [SECRET, ZETARIS_KEY, "db.example.test", "tenant.example.test"])
      expect(summary).not.toContain(secret);
    expect(summary).toContain("nvidia/test-model");
    try {
      loadConfig({ ...liveEnv, ZETARIS_ORG_ID: "not-a-number" });
      expect.unreachable();
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(ZETARIS_KEY);
      expect(String((error as Error).message)).not.toContain(SECRET);
    }
  });
});
