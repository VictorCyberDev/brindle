import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "../db/client";
import * as t from "../db/schema";
import {
  decisionIngestSchema,
  truthRevisionIngestSchema,
  type DecisionIngest,
  type TruthRevisionIngest,
} from "../product/ingest-contracts";

/*
 * Workspace-scoped evidence ingestion and DETERMINISTIC impact analysis for customer data.
 * Honesty rule: Brindle cannot replay a customer's agent, so a decision that relied on a superseded
 * value is reported as NEEDS HUMAN REVIEW. It is never silently called changed or unchanged.
 */
export class IngestConflict extends Error {
  override name = "IngestConflict";
}

const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  );

export interface ImpactDecision {
  decisionId: string;
  agent: string;
  summary: string;
  decidedAt: string;
  reason: string;
  consequences: {
    objectType: string;
    objectId: string;
    description: string;
    reversibility: "REVERSIBLE" | "COMPENSABLE" | "IRREVERSIBLE";
  }[];
}
export interface ImpactAnalysis {
  affected: (ImpactDecision & { treatment: "NEEDS_HUMAN_REVIEW" })[];
  notAffected: (ImpactDecision & { treatment: "NOT_AFFECTED" })[];
  totals: {
    affected: number;
    notAffected: number;
    consequences: number;
    cannotBeUndone: number;
  };
}

export async function ingestDecision(db: Db, workspaceId: string, raw: unknown) {
  const input: DecisionIngest = decisionIngestSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [existingAgent] = await tx
      .select()
      .from(t.wsAgents)
      .where(and(eq(t.wsAgents.workspaceId, workspaceId), eq(t.wsAgents.name, input.agent.name)));
    const now = new Date();
    let agentId = existingAgent?.id;
    if (!agentId) {
      agentId = `agent_${randomUUID()}`;
      await tx.insert(t.wsAgents).values({
        id: agentId,
        workspaceId,
        name: input.agent.name,
        description: input.agent.description ?? "",
        owner: input.agent.owner ?? "",
        connectedSystems: input.agent.connectedSystems ?? [],
        lastSeenAt: now,
      });
    } else {
      await tx.update(t.wsAgents).set({ lastSeenAt: now }).where(eq(t.wsAgents.id, agentId));
    }
    const [prior] = await tx
      .select()
      .from(t.wsDecisions)
      .where(
        and(
          eq(t.wsDecisions.workspaceId, workspaceId),
          eq(t.wsDecisions.externalId, input.decisionId),
        ),
      );
    const stored = {
      action: input.action,
      truthInputs: input.truthInputs,
      consequences: input.consequences,
      summary: input.summary,
      decidedAt: new Date(input.decidedAt).toISOString(),
    };
    if (prior) {
      const same =
        canon({
          action: prior.action,
          truthInputs: prior.truthInputs,
          consequences: prior.consequences,
          summary: prior.summary,
          decidedAt: prior.decidedAt.toISOString(),
        }) === canon(stored);
      if (!same)
        throw new IngestConflict("A different decision was already recorded with this decisionId.");
      return { id: prior.id, duplicate: true };
    }
    const id = `dec_${randomUUID()}`;
    await tx.insert(t.wsDecisions).values({
      id,
      workspaceId,
      agentId,
      externalId: input.decisionId,
      decidedAt: new Date(input.decidedAt),
      summary: input.summary,
      action: input.action,
      truthInputs: input.truthInputs,
      consequences: input.consequences,
    });
    // A late-arriving decision may fall under a revision that was already recorded.
    const revisions = await tx
      .select()
      .from(t.wsTruthRevisions)
      .where(eq(t.wsTruthRevisions.workspaceId, workspaceId));
    for (const r of revisions) {
      if (
        input.truthInputs.some(
          (i) =>
            i.subjectType === r.subjectType &&
            i.subjectId === r.subjectId &&
            i.factKey === r.factKey,
        )
      ) {
        await analyzeRevision(tx as unknown as Db, workspaceId, r.id);
      }
    }
    return { id, duplicate: false };
  });
}

const humanize = (factKey: string) =>
  factKey
    .replace(/^(certification|supplier|policy)\./, "$1 ")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export async function ingestTruthRevision(db: Db, workspaceId: string, raw: unknown) {
  const input: TruthRevisionIngest = truthRevisionIngestSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [prior] = await tx
      .select()
      .from(t.wsTruthRevisions)
      .where(
        and(
          eq(t.wsTruthRevisions.workspaceId, workspaceId),
          eq(t.wsTruthRevisions.externalId, input.revisionId),
        ),
      );
    const effectiveFrom = new Date(input.effectiveFrom),
      observedAt = new Date(input.observedAt);
    if (prior) {
      const same =
        prior.subjectType === input.subjectType &&
        prior.subjectId === input.subjectId &&
        prior.factKey === input.factKey &&
        canon(prior.previousValue) === canon(input.previousValue) &&
        canon(prior.newValue) === canon(input.newValue) &&
        prior.effectiveFrom.getTime() === effectiveFrom.getTime() &&
        prior.observedAt.getTime() === observedAt.getTime();
      if (!same)
        throw new IngestConflict("A different revision was already recorded with this revisionId.");
      const [incident] = await tx
        .select()
        .from(t.wsIncidents)
        .where(eq(t.wsIncidents.revisionId, prior.id));
      return { id: prior.id, incidentId: incident?.id ?? null, duplicate: true };
    }
    const id = `rev_${randomUUID()}`;
    await tx.insert(t.wsTruthRevisions).values({
      id,
      workspaceId,
      externalId: input.revisionId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      factKey: input.factKey,
      previousValue: input.previousValue,
      newValue: input.newValue,
      effectiveFrom,
      observedAt,
      retroactive: effectiveFrom.getTime() < observedAt.getTime(),
    });
    const incidentId = await analyzeRevision(tx as unknown as Db, workspaceId, id);
    return { id, incidentId, duplicate: false };
  });
}

