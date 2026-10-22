import { z } from "zod";

export const RUNTIME_MODES = ["local", "live"] as const;
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
  METERLESS_BASE_URL: optionalUrl,
  METERLESS_API_KEY: optionalString,
  NEMOTRON_MODEL_ID: optionalString,
});

export type SponsorConfig =
  { status: "unconfigured" } | { status: "configured"; baseUrl: string; apiKey: string };

export type NemotronConfig = { status: "unconfigured" } | { status: "configured"; modelId: string };

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  runtimeMode: RuntimeMode;
  /** undefined when not provided; required in live mode. */
  databaseUrl: string | undefined;
  zetaris: SponsorConfig;
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

  const zetaris = sponsor(
    "Zetaris",
    "ZETARIS_BASE_URL",
    "ZETARIS_API_KEY",
    e.ZETARIS_BASE_URL,
    e.ZETARIS_API_KEY,
    issues,
  );
  const meterless = sponsor(
    "Meterless",
    "METERLESS_BASE_URL",
    "METERLESS_API_KEY",
    e.METERLESS_BASE_URL,
    e.METERLESS_API_KEY,
    issues,
  );
  const nemotron: NemotronConfig = e.NEMOTRON_MODEL_ID
    ? { status: "configured", modelId: e.NEMOTRON_MODEL_ID }
    : { status: "unconfigured" };

  if (e.BRINDLE_RUNTIME_MODE === "live") {
    if (!e.DATABASE_URL) issues.push("DATABASE_URL is required when BRINDLE_RUNTIME_MODE=live");
    if (zetaris.status === "unconfigured" && !issues.some((i) => i.startsWith("Zetaris"))) {
      issues.push(
        "ZETARIS_BASE_URL and ZETARIS_API_KEY are required when BRINDLE_RUNTIME_MODE=live",
      );
    }
    if (meterless.status === "unconfigured" && !issues.some((i) => i.startsWith("Meterless"))) {
      issues.push(
        "METERLESS_BASE_URL and METERLESS_API_KEY are required when BRINDLE_RUNTIME_MODE=live",
      );
    }
    if (nemotron.status === "unconfigured") {
      issues.push("NEMOTRON_MODEL_ID is required when BRINDLE_RUNTIME_MODE=live");
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

export interface ConfigSummary {
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
