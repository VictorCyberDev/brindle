import { eq } from "drizzle-orm";
import * as t from "../db/schema";
import type { Membership } from "./workspaces";
import { ZodError } from "zod";
import { MAX_BODY_BYTES } from "../product/ingest-contracts";
import { authenticateApiKey } from "./api-keys";
import { getProductDb } from "./db";
import { IngestConflict } from "./ingest";
import type { Db } from "../db/client";

/** Shared plumbing for /api/v1: key auth, bounded JSON bodies, a stable error envelope. */
export function apiError(status: number, code: string, message: string, details?: unknown) {
  return Response.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status, headers: { "cache-control": "no-store" } },
  );
}

export interface ApiContext {
  db: Db;
  workspaceId: string;
  keyId: string;
}

const bearer = (req: Request) => {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1]! : null;
};

/* Small in-memory limiter per key/IP. Per-instance by design: it blunts abuse, it is not a quota. */
const hits = new Map<string, { n: number; reset: number }>();
export function rateLimited(key: string, limit = 120, windowMs = 60_000): boolean {
  const now = Date.now();
  const cur = hits.get(key);
  if (!cur || cur.reset < now) {
    if (hits.size > 5000) hits.clear();
    hits.set(key, { n: 1, reset: now + windowMs });
    return false;
  }
  cur.n += 1;
  return cur.n > limit;
}

export async function withApiKey(
  req: Request,
  handler: (ctx: ApiContext) => Promise<Response>,
): Promise<Response> {
  const presented = bearer(req);
  if (!presented)
    return apiError(401, "missing_api_key", "Send your key as 'Authorization: Bearer brk_…'.");
  try {
    const { db } = await getProductDb();
    const auth = await authenticateApiKey(db, presented);
    if (!auth) return apiError(401, "invalid_api_key", "That API key is not valid.");
    if (rateLimited(auth.keyId))
      return apiError(429, "rate_limited", "Too many requests. Slow down and retry.");
    return await handler({ db, ...auth });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export function toErrorResponse(e: unknown): Response {
  if (e instanceof ZodError)
    return apiError(
      422,
      "invalid_request",
      "The request body did not match the schema.",
      e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  if (e instanceof IngestConflict) return apiError(409, "conflict", e.message);
  if (e instanceof BodyError) return apiError(e.status, e.code, e.message);
  console.error("api_error", e instanceof Error ? e.name : "unknown");
  return apiError(500, "internal_error", "Something went wrong on our side. Nothing was recorded.");
}

class BodyError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function readJson(req: Request): Promise<unknown> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json"))
    throw new BodyError(415, "unsupported_media_type", "Send Content-Type: application/json.");
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES)
    throw new BodyError(413, "body_too_large", `Bodies are limited to ${MAX_BODY_BYTES} bytes.`);
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES)
    throw new BodyError(413, "body_too_large", `Bodies are limited to ${MAX_BODY_BYTES} bytes.`);
  try {
    return JSON.parse(raw);
  } catch {
    throw new BodyError(400, "invalid_json", "The body is not valid JSON.");
  }
}

/** The API reads through the same facade as the app, so API and UI can never disagree. */
export async function apiMembership(db: Db, workspaceId: string): Promise<Membership> {
  const [w] = await db.select().from(t.workspaces).where(eq(t.workspaces.id, workspaceId));
  if (!w) throw new BodyError(404, "workspace_not_found", "Workspace not found.");
  return {
    workspaceId: w.id,
    name: w.name,
    slug: w.slug,
    kind: w.kind as Membership["kind"],
    mode: w.recoveryMode as Membership["mode"],
    role: "AUDITOR",
    settings: (w.settings as Record<string, unknown>) ?? {},
  };
}
