import { z } from "zod";

export const RUNTIME_MODES = ["local", "live"] as const;
export type RuntimeMode = (typeof RUNTIME_MODES)[number];

/**
 * Reasoning providers.
 *  - "meterless": PRIMARY. Brindle -> Meterless Nightshift Runtime -> NVIDIA provider configured inside Nightshift -> Nemotron-backed lane.
 *  - "nvidia":    SECONDARY. Direct NVIDIA hosted API; the selected model must be Nemotron-family.
 */
export const NEMOTRON_PROVIDERS = ["meterless", "nvidia"] as const;
export type NemotronProvider = (typeof NEMOTRON_PROVIDERS)[number];
export const DEFAULT_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

/** Blank values in .env files mean "not set". */
const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalString = z.preprocess(blankToUndefined, z.string().trim().min(1).optional());
const optionalUrl = z.preprocess(blankToUndefined, z.url({ protocol: /^https?$/ }).optional());

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BRINDLE_RUNTIME_MODE: z.enum(RUNTIME_MODES).default("local"),
  DATABASE_URL: z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^postgres(ql)?:\/\//, "must be a postgres:// or postgresql:// URL")
      .optional(),
  ),
  // Zetaris truth plane (hackathon local Docker setup, REST base e.g. http://localhost:8888/api/v1.0)
  ZETARIS_REST_URL: optionalUrl,
  ZETARIS_API_KEY: optionalString,
  ZETARIS_ORG_ID: z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^[0-9]+$/, "must be an integer organisation id")
      .optional(),
  ),
  ZETARIS_SCHEMA: z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^[A-Za-z_][A-Za-z0-9_]{0,62}$/, "must be a plain SQL identifier")
      .optional(),
  ),
  // Meterless Nightshift Runtime (primary AI runtime)
  METERLESS_BASE_URL: optionalUrl,
  METERLESS_RUNTIME_TOKEN: optionalString,
  METERLESS_MODEL: optionalString,
  // Direct NVIDIA (secondary)
  NVIDIA_BASE_URL: optionalUrl,
  NVIDIA_API_KEY: optionalString,
  NEMOTRON_PROVIDER: z.preprocess(blankToUndefined, z.enum(NEMOTRON_PROVIDERS).optional()),
  NEMOTRON_MODEL_ID: optionalString,
  // Product layer (authentication). Required whenever the authenticated app is served in production.
  BETTER_AUTH_SECRET: optionalString,
  BETTER_AUTH_URL: optionalUrl,
  BRINDLE_IP_SALT: optionalString,
});

export type ZetarisConfig =
  | { status: "unconfigured" }
  | {
      status: "configured";
      /** Full REST base including the API version path, e.g. http://localhost:8888/api/v1.0 */
      restUrl: string;
      /** Zetaris API key, sent as a Bearer token. */
      apiKey: string;
      orgId: number;
      schema: string;
    };

export type MeterlessConfig =
  | { status: "unconfigured" }
  | {
      status: "configured";
      /** Origin of the Nightshift Runtime; endpoints are /v1/models and /v1/chat/completions. */
      baseUrl: string;
      runtimeToken: string;
      /** The Meterless ROUTE/lane identifier requested (e.g. "meterless/auto"). A route is not proof of the underlying model. */
      model: string;
    };

export type NemotronConfig =
  | { status: "unconfigured" }
  | {
      status: "configured";
      provider: "meterless";
      baseUrl: string;
      runtimeToken: string;
      /** Requested runtime route. */
      runtimeRoute: string;
    }
  | {
      status: "configured";
      provider: "nvidia";
      baseUrl: string;
      apiKey: string;
      /** Direct-NVIDIA model; validated to be Nemotron-family. */
      modelId: string;
    };

export type AuthConfig =
  | { status: "unconfigured" }
  | { status: "configured"; secret: string; baseUrl: string | undefined; ipSalt: string };

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  auth: AuthConfig;
  runtimeMode: RuntimeMode;
  /** undefined when not provided; required in live mode. */
  databaseUrl: string | undefined;
  zetaris: ZetarisConfig;
  meterless: MeterlessConfig;
  nemotron: NemotronConfig;
}

/** Thrown for any invalid configuration. Messages name variables, never values. */
export class ConfigError extends Error {
  override name = "ConfigError";
  constructor(public readonly issues: readonly string[]) {
    super(
      `Invalid Brindle configuration:\n${issues.map((i) => `  - ${i}`).join("\n")}\n` +
        "See .env.example. Use BRINDLE_RUNTIME_MODE=local to run without sponsor credentials.",
    );
  }
}

