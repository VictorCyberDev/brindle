import { NextResponse } from "next/server";
import { ATLAS_REVISION_ID } from "../../../../demo/temporal";
import { planRecovery, SANDBOX_RECOVERY_ACTOR } from "../../../../services/recovery";
import { HmemRecoveryMemory } from "../../../../services/recovery-memory";
import { runtimeOrThrow } from "../_shared";
export const dynamic = "force-dynamic";
export async function POST() {
  try {
    const { runtime, providerMode } = await runtimeOrThrow();
    if (providerMode !== "MOCK")
      return NextResponse.json({ status: "sandbox-only" }, { status: 409 });
    // Advisory lookup before planning; its output cannot modify capabilities, authority or materiality.
    let memoryStatus = "ADVISORY_AVAILABLE";
    try {
      await new HmemRecoveryMemory(runtime.deps.db).lookup({
        factKey: "certification.ISO-9001",
        correctedStatus: "REVOKED",
        targetTypes: [
          "purchase_order",
          "finance_approval",
          "receiving_allocation",
          "supplier_notification",
        ],
        excludeIncidentId: `incident:${ATLAS_REVISION_ID}:v1`,
      });
    } catch {
      memoryStatus = "ADVISORY_UNAVAILABLE_PLAN_AUTHORITY_UNCHANGED";
    }
    const result = await planRecovery(runtime.deps.db, ATLAS_REVISION_ID, SANDBOX_RECOVERY_ACTOR);
    return NextResponse.json({ status: result.incident.status, result, memoryStatus });
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
