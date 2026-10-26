import { loadIncident } from "../../../../../server/data";
import { getWorkspaceContext } from "../../../../../server/session";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return new Response("Sign in to download receipts.", { status: 401 });
  const { id } = await params;
  const incident = await loadIncident(ctx.active, id);
  if (!incident?.proof) return new Response("No such receipt.", { status: 404 });
  return new Response(JSON.stringify(incident.proof.receiptJson, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="brindle-receipt-${incident.proof.receiptId}.json"`,
      "cache-control": "private, no-store",
    },
  });
}
