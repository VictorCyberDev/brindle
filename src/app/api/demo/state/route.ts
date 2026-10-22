import { NextResponse } from "next/server";
import { readDemoState } from "../../../../demo/store";
import { errorResponse, runtimeOrThrow } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { runtime, providerMode, summary } = await runtimeOrThrow();
    return NextResponse.json({
      sandbox: "SANDBOX BUSINESS SYSTEM",
      providerMode,
      reasoning: summary.reasoning,
      state: await readDemoState(runtime.deps.db),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
