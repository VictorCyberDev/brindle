import { apiError, readJson, withApiKey } from "../../../../server/api";
import { ingestTruthRevision } from "../../../../server/ingest";

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return withApiKey(req, async ({ db, workspaceId }) => {
    const result = await ingestTruthRevision(db, workspaceId, await readJson(req));
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  });
}
export const GET = () => apiError(405, "method_not_allowed", "Use POST.");
