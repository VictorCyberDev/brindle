import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, summarizeConfig } from "./env";

const liveEnv = {
  BRINDLE_RUNTIME_MODE: "live",
  DATABASE_URL: "postgres://u:supersecretpw@db.example.com:5432/brindle",
  ZETARIS_REST_URL: "http://localhost:8888/api/v1.0",
  ZETARIS_API_KEY: "zk-secret-123",
  ZETARIS_ORG_ID: "7",
  ZETARIS_SCHEMA: "brindle_truth",
  METERLESS_BASE_URL: "http://localhost:9000",
  METERLESS_RUNTIME_TOKEN: "mt-secret-456",
  METERLESS_MODEL: "meterless/auto",
};

describe("config validation", () => {
  it("runs in local mode with no credentials at all", () => {
    const config = loadConfig({});
    expect(config.runtimeMode).toBe("local");
    expect(summarizeConfig(config).integrations).toEqual({
      database: "unconfigured",
      auth: "configured", // development uses a clearly-labelled throwaway secret
      zetaris: "unconfigured",
      meterless: "unconfigured",
      nemotron: "unconfigured",
    });
  });

  it("never invents an auth secret in production, and rejects a short one", () => {
    expect(summarizeConfig(loadConfig({ NODE_ENV: "production" })).integrations.auth).toBe(
      "unconfigured",
    );
    expect(() => loadConfig({ BETTER_AUTH_SECRET: "too-short" })).toThrow(/at least 32/);
    const ok = loadConfig({ NODE_ENV: "production", BETTER_AUTH_SECRET: "x".repeat(40) });
    expect(JSON.stringify(summarizeConfig(ok))).not.toContain("xxxx");
  });

  it("treats blank values (as in .env.example) as unset", () => {
    expect(() =>
      loadConfig({ DATABASE_URL: "", ZETARIS_REST_URL: "", ZETARIS_API_KEY: "" }),
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
      "ZETARIS_REST_URL",
      "ZETARIS_SCHEMA",
      "METERLESS_BASE_URL",
      "METERLESS_RUNTIME_TOKEN",
      "METERLESS_MODEL",
    ]) {
      expect(message).toContain(name);
    }
  });

  it("rejects half-configured sponsors in any mode", () => {
    expect(() => loadConfig({ ZETARIS_API_KEY: "k" })).toThrow(/partially configured/);
    expect(() => loadConfig({ METERLESS_BASE_URL: "http://localhost:9000" })).toThrow(
      /partially configured/,
    );
  });

  it("rejects malformed URLs and unknown modes", () => {
    expect(() => loadConfig({ ZETARIS_REST_URL: "not a url", ZETARIS_API_KEY: "k" })).toThrow(
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
    expect(config.zetaris).toMatchObject({ restUrl: "http://localhost:8888/api/v1.0" });
    expect(config.nemotron).toMatchObject({
      status: "configured",
      provider: "meterless",
      runtimeRoute: "meterless/auto",
      baseUrl: "http://localhost:9000",
    });
  });

  it("tolerates a Meterless base URL that already ends in /v1 and trailing slashes", () => {
    for (const base of [
      "http://localhost:9000/v1",
      "http://localhost:9000/v1/",
      "http://localhost:9000/",
    ]) {
      expect(loadConfig({ ...liveEnv, METERLESS_BASE_URL: base }).meterless).toMatchObject({
        baseUrl: "http://localhost:9000",
      });
    }
  });

  it("supports the direct NVIDIA route and requires its key", () => {
    const nvidia = {
      ...liveEnv,
      BRINDLE_RUNTIME_MODE: "local",
      NEMOTRON_PROVIDER: "nvidia",
      NVIDIA_API_KEY: "nv-secret-789",
      NEMOTRON_MODEL_ID: "nvidia/nemotron-3-super",
    };
    const config = loadConfig(nvidia);
    expect(config.nemotron).toMatchObject({
      provider: "nvidia",
      baseUrl: "https://integrate.api.nvidia.com/v1",
    });
    expect(() => loadConfig({ ...nvidia, NVIDIA_API_KEY: "" })).toThrow(/NVIDIA_API_KEY/);
    expect(() => loadConfig({ ...liveEnv, METERLESS_RUNTIME_TOKEN: "" })).toThrow(/METERLESS/);
  });

  it("rejects partial Zetaris and partial Nemotron configuration", () => {
    expect(() =>
      loadConfig({ ZETARIS_REST_URL: "http://localhost:8888/api/v1.0", ZETARIS_API_KEY: "k" }),
    ).toThrow(/ZETARIS_ORG_ID/);
    expect(() =>
      loadConfig({ NEMOTRON_PROVIDER: "nvidia", NEMOTRON_MODEL_ID: "nvidia/nemotron-x" }),
    ).toThrow(/NVIDIA_API_KEY/);
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
    for (const secret of ["supersecretpw", "zk-secret-123", "mt-secret-456", "db.example.com"]) {
      expect(summary).not.toContain(secret);
    }
    try {
      loadConfig({ ...liveEnv, ZETARIS_API_KEY: undefined, METERLESS_BASE_URL: "bad url" });
    } catch (e) {
      const message = (e as Error).message;
      for (const secret of ["supersecretpw", "mt-secret-456", "zk-secret-123"]) {
        expect(message).not.toContain(secret);
      }
    }
  });
});