/** Idempotent: recomputes the impact for a revision and creates or refreshes its incident. */
export async function analyzeRevision(
  db: Db,
  workspaceId: string,
  revisionRowId: string,
): Promise<string> {
  const [rev] = await db
    .select()
    .from(t.wsTruthRevisions)
    .where(
      and(
        eq(t.wsTruthRevisions.id, revisionRowId),
        eq(t.wsTruthRevisions.workspaceId, workspaceId),
      ),
    );
  if (!rev) throw new Error("revision not found in this workspace");
  const decisions = await db
    .select({ d: t.wsDecisions, agent: t.wsAgents.name })
    .from(t.wsDecisions)
    .innerJoin(t.wsAgents, eq(t.wsAgents.id, t.wsDecisions.agentId))
    .where(eq(t.wsDecisions.workspaceId, workspaceId));

  const affected: ImpactAnalysis["affected"] = [];
  const notAffected: ImpactAnalysis["notAffected"] = [];
  for (const { d, agent } of decisions) {
    const inputs = d.truthInputs as {
      subjectType: string;
      subjectId: string;
      factKey: string;
      value: unknown;
    }[];
    const related = inputs.find(
      (i) =>
        i.subjectType === rev.subjectType &&
        i.subjectId === rev.subjectId &&
        i.factKey === rev.factKey,
    );
    if (!related) continue;
    const base = {
      decisionId: d.externalId,
      agent,
      summary: d.summary,
      decidedAt: d.decidedAt.toISOString(),
      consequences: d.consequences as ImpactDecision["consequences"],
    };
    if (d.decidedAt.getTime() < rev.effectiveFrom.getTime()) {
      notAffected.push({
        ...base,
        treatment: "NOT_AFFECTED",
        reason:
          "Decided before the change took effect, so it used the value that was true at the time.",
      });
    } else if (canon(related.value) !== canon(rev.previousValue)) {
      notAffected.push({
        ...base,
        treatment: "NOT_AFFECTED",
        reason: "Used a different value than the one that was superseded.",
      });
    } else {
      affected.push({
        ...base,
        treatment: "NEEDS_HUMAN_REVIEW",
        reason:
          "Relied on the superseded value after the change took effect. Brindle cannot replay your agent, so a person must judge whether the decision would have been different.",
      });
    }
  }
  const all = affected.flatMap((a) => a.consequences);
  const impact: ImpactAnalysis = {
    affected,
    notAffected,
    totals: {
      affected: affected.length,
      notAffected: notAffected.length,
      consequences: all.length,
      cannotBeUndone: all.filter((c) => c.reversibility === "IRREVERSIBLE").length,
    },
  };
  const fact = humanize(rev.factKey);
  const title = `${rev.subjectId}: ${fact} changed`;
  const summary = affected.length
    ? `${affected.length} ${affected.length === 1 ? "decision" : "decisions"} may be based on an outdated ${fact}.`
    : `No recorded decision relied on the old ${fact}. Brindle checked.`;
  const severity =
    impact.totals.cannotBeUndone > 0 || affected.length >= 3
      ? "HIGH"
      : affected.length
        ? "MEDIUM"
        : "LOW";

  const [existing] = await db
    .select()
    .from(t.wsIncidents)
    .where(and(eq(t.wsIncidents.workspaceId, workspaceId), eq(t.wsIncidents.revisionId, rev.id)));
  if (!existing) {
    const incidentId = `inc_${randomUUID()}`;
    await db.insert(t.wsIncidents).values({
      id: incidentId,
      workspaceId,
      revisionId: rev.id,
      title,
      summary,
      severity,
      state: affected.length ? "NEEDS_REVIEW" : "NO_ACTION_NEEDED",
      impact,
    });
    return incidentId;
  }
  if (existing.state !== "RESOLVED_BY_HUMAN") {
    await db
      .update(t.wsIncidents)
      .set({
        title,
        summary,
        severity,
        impact,
        state: affected.length
          ? existing.state === "IN_REVIEW"
            ? "IN_REVIEW"
            : "NEEDS_REVIEW"
          : "NO_ACTION_NEEDED",
      })
      .where(eq(t.wsIncidents.id, existing.id));
  }
  return existing.id;
}

export async function updateIncidentState(
  db: Db,
  input: {
    workspaceId: string;
    incidentId: string;
    userId: string;
    to: "IN_REVIEW" | "RESOLVED_BY_HUMAN";
    note?: string;
  },
) {
  const [row] = await db
    .select()
    .from(t.wsIncidents)
    .where(
      and(eq(t.wsIncidents.id, input.incidentId), eq(t.wsIncidents.workspaceId, input.workspaceId)),
    );
  if (!row) throw new Error("Incident not found in this workspace.");
  if (row.state === "RESOLVED_BY_HUMAN" || row.state === "NO_ACTION_NEEDED") return row.state;
  if (input.to === "IN_REVIEW") {
    await db.update(t.wsIncidents).set({ state: "IN_REVIEW" }).where(eq(t.wsIncidents.id, row.id));
    return "IN_REVIEW";
  }
  const note = (input.note ?? "").trim();
  if (note.length < 3) throw new Error("Add a short note about what was done before resolving.");
  await db
    .update(t.wsIncidents)
    .set({
      state: "RESOLVED_BY_HUMAN",
      resolvedAt: new Date(),
      resolvedBy: input.userId,
      resolutionNote: note.slice(0, 1000),
    })
    .where(eq(t.wsIncidents.id, row.id));
  return "RESOLVED_BY_HUMAN";
}
