import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import * as t from "../db/schema";
import type { Db } from "../db/client";
import { authenticateApiKey, issueApiKey, listApiKeys, revokeApiKey } from "./api-keys";
import { loadAgents, loadIncident, loadIncidents, loadMemory } from "./data";
import { getProductDb } from "./db";
import { IngestConflict, ingestDecision, ingestTruthRevision, updateIncidentState } from "./ingest";
import { BetaRequestRejected, submitBetaRequest } from "./beta";
import { createWorkspace, WorkspaceRuleViolation, type Membership } from "./workspaces";
import { runSafetyCheck } from "./safety-check";

let db: Db;
const makeUser = async (name: string) => {
  const id = `u_${randomUUID()}`;
  await db.insert(t.user).values({ id, name, email: `${id}@example.com` });
  return id;
};

const decision = (over: Record<string, unknown> = {}) => ({
  agent: { name: "Procurement agent" },
  decisionId: "d-1",
  decidedAt: "2026-03-02T09:00:00Z",
  summary: "Approved PO-1 with Acme",
  action: { type: "approve_po", target: "PO-1" },
  truthInputs: [
    {
      subjectType: "supplier",
      subjectId: "SUP-A",
      factKey: "certification.status",
      value: "VALID",
    },
  ],
  consequences: [
    { objectType: "po", objectId: "PO-1", description: "PO approved", reversibility: "REVERSIBLE" },
    {
      objectType: "email",
      objectId: "E-1",
      description: "Supplier emailed",
      reversibility: "IRREVERSIBLE",
    },
  ],
  ...over,
});
const revision = {
  revisionId: "r-1",
  subjectType: "supplier",
  subjectId: "SUP-A",
  factKey: "certification.status",
  previousValue: "VALID",
  newValue: "REVOKED",
  effectiveFrom: "2026-03-01T00:00:00Z",
  observedAt: "2026-03-09T00:00:00Z",
};

let wsA: Membership, wsB: Membership, userA: string;
beforeAll(async () => {
  ({ db } = await getProductDb());
  userA = await makeUser("A");
  wsA = await createWorkspace(db, { userId: userA, name: "Workspace A" });
  wsB = await createWorkspace(db, { userId: await makeUser("B"), name: "Workspace B" });
});

describe("workspace rules", () => {
  it("defaults to Shadow and refuses Bounded Autonomous outside the demo", async () => {
    expect(wsA.mode).toBe("SHADOW");
    await expect(
      createWorkspace(db, { userId: userA, name: "Nope", mode: "BOUNDED_AUTONOMOUS" }),
    ).rejects.toBeInstanceOf(WorkspaceRuleViolation);
  });
});

describe("evidence ingestion", () => {
  it("opens an incident, marks relying decisions NEEDS HUMAN REVIEW and ignores unrelated ones", async () => {
    await ingestDecision(db, wsA.workspaceId, decision());
    await ingestDecision(
      db,
      wsA.workspaceId,
      decision({
        decisionId: "d-2",
        truthInputs: [
          {
            subjectType: "supplier",
            subjectId: "SUP-Z",
            factKey: "certification.status",
            value: "VALID",
          },
        ],
      }),
    );
    const res = await ingestTruthRevision(db, wsA.workspaceId, revision);
    expect(res.incidentId).toBeTruthy();
    const incident = await loadIncident(wsA, res.incidentId!);
    expect(incident?.source).toBe("WORKSPACE");
    expect(incident?.headline.needsHuman).toBe(1);
    expect(incident?.headline.wouldChange).toBe(0); // Brindle cannot replay a customer agent
    expect(incident?.headline.cannotBeUndone).toBe(1);
    expect(incident?.plan?.registered ?? false).toBe(false);
    expect(incident?.proof).toBeNull();
  });

  it("is idempotent and rejects a different body under the same id", async () => {
    const again = await ingestTruthRevision(db, wsA.workspaceId, revision);
    expect(again.duplicate).toBe(true);
    await expect(
      ingestTruthRevision(db, wsA.workspaceId, { ...revision, newValue: "SUSPENDED" }),
    ).rejects.toBeInstanceOf(IngestConflict);
    await expect(
      ingestDecision(db, wsA.workspaceId, decision({ summary: "Something else entirely" })),
    ).rejects.toBeInstanceOf(IngestConflict);
  });

  it("rejects extra fields: there is no way to name an action to execute", async () => {
    await expect(
      ingestDecision(db, wsA.workspaceId, {
        ...decision({ decisionId: "d-9" }),
        execute: "rm -rf",
      }),
    ).rejects.toThrow();
    await expect(
      ingestTruthRevision(db, wsA.workspaceId, {
        ...revision,
        revisionId: "r-nochange",
        newValue: "VALID",
      }),
    ).rejects.toThrow();
  });

  it("a decision that arrives after the revision still lands in the incident", async () => {
    const late = await ingestDecision(
      db,
      wsA.workspaceId,
      decision({ decisionId: "d-late", decidedAt: "2026-03-05T00:00:00Z" }),
    );
    expect(late.duplicate).toBe(false);
    const [incident] = await loadIncidents(wsA);
    expect(incident!.headline.needsHuman).toBe(2);
  });

  it("a person's resolution is recorded as not verified by Brindle", async () => {
    const [incident] = await loadIncidents(wsA);
    await expect(
      updateIncidentState(db, {
        workspaceId: wsA.workspaceId,
        incidentId: incident!.id,
        userId: userA,
        to: "RESOLVED_BY_HUMAN",
        note: "",
      }),
    ).rejects.toThrow();
    await updateIncidentState(db, {
      workspaceId: wsA.workspaceId,
      incidentId: incident!.id,
      userId: userA,
      to: "RESOLVED_BY_HUMAN",
      note: "Cancelled the order by hand",
    });
    const after = await loadIncident(wsA, incident!.id);
    expect(after?.status).toBe("RESOLVED_BY_PERSON");
    expect(after?.statusLabel).toMatch(/Not verified by Brindle/);
    expect(after?.proof).toBeNull();
  });
});

