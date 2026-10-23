import { NextResponse } from "next/server";
import { injectAtlasRevision } from "../../../../demo/temporal";
import { errorResponse, runtimeOrThrow } from "../_shared";
export const dynamic = "force-dynamic";
export async function POST() {
  try {
    const { runtime, providerMode } = await runtimeOrThrow();
    if (providerMode !== "MOCK")
      return NextResponse.json({ status: "sandbox-only" }, { status: 409 });
    const result = await injectAtlasRevision(runtime.deps.db);
    return NextResponse.json({ status: "CANDIDATES_READY", result });
  } catch (error) {
    // The demo boundary never serializes raw SQL/driver errors.
    console.error("M2 injection failed", error instanceof Error ? error.name : "Error");
    return errorResponse(
      new Error("M2 sandbox transition failed; verify the successful world exists."),
    );
  }
}