/** Message used by every layer that enforces the competition LIVE invariant. */
export const COMPETITION_LIVE_REQUIRES_METERLESS =
  "Competition LIVE mode requires Meterless Nightshift as the primary reasoning runtime. Direct NVIDIA is secondary development/probe only.";

export const isNemotronFamily = (modelId: string) => /nemotron/i.test(modelId);

const stripTrailingSlashes = (url: string) => url.replace(/\/+$/, "");
/** Meterless endpoints are /v1/...; tolerate a base that already ends in /v1. */
const meterlessOrigin = (url: string) => stripTrailingSlashes(url).replace(/\/v1$/, "");

/** Pure: validates an env map into typed config. */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): AppConfig {
  const parsed = rawEnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((i) => `${i.path.join(".") || "(env)"}: ${i.message}`),
    );
  }
  const e = parsed.data;
  const issues: string[] = [];
  const live = e.BRINDLE_RUNTIME_MODE === "live";

  // --- Zetaris: all four or none ---
  const zetarisParts = [e.ZETARIS_REST_URL, e.ZETARIS_API_KEY, e.ZETARIS_ORG_ID, e.ZETARIS_SCHEMA];
  const zetarisSet = zetarisParts.filter((v) => v !== undefined).length;
  let zetaris: ZetarisConfig = { status: "unconfigured" };
  if (zetarisSet === 4) {
    zetaris = {
      status: "configured",
      restUrl: stripTrailingSlashes(e.ZETARIS_REST_URL!),
      apiKey: e.ZETARIS_API_KEY!,
      orgId: Number(e.ZETARIS_ORG_ID),
      schema: e.ZETARIS_SCHEMA!,
    };
  } else if (zetarisSet > 0) {
    issues.push(
      "Zetaris is partially configured: set all of ZETARIS_REST_URL, ZETARIS_API_KEY, ZETARIS_ORG_ID and ZETARIS_SCHEMA, or none",
    );
  } else if (live) {
    issues.push(
      "ZETARIS_REST_URL, ZETARIS_API_KEY, ZETARIS_ORG_ID and ZETARIS_SCHEMA are required when BRINDLE_RUNTIME_MODE=live",
    );
  }

  // --- Meterless Nightshift Runtime: all three or none ---
  const meterlessParts = [e.METERLESS_BASE_URL, e.METERLESS_RUNTIME_TOKEN, e.METERLESS_MODEL];
  const meterlessSet = meterlessParts.filter((v) => v !== undefined).length;
  let meterless: MeterlessConfig = { status: "unconfigured" };
  if (meterlessSet === 3) {
    meterless = {
      status: "configured",
      baseUrl: meterlessOrigin(e.METERLESS_BASE_URL!),
      runtimeToken: e.METERLESS_RUNTIME_TOKEN!,
      model: e.METERLESS_MODEL!,
    };
  } else if (meterlessSet > 0) {
    issues.push(
      "Meterless is partially configured: set all of METERLESS_BASE_URL, METERLESS_RUNTIME_TOKEN and METERLESS_MODEL, or none",
    );
  }

  // --- Reasoning provider: Meterless is primary; direct NVIDIA only when explicitly selected ---
  const provider: NemotronProvider = e.NEMOTRON_PROVIDER ?? "meterless";
  let nemotron: NemotronConfig = { status: "unconfigured" };
  if (provider === "meterless") {
    if (meterless.status === "configured") {
      nemotron = {
        status: "configured",
        provider: "meterless",
        baseUrl: meterless.baseUrl,
        runtimeToken: meterless.runtimeToken,
        runtimeRoute: meterless.model,
      };
    } else if (live && meterlessSet === 0) {
      issues.push(
        "METERLESS_BASE_URL, METERLESS_RUNTIME_TOKEN and METERLESS_MODEL are required when BRINDLE_RUNTIME_MODE=live (Meterless Nightshift is the primary runtime)",
      );
    }
  } else {
    if (live) issues.push(COMPETITION_LIVE_REQUIRES_METERLESS);
    const anyNvidia = e.NVIDIA_API_KEY || e.NEMOTRON_MODEL_ID;
    if (anyNvidia) {
      if (!e.NVIDIA_API_KEY) issues.push("NEMOTRON_PROVIDER=nvidia requires NVIDIA_API_KEY");
      if (!e.NEMOTRON_MODEL_ID) issues.push("NEMOTRON_PROVIDER=nvidia requires NEMOTRON_MODEL_ID");
      else if (!isNemotronFamily(e.NEMOTRON_MODEL_ID)) {
        issues.push("NEMOTRON_MODEL_ID must be a Nemotron-family model when using direct NVIDIA");
      }
    }
    if (e.NVIDIA_API_KEY && e.NEMOTRON_MODEL_ID && isNemotronFamily(e.NEMOTRON_MODEL_ID)) {
      nemotron = {
        status: "configured",
        provider: "nvidia",
        baseUrl: stripTrailingSlashes(e.NVIDIA_BASE_URL ?? DEFAULT_NVIDIA_BASE_URL),
        apiKey: e.NVIDIA_API_KEY,
        modelId: e.NEMOTRON_MODEL_ID,
      };
    }
  }

  if (live && meterless.status !== "configured" && provider === "nvidia") {
    issues.push(
      "BRINDLE_RUNTIME_MODE=live requires METERLESS_BASE_URL, METERLESS_RUNTIME_TOKEN and METERLESS_MODEL",
    );
  }

  if (live && !e.DATABASE_URL)
    issues.push("DATABASE_URL is required when BRINDLE_RUNTIME_MODE=live");

  // --- Product authentication. Development gets a clearly labelled throwaway secret. ---
  let auth: AuthConfig = { status: "unconfigured" };
  if (e.BETTER_AUTH_SECRET) {
    if (e.BETTER_AUTH_SECRET.length < 32) {
      issues.push("BETTER_AUTH_SECRET must be at least 32 characters");
    } else {
      auth = {
        status: "configured",
        secret: e.BETTER_AUTH_SECRET,
        baseUrl: e.BETTER_AUTH_URL ? stripTrailingSlashes(e.BETTER_AUTH_URL) : undefined,
        ipSalt: e.BRINDLE_IP_SALT ?? e.BETTER_AUTH_SECRET,
      };
    }
  } else if (e.NODE_ENV !== "production") {
    auth = {
      status: "configured",
      secret: "development-only-secret-do-not-use-in-production-0000",
      baseUrl: e.BETTER_AUTH_URL ? stripTrailingSlashes(e.BETTER_AUTH_URL) : undefined,
      ipSalt: "development-only-ip-salt",
    };
  }

  if (issues.length > 0) throw new ConfigError(issues);

  return {
    nodeEnv: e.NODE_ENV,
    runtimeMode: e.BRINDLE_RUNTIME_MODE,
    databaseUrl: e.DATABASE_URL,
    auth,
    zetaris,
    meterless,
    nemotron,
  };
}

