import { apiError, apiMembership, withApiKey } from "../../../../../server/api";
import { loadIncident } from "../../../../../server/data";

export const dynamic = "force-dynamic";

export function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiKey(req, async ({ db, workspaceId }) => {
    const { id } = await params;
    const incident = await loadIncident(await apiMembership(db, workspaceId), id);
    if (!incident) return apiError(404, "not_found", "No such incident in this workspace.");
    return Response.json({ incident });
  });
}
