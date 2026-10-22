import { ConfigError, loadConfig, type AppConfig } from "../src/config/env";

/** Loads config; prints an actionable message and exits non-zero on failure. Never prints values. */
export function loadConfigOrExit(overrides: Record<string, string> = {}): AppConfig {
  try {
    return loadConfig({ ...process.env, ...overrides });
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(2);
    }
    throw error;
  }
}

export function refuse(message: string): never {
  console.error(`REFUSING TO RUN: ${message}`);
  process.exit(3);
}

export const hostOf = (url: string) => new URL(url).host;

export function banner(title: string, mode: "LIVE" | "MOCK") {
  const line = "=".repeat(64);
  console.log(`${line}\n${mode === "LIVE" ? "LIVE" : "MOCK"} :: ${title}\n${line}`);
}
