import { NextResponse } from "next/server";
import { resetSandbox } from "../../../../demo/store";
import { errorResponse, runtimeOrThrow } from "../_shared";

export const dynamic = "force-dynamic";

/** Resets Brindle's own sandbox tables only. Cannot affect Zetaris. */
export async function POST() {
  try {
    const { runtime } = await runtimeOrThrow();
    await resetSandbox(runtime.deps.db);
    return NextResponse.json({ status: "reset", scope: "sandbox business system" });
  } catch (error) {
    return errorResponse(error);
  }
}
