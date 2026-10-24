import { NextResponse } from "next/server";
import { ATLAS_REVISION_ID } from "../../../../demo/temporal";
import { verifyRecovery } from "../../../../services/verification";
import { promoteVerifiedRecovery } from "../../../../services/recovery-memory";
import { runtimeOrThrow } from "../_shared";
export const dynamic = "force-dynamic";
export async function POST() {
  try {
    const { runtime, providerMode } = await runtimeOrThrow();
    if (providerMode !== "MOCK")
      return NextResponse.json({ status: "sandbox-only" }, { status: 409 });
    const result = await verifyRecovery(runtime.deps.db, ATLAS_REVISION_ID);
    let memory: { status: string; ref?: unknown } = { status: "NOT_ELIGIBLE" };
    if (result.receipt?.verdict === "RECOVERED") {
      try {
        memory = {
          status: "ACTUAL_HMEM_RECORDED",
          ref: await promoteVerifiedRecovery(runtime.deps.db, result.recovery!.incident.incidentId),
        };
      } catch {
        memory = { status: "H_MEM_PERSISTENCE_FAILED_CORE_PROOF_UNCHANGED" };
      }
    }
    return NextResponse.json({ status: result.receipt?.verdict ?? "NO_PROOF", result, memory });
  } catch {
    return NextResponse.json(
      {
        status: "error",
        message: "Independent verification refused. Check lifecycle and persisted evidence.",
      },
      { status: 409 },
    );
  }
}
