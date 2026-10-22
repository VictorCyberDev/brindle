import { NextResponse } from "next/server";
import { ConfigError, getConfig, providerModeOf, summarizeConfig } from "../../../config/env";
import { getSharedRuntime, LiveNotConfiguredError } from "../../../demo/runtime";

/** Secret-free error mapping. Error classes in this codebase never embed credentials. */
export function errorResponse(error: unknown) {
  if (error instanceof ConfigError) {
    return NextResponse.json({ status: "misconfigured", issues: error.issues }, { status: 503 });
  }
  const name = error instanceof Error ? error.name : "Error";
  const status = error instanceof LiveNotConfiguredError ? 503 : 502;
  return NextResponse.json(
    {
      status: "error",
      error: name,
      message: error instanceof Error ? error.message : "unknown error",
    },
    { status },
  );
}

export async function runtimeOrThrow() {
  const config = getConfig();
  return {
    config,
    runtime: await getSharedRuntime(config),
    providerMode: providerModeOf(config),
    summary: summarizeConfig(config),
  };
}
