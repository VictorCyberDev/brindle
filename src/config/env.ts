import { z } from "zod";

export const RUNTIME_MODES = ["local", "live"] as const;
export const NEMOTRON_PROVIDERS = ["nvidia", "meterless"] as const;
export const DEFAULT_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
export type RuntimeMode = (typeof RUNTIME_MODES)[number];

/** Blank values in .env files mean "not set". */
const optionalString = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().trim().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.url({ protocol: /^https?$/ }).optional(),
);

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BRINDLE_RUNTIME_MODE: z.enum(RUNTIME_MODES).default("local"),
  DATABASE_URL: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z
      .string()
      .regex(/^postgres(ql)?:\/\//, "must be a postgres:// or postgresql:// URL")
      .optional(),
  ),
  ZETARIS_BASE_URL: optionalUrl,
  ZETARIS_API_KEY: optionalString,
  ZETARIS_ORG_ID: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z
      .string()
      .regex(/^[0-9]+$/, "must be an integer organisation id")
      .optional(),
  ),
  ZETARIS_SCHEMA: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z
      .string()
      .regex(/^[A-Za-z_][A-Za-z0-9_]{0,62}$/, "must be a plain SQL identifier")
      .optional(),
  ),
  METERLESS_BASE_URL: optionalUrl,
  METERLESS_API_KEY: optionalString,
  NVIDIA_BASE_URL: optionalUrl,
  NVIDIA_API_KEY: optionalString,
  NEMOTRON_PROVIDER: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.enum(NEMOTRON_PROVIDERS).optional(),
  ),
  NEMOTRON_MODEL_ID: optionalString,
});

export type SponsorConfig =
  { status: "unconfigured" } | { status: "configured"; baseUrl: string; apiKey: string };

export type ZetarisConfig =
  | { status: "unconfigured" }
  | {
      status: "configured";
      baseUrl: string;
      /** Zetaris API token, sent as a Bearer token. */
      apiKey: string;
      orgId: number;
      schema: string;
    };

/** Reasoning is reached over an OpenAI-compatible API, via NVIDIA directly or a Meterless hotspot. */
export type NemotronConfig =
  | { status: "unconfigured" }
  | {
      status: "configured";
      provider: (typeof NEMOTRON_PROVIDERS)[number];
      modelId: string;
      baseUrl: string;
      apiKey: string;
    };

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  runtimeMode: RuntimeMode;
  /** undefined when not provided; required in live mode. */
  databaseUrl: string | undefined;
  zetaris: ZetarisConfig;
  meterless: SponsorConfig;
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

