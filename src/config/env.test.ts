import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, summarizeConfig } from "./env";

const liveEnv = {
  BRINDLE_RUNTIME_MODE: "live",
  DATABASE_URL: "postgres://u:supersecretpw@db.example.com:5432/brindle",
  ZETARIS_BASE_URL: "https://zetaris.example.com",
  ZETARIS_API_KEY: "zk-secret-123",
  ZETARIS_ORG_ID: "7",
  ZETARIS_SCHEMA: "brindle_truth",
  NEMOTRON_PROVIDER: "meterless",
  NEMOTRON_MODEL_ID: "model-id",
  METERLESS_BASE_URL: "https://meterless.example.com/v1",
  METERLESS_API_KEY: "mk-secret-456",
};

describe("config validation", () => {
  it("runs in local mode with no credentials at all", () => {
    const config = loadConfig({});
    expect(config.runtimeMode).toBe("local");
    expect(summarizeConfig(config).integrations).toEqual({
      database: "unconfigured",
      zetaris: "unconfigured",
      meterless: "unconfigured",
      nemotron: "unconfigured",
    });
  });

  it("treats blank values (as in .env.example) as unset", () => {
    expect(() =>
      loadConfig({ DATABASE_URL: "", ZETARIS_BASE_URL: "", ZETARIS_API_KEY: "" }),
    ).not.toThrow();
  });

  it("fails live mode with an actionable list of what is missing", () => {
    const err = (() => {
      try {
        loadConfig({ BRINDLE_RUNTIME_MODE: "live" });
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(ConfigError);
    const message = (err as ConfigError).message;
    for (const name of [
      "DATABASE_URL",
      "ZETARIS_BASE_URL",
      "ZETARIS_SCHEMA",
      "NEMOTRON_MODEL_ID",
    ]) {
      expect(message).toContain(name);
    }
  });

  it("rejects half-configured sponsors in any mode", () => {
    expect(() => loadConfig({ ZETARIS_API_KEY: "k" })).toThrow(/partially configured/);
    expect(() => loadConfig({ METERLESS_BASE_URL: "https://m.example.com" })).toThrow(
      /partially configured/,
    );
  });

  it("rejects malformed URLs and unknown modes", () => {
    expect(() => loadConfig({ ZETARIS_BASE_URL: "not a url", ZETARIS_API_KEY: "k" })).toThrow(
      ConfigError,
    );
    expect(() => loadConfig({ DATABASE_URL: "mysql://x" })).toThrow(ConfigError);
    expect(() => loadConfig({ BRINDLE_RUNTIME_MODE: "prod" })).toThrow(ConfigError);
  });

  it("accepts a complete live configuration", () => {
    const config = loadConfig(liveEnv);
    expect(config.runtimeMode).toBe("live");
    expect(config.zetaris).toMatchObject({
      status: "configured",
      orgId: 7,
      schema: "brindle_truth",
    });
    expect(config.nemotron).toMatchObject({
      status: "configured",
      provider: "meterless",
      modelId: "model-id",
    });
  });

  it("supports the direct NVIDIA route and requires its key", () => {
    const nvidia = { ...liveEnv, NEMOTRON_PROVIDER: "nvidia", NVIDIA_API_KEY: "nv-secret-789" };
    const config = loadConfig(nvidia);
    expect(config.nemotron).toMatchObject({
      provider: "nvidia",
      baseUrl: "https://integrate.api.nvidia.com/v1",
    });
    expect(() => loadConfig({ ...nvidia, NVIDIA_API_KEY: "" })).toThrow(/NVIDIA_API_KEY/);
    expect(() => loadConfig({ ...liveEnv, METERLESS_API_KEY: "" })).toThrow(/METERLESS/);
  });

  it("rejects partial Zetaris and partial Nemotron configuration", () => {
    expect(() =>
      loadConfig({ ZETARIS_BASE_URL: "https://z.example.com", ZETARIS_API_KEY: "k" }),
    ).toThrow(/ZETARIS_ORG_ID/);
    expect(() => loadConfig({ NEMOTRON_MODEL_ID: "m" })).toThrow(/NEMOTRON_PROVIDER/);
    expect(() => loadConfig({ ZETARIS_SCHEMA: "bad schema;" })).toThrow(ConfigError);
  });

  it("derives provider mode only from the runtime mode, never from credentials", () => {
    expect(summarizeConfig(loadConfig({})).providerMode).toBe("MOCK");
    expect(
      summarizeConfig(loadConfig({ ...liveEnv, BRINDLE_RUNTIME_MODE: "local" })).providerMode,
    ).toBe("MOCK");
    expect(summarizeConfig(loadConfig(liveEnv)).providerMode).toBe("LIVE");
  });

  it("never leaks secret values in summaries or error messages", () => {
    const summary = JSON.stringify(summarizeConfig(loadConfig(liveEnv)));
    for (const secret of ["supersecretpw", "zk-secret-123", "mk-secret-456", "db.example.com"]) {
      expect(summary).not.toContain(secret);
    }
    try {
      loadConfig({ ...liveEnv, ZETARIS_API_KEY: undefined, METERLESS_BASE_URL: "bad url" });
    } catch (e) {
      const message = (e as Error).message;
      for (const secret of ["supersecretpw", "mk-secret-456", "zk-secret-123"]) {
        expect(message).not.toContain(secret);
      }
    }
  });
});
