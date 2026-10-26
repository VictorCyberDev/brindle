import { apiMembership, withApiKey } from "../../../../server/api";
import { loadIncidents } from "../../../../server/data";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return withApiKey(req, async ({ db, workspaceId }) => {
    const incidents = await loadIncidents(await apiMembership(db, workspaceId));
    return Response.json({
      incidents: incidents.map((i) => ({
        id: i.id,
        title: i.title,
        status: i.status,
        statusLabel: i.statusLabel,
        severity: i.severity,
        openedAt: i.openedAt,
        headline: i.headline,
      })),
    });
  });
}
