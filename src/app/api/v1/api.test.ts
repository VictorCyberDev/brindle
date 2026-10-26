import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import * as t from "../../../db/schema";
import { issueApiKey } from "../../../server/api-keys";
import { getProductDb } from "../../../server/db";
import { createWorkspace } from "../../../server/workspaces";
import { GET as getIncident } from "./incidents/[id]/route";
import { GET as listIncidents } from "./incidents/route";
import { GET as getReceipt } from "./receipts/[id]/route";
import { GET as openapi } from "./openapi.json/route";
import { POST as postDecision } from "./decisions/route";
import { POST as postRevision } from "./truth-revisions/route";

let keyA = "",
  keyB = "";
beforeAll(async () => {
  const { db } = await getProductDb();
  const mk = async (name: string) => {
    const id = `u_${randomUUID()}`;
    await db.insert(t.user).values({ id, name, email: `${id}@example.com` });
    const w = await createWorkspace(db, { userId: id, name });
    return (await issueApiKey(db, { workspaceId: w.workspaceId, label: "test", createdBy: id }))
      .plaintext;
  };
  keyA = await mk("API A");
  keyB = await mk("API B");
});

const call = (
  handler: (r: Request, c: never) => Promise<Response> | Response,
  body: unknown,
  key: string | null,
  extra: Record<string, string> = {},
  method = "POST",
) =>
  handler(
    new Request("http://x/api", {
      method,
      headers: {
        ...(key ? { authorization: `Bearer ${key}` } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...extra,
      },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "x" }) } as never,
  );

const decision = {
  agent: { name: "Agent" },
  decisionId: "d1",
  decidedAt: "2026-03-02T09:00:00Z",
  summary: "Approved PO",
  action: { type: "approve", target: "PO-1" },
  truthInputs: [{ subjectType: "s", subjectId: "1", factKey: "f", value: 1 }],
};
const revision = {
  revisionId: "r1",
  subjectType: "s",
  subjectId: "1",
  factKey: "f",
  previousValue: 1,
  newValue: 2,
  effectiveFrom: "2026-03-01T00:00:00Z",
  observedAt: "2026-03-09T00:00:00Z",
};

describe("/api/v1", () => {
  it("requires a valid key", async () => {
    expect((await call(postDecision, decision, null)).status).toBe(401);
    expect((await call(postDecision, decision, "brk_nope")).status).toBe(401);
    expect((await call(listIncidents, undefined, null, {}, "GET")).status).toBe(401);
  });

  it("validates, bounds and normalizes errors", async () => {
    const bad = await call(postDecision, { ...decision, extra: 1 }, keyA);
    expect(bad.status).toBe(422);
    expect((await bad.json()).error.code).toBe("invalid_request");
    expect((await call(postDecision, "{not json", keyA)).status).toBe(400);
    const big = await call(postDecision, { pad: "x".repeat(70_000) }, keyA);
    expect(big.status).toBe(413);
    const wrongType = await call(postDecision, decision, keyA, { "content-type": "text/plain" });
    expect(wrongType.status).toBe(415);
  });

  it("ingests, opens an incident and keeps workspaces apart", async () => {
    expect((await call(postDecision, decision, keyA)).status).toBe(201);
    expect((await call(postDecision, decision, keyA)).status).toBe(200);
    const r = await call(postRevision, revision, keyA);
    expect(r.status).toBe(201);
    const { incidentId } = await r.json();
    expect(incidentId).toBeTruthy();

    const listed = await (await call(listIncidents, undefined, keyA, {}, "GET")).json();
    expect(listed.incidents).toHaveLength(1);
    const listedB = await (await call(listIncidents, undefined, keyB, {}, "GET")).json();
    expect(listedB.incidents).toHaveLength(0);

    const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
    const own = await getIncident(
      new Request("http://x", { headers: { authorization: `Bearer ${keyA}` } }),
      ctx(incidentId),
    );
    expect(own.status).toBe(200);
    const foreign = await getIncident(
      new Request("http://x", { headers: { authorization: `Bearer ${keyB}` } }),
      ctx(incidentId),
    );
    expect(foreign.status).toBe(404);
    const receipt = await getReceipt(
      new Request("http://x", { headers: { authorization: `Bearer ${keyA}` } }),
      ctx(incidentId),
    );
    expect(receipt.status).toBe(404); // nothing was recovered, so there is no receipt
  });

  it("publishes an OpenAPI document with only evidence endpoints", async () => {
    const doc = await openapi().json();
    expect(Object.keys(doc.paths).sort()).toEqual([
      "/api/v1/decisions",
      "/api/v1/incidents",
      "/api/v1/incidents/{id}",
      "/api/v1/receipts/{id}",
      "/api/v1/truth-revisions",
    ]);
  });
});
