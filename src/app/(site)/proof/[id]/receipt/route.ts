import { buildDemoIncident } from "../../../../../product/dossier";
import { getStory } from "../../../../../story/get";

export const dynamic = "force-static";
export const dynamicParams = false;
export const generateStaticParams = () => [{ id: "demo-atlas" }, { id: "demo-cedar" }];

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = id === "demo-atlas" ? "A" : id === "demo-cedar" ? "B" : null;
  const proof = key
    ? buildDemoIncident(getStory(), key, { mode: "APPROVAL", approvedB: true }).proof
    : null;
  if (!proof) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify(proof.receiptJson, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="brindle-demo-receipt-${id}.json"`,
    },
  });
}
