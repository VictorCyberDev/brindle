import { NextResponse } from "next/server";
import { HmemRecoveryMemory } from "../../../../services/recovery-memory";
import { runtimeOrThrow } from "../_shared";
export const dynamic = "force-dynamic";
export async function POST() {
  try {
    const { runtime, providerMode } = await runtimeOrThrow();
    if (providerMode !== "MOCK")
      return NextResponse.json({ status: "sandbox-only" }, { status: 409 });
    const result = await new HmemRecoveryMemory(runtime.deps.db).lookup({
      factKey: "certification.ISO-9001",
      correctedStatus: "REVOKED",
      targetTypes: [
        "purchase_order",
        "finance_approval",
        "receiving_allocation",
        "supplier_notification",
      ],
    });
    return NextResponse.json({ status: "ACTUAL_HMEM_ADVISORY", result });
  } catch {
    return NextResponse.json(
      {
        status: "error",
        message: "H-MEM advisory read unavailable; it cannot affect recovery authority or proof.",
      },
      { status: 409 },
    );
  }
}
