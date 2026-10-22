import { NextResponse } from "next/server";
import pkg from "../../../../package.json";
import { ConfigError, getConfig, summarizeConfig } from "../../../config/env";

export const dynamic = "force-dynamic";

/**
 * Liveness + configuration sanity. Reports whether integrations are
 * configured, never their values, and does not claim connectivity.
 */
export function GET() {
  const base = { service: "brindle", version: pkg.version };
  try {
    const summary = summarizeConfig(getConfig());
    return NextResponse.json({
      ...base,
      status: "ok",
      environment: { runtimeMode: summary.runtimeMode, nodeEnv: summary.nodeEnv },
      integrations: summary.integrations,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof ConfigError) {
      return NextResponse.json(
        {
          ...base,
          status: "misconfigured",
          issues: error.issues,
          timestamp: new Date().toISOString(),
        },
        { status: 503 },
      );
    }
    throw error;
  }
}
