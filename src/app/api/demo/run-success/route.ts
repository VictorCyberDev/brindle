import { NextResponse } from "next/server";
import { PartialSandboxStateError, runSuccessWorld } from "../../../../demo/run";
import { errorResponse, runtimeOrThrow } from "../_shared";

export const dynamic = "force-dynamic";

/** Runs the one locked success workflow. Accepts no body: there is nothing to configure. */
export async function POST() {
  try {
    const { runtime, providerMode } = await runtimeOrThrow();
    const result = await runSuccessWorld(runtime.deps);
    return NextResponse.json(
      { providerMode, result },
      { status: result.status === "BLOCKED" ? 409 : 200 },
    );
  } catch (error) {
    if (error instanceof PartialSandboxStateError) {
      return NextResponse.json(
        { status: "partial-state", message: error.message },
        { status: 409 },
      );
    }
    return errorResponse(error);
  }
}