function sponsor(
  label: string,
  baseUrlKey: string,
  apiKeyKey: string,
  baseUrl: string | undefined,
  apiKey: string | undefined,
  issues: string[],
): SponsorConfig {
  if (baseUrl && apiKey) return { status: "configured", baseUrl, apiKey };
  if (baseUrl || apiKey) {
    issues.push(
      `${label} is partially configured: set both ${baseUrlKey} and ${apiKeyKey}, or neither`,
    );
  }
  return { status: "unconfigured" };
}

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

  const zetarisParts = {
    ZETARIS_BASE_URL: e.ZETARIS_BASE_URL,
    ZETARIS_API_KEY: e.ZETARIS_API_KEY,
    ZETARIS_ORG_ID: e.ZETARIS_ORG_ID,
    ZETARIS_SCHEMA: e.ZETARIS_SCHEMA,
  };
  let zetaris: ZetarisConfig = { status: "unconfigured" };
  const zetarisSet = Object.entries(zetarisParts).filter(([, v]) => v !== undefined);
  if (zetarisSet.length === 4) {
    zetaris = {
      status: "configured",
      baseUrl: e.ZETARIS_BASE_URL!.replace(/\/+$/, ""),
      apiKey: e.ZETARIS_API_KEY!,
      orgId: Number(e.ZETARIS_ORG_ID),
      schema: e.ZETARIS_SCHEMA!,
    };
  } else if (zetarisSet.length > 0) {
    issues.push(
      "Zetaris is partially configured: set all of ZETARIS_BASE_URL, ZETARIS_API_KEY, ZETARIS_ORG_ID and ZETARIS_SCHEMA, or none",
    );
  }

  const meterless = sponsor(
    "Meterless",
    "METERLESS_BASE_URL",
    "METERLESS_API_KEY",
    e.METERLESS_BASE_URL,
    e.METERLESS_API_KEY,
    issues,
  );

  let nemotron: NemotronConfig = { status: "unconfigured" };
  if (e.NEMOTRON_MODEL_ID || e.NEMOTRON_PROVIDER) {
    if (!e.NEMOTRON_MODEL_ID || !e.NEMOTRON_PROVIDER) {
      issues.push(
        "Nemotron is partially configured: set both NEMOTRON_PROVIDER and NEMOTRON_MODEL_ID, or neither",
      );
    } else if (e.NEMOTRON_PROVIDER === "nvidia") {
      if (e.NVIDIA_API_KEY) {
        nemotron = {
          status: "configured",
          provider: "nvidia",
          modelId: e.NEMOTRON_MODEL_ID,
          baseUrl: (e.NVIDIA_BASE_URL ?? DEFAULT_NVIDIA_BASE_URL).replace(/\/+$/, ""),
          apiKey: e.NVIDIA_API_KEY,
        };
      } else {
        issues.push("NEMOTRON_PROVIDER=nvidia requires NVIDIA_API_KEY");
      }
    } else if (meterless.status === "configured") {
      nemotron = {
        status: "configured",
        provider: "meterless",
        modelId: e.NEMOTRON_MODEL_ID,
        baseUrl: meterless.baseUrl.replace(/\/+$/, ""),
        apiKey: meterless.apiKey,
      };
    } else {
      issues.push("NEMOTRON_PROVIDER=meterless requires METERLESS_BASE_URL and METERLESS_API_KEY");
    }
  }

  if (e.BRINDLE_RUNTIME_MODE === "live") {
    if (!e.DATABASE_URL) issues.push("DATABASE_URL is required when BRINDLE_RUNTIME_MODE=live");
    if (zetaris.status === "unconfigured" && zetarisSet.length === 0) {
      issues.push(
        "ZETARIS_BASE_URL, ZETARIS_API_KEY, ZETARIS_ORG_ID and ZETARIS_SCHEMA are required when BRINDLE_RUNTIME_MODE=live",
      );
    }
    if (nemotron.status === "unconfigured" && !e.NEMOTRON_MODEL_ID && !e.NEMOTRON_PROVIDER) {
      issues.push(
        "NEMOTRON_PROVIDER and NEMOTRON_MODEL_ID (plus that provider's credentials) are required when BRINDLE_RUNTIME_MODE=live",
      );
    }
  }

  if (issues.length > 0) throw new ConfigError(issues);

  return {
    nodeEnv: e.NODE_ENV,
    runtimeMode: e.BRINDLE_RUNTIME_MODE,
    databaseUrl: e.DATABASE_URL,
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
  /** Non-secret identifiers only. */
  reasoning: { provider: string; modelId: string } | null;
  runtimeMode: RuntimeMode;
  nodeEnv: AppConfig["nodeEnv"];
  integrations: {
    database: "configured" | "unconfigured";
    zetaris: "configured" | "unconfigured";
    meterless: "configured" | "unconfigured";
    nemotron: "configured" | "unconfigured";
  };
}

/** Secret-free view of configuration, safe to log or return over HTTP. */
export function summarizeConfig(config: AppConfig): ConfigSummary {
  return {
    providerMode: providerModeOf(config),
    reasoning:
      config.nemotron.status === "configured"
        ? { provider: config.nemotron.provider, modelId: config.nemotron.modelId }
        : null,
    runtimeMode: config.runtimeMode,
    nodeEnv: config.nodeEnv,
    integrations: {
      database: config.databaseUrl ? "configured" : "unconfigured",
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
