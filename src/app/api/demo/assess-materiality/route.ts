import { NextResponse } from "next/server";
import { ATLAS_REVISION_ID } from "../../../../demo/temporal";
import { assessCandidates } from "../../../../services/materiality";
import { runtimeOrThrow } from "../_shared";
export const dynamic = "force-dynamic";
export async function POST() {
  try {
    const { runtime, providerMode } = await runtimeOrThrow();
    if (providerMode !== "MOCK")
      return NextResponse.json({ status: "sandbox-only" }, { status: 409 });
    const result = await assessCandidates(runtime.deps, ATLAS_REVISION_ID);
    return NextResponse.json({ status: "MATERIALITY_ASSESSED", result });
  } catch {
    return NextResponse.json(
      {
        status: "error",
        message: "Materiality assessment unavailable; check historical evidence.",
      },
      { status: 409 },
    );
  }
}