describe("workspace isolation", () => {
  it("another workspace sees none of it", async () => {
    expect(await loadIncidents(wsB)).toEqual([]);
    expect(await loadAgents(wsB)).toEqual([]);
    expect(await loadMemory(wsB)).toEqual([]);
    const [mine] = await loadIncidents(wsA);
    expect(await loadIncident(wsB, mine!.id)).toBeNull();
    await expect(
      updateIncidentState(db, {
        workspaceId: wsB.workspaceId,
        incidentId: mine!.id,
        userId: userA,
        to: "IN_REVIEW",
      }),
    ).rejects.toThrow();
  });

  it("the same external ids can exist in two workspaces without colliding", async () => {
    await ingestDecision(db, wsB.workspaceId, decision());
    const r = await ingestTruthRevision(db, wsB.workspaceId, revision);
    expect(r.duplicate).toBe(false);
    expect((await loadIncidents(wsB)).length).toBe(1);
    expect((await loadIncidents(wsA)).length).toBe(1);
  });

  it("demo data never contains workspace data and workspace data never contains demo data", async () => {
    const demo = await createWorkspace(db, {
      userId: userA,
      name: "Demo",
      kind: "DEMO",
      mode: "APPROVAL",
    });
    const demoIncidents = await loadIncidents(demo);
    expect(demoIncidents.map((i) => i.id).sort()).toEqual(["demo-atlas", "demo-cedar"]);
    expect(demoIncidents.every((i) => i.source === "DEMO")).toBe(true);
    expect((await loadIncidents(wsA)).every((i) => i.source === "WORKSPACE")).toBe(true);
    expect(await loadIncident(wsA, "demo-atlas")).toBeNull();
  });
});

describe("api keys", () => {
  it("stores only a hash, authenticates, isolates and revokes", async () => {
    const key = await issueApiKey(db, {
      workspaceId: wsA.workspaceId,
      label: "prod",
      createdBy: userA,
    });
    expect(key.plaintext.startsWith("brk_")).toBe(true);
    const rows = await db
      .select()
      .from(t.apiKeys)
      .where(eq(t.apiKeys.workspaceId, wsA.workspaceId));
    expect(JSON.stringify(rows)).not.toContain(key.plaintext);
    expect((await listApiKeys(db, wsA.workspaceId))[0]).not.toHaveProperty("keyHash");

    const auth = await authenticateApiKey(db, key.plaintext);
    expect(auth?.workspaceId).toBe(wsA.workspaceId);
    expect(await authenticateApiKey(db, key.plaintext + "x")).toBeNull();
    expect(await authenticateApiKey(db, null)).toBeNull();

    // another workspace cannot revoke it
    await revokeApiKey(db, wsB.workspaceId, key.id);
    expect(await authenticateApiKey(db, key.plaintext)).not.toBeNull();
    await revokeApiKey(db, wsA.workspaceId, key.id);
    expect(await authenticateApiKey(db, key.plaintext)).toBeNull();
  });
});

describe("beta requests", () => {
  const req = {
    email: "founder@example.com",
    company: "Acme",
    role: "CTO",
    useCase: "Procurement agents that approve purchase orders",
  };
  it("stores a request, never the raw address, and rejects duplicates and floods", async () => {
    await submitBetaRequest(db, req, "203.0.113.9", "salt");
    const rows = await db.select().from(t.betaRequests);
    expect(JSON.stringify(rows)).not.toContain("203.0.113.9");
    await expect(submitBetaRequest(db, req, "203.0.113.9", "salt")).rejects.toMatchObject({
      kind: "duplicate",
    });
    for (let n = 0; n < 2; n++)
      await submitBetaRequest(db, { ...req, email: `p${n}@example.com` }, "203.0.113.9", "salt");
    await expect(
      submitBetaRequest(db, { ...req, email: "late@example.com" }, "203.0.113.9", "salt"),
    ).rejects.toMatchObject({ kind: "rate_limited" });
  });
  it("rejects invalid input and honeypot fills", async () => {
    await expect(
      submitBetaRequest(db, { ...req, email: "nope" }, "198.51.100.1", "s"),
    ).rejects.toBeInstanceOf(BetaRequestRejected);
    await expect(
      submitBetaRequest(
        db,
        { ...req, email: "bot@example.com", website: "http://spam" },
        "198.51.100.2",
        "s",
      ),
    ).rejects.toBeInstanceOf(BetaRequestRejected);
  });
});

describe("onboarding safety check", () => {
  it("measures real properties and passes for a fresh Shadow workspace", async () => {
    const items = await runSafetyCheck(db, { workspaceId: wsA.workspaceId, mode: "SHADOW" });
    expect(items.length).toBeGreaterThanOrEqual(4);
    expect(items.every((i) => i.pass)).toBe(true);
  });
});