/** LIVE means real sponsors are used; MOCK means labelled local test doubles. Never inferred from credentials. */
export type ProviderMode = "LIVE" | "MOCK";

export function providerModeOf(config: Pick<AppConfig, "runtimeMode">): ProviderMode {
  return config.runtimeMode === "live" ? "LIVE" : "MOCK";
}

export interface ConfigSummary {
  providerMode: ProviderMode;
  /** Non-secret identifiers only. `runtimeRoute` is a route, not proof of the underlying model. */
  reasoning: { provider: NemotronProvider; runtimeRoute: string } | null;
  runtimeMode: RuntimeMode;
  nodeEnv: AppConfig["nodeEnv"];
  integrations: {
    database: "configured" | "unconfigured";
    auth: "configured" | "unconfigured";
    zetaris: "configured" | "unconfigured";
    meterless: "configured" | "unconfigured";
    nemotron: "configured" | "unconfigured";
  };
}

/** Secret-free view of configuration, safe to log or return over HTTP. */
export function summarizeConfig(config: AppConfig): ConfigSummary {
  const n = config.nemotron;
  return {
    providerMode: providerModeOf(config),
    reasoning:
      n.status === "configured"
        ? {
            provider: n.provider,
            runtimeRoute: n.provider === "meterless" ? n.runtimeRoute : "nvidia-direct",
          }
        : null,
    runtimeMode: config.runtimeMode,
    nodeEnv: config.nodeEnv,
    integrations: {
      database: config.databaseUrl ? "configured" : "unconfigured",
      auth: config.auth.status,
      zetaris: config.zetaris.status,
      meterless: config.meterless.status,
      nemotron: config.nemotron.status,
    },
  };
}

let cached: AppConfig | undefined;

/** Memoized process-level config. Throws ConfigError if the environment is invalid. */
export function getConfig(): AppConfig {
  cached ??= loadConfig(process.env);
  return cached;
}
