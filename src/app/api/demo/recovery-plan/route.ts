import { NextResponse } from "next/server";
import { ATLAS_REVISION_ID } from "../../../../demo/temporal";
import { planRecovery, SANDBOX_RECOVERY_ACTOR } from "../../../../services/recovery";
import { runtimeOrThrow } from "../_shared";
export const dynamic = "force-dynamic";
export async function POST() {
  try {
    const { runtime, providerMode } = await runtimeOrThrow();
    if (providerMode !== "MOCK")
      return NextResponse.json({ status: "sandbox-only" }, { status: 409 });
    const result = await planRecovery(runtime.deps.db, ATLAS_REVISION_ID, SANDBOX_RECOVERY_ACTOR);
    return NextResponse.json({ status: result.incident.status, result });
  } catch {
    return NextResponse.json(
      {
        status: "error",
        message: "Recovery planning refused. Check materiality, authority and bounded evidence.",
      },
      { status: 409 },
    );
  }
}
