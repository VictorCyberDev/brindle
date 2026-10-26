import { apiError, apiMembership, withApiKey } from "../../../../../server/api";
import { loadIncident } from "../../../../../server/data";

export const dynamic = "force-dynamic";

/** A receipt exists only for an incident Brindle actually recovered and verified. */
export function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiKey(req, async ({ db, workspaceId }) => {
    const { id } = await params;
    const incident = await loadIncident(await apiMembership(db, workspaceId), id);
    if (!incident?.proof)
      return apiError(404, "no_receipt", "This incident has no Recovery Receipt.");
    return Response.json({ receipt: incident.proof.receiptJson });
  });
}
