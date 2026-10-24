import { NextResponse } from "next/server";
import { ATLAS_REVISION_ID } from "../../../../demo/temporal";
import { readProof } from "../../../../services/verification";
import { runtimeOrThrow } from "../_shared";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { runtime, providerMode } = await runtimeOrThrow();
    if (providerMode !== "MOCK")
      return NextResponse.json({ status: "sandbox-only" }, { status: 409 });
    const proof = await readProof(runtime.deps.db, ATLAS_REVISION_ID);
    if (!proof.receipt) return NextResponse.json({ status: "proof-not-issued" }, { status: 404 });
    return NextResponse.json(proof.receipt, {
      headers: { "Content-Disposition": "attachment; filename=brindle-recovery-receipt.json" },
    });
  } catch {
    return NextResponse.json({ status: "proof-unavailable" }, { status: 503 });
  }
}
