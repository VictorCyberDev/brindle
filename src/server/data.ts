import { and, desc, eq } from "drizzle-orm";
import * as t from "../db/schema";
import {
  buildDemoAgents,
  buildDemoIncident,
  buildDemoIncidents,
  buildDemoMemory,
} from "../product/dossier";
import { daysBetween } from "../product/format";
import type {
  AgentView,
  IncidentUiStatus,
  IncidentView,
  MemoryEntryView,
  Treatment,
} from "../product/types";
import { getStory } from "../story/get";
import { getProductDb } from "./db";
import type { ImpactAnalysis } from "./ingest";
import type { Membership } from "./workspaces";

/*
 * One facade over two data sources, producing the same view models:
 *   DEMO workspace      -> the recorded real-engine story (labelled DEMO DATA everywhere)
 *   STANDARD workspace  -> that workspace's own ingested evidence, always filtered by workspace_id
 * Pages never touch tables directly, so workspace scoping lives in exactly this file.
 */
export interface DemoState {
  approvedB: boolean;
}
const demoState = (w: Membership): DemoState => ({ approvedB: w.settings.demoApprovedB === true });

export async function loadIncidents(w: Membership): Promise<IncidentView[]> {
  if (w.kind === "DEMO") return buildDemoIncidents(getStory(), { mode: w.mode, ...demoState(w) });
  const { db } = await getProductDb();
  const rows = await db
    .select({ i: t.wsIncidents, r: t.wsTruthRevisions })
    .from(t.wsIncidents)
    .innerJoin(t.wsTruthRevisions, eq(t.wsTruthRevisions.id, t.wsIncidents.revisionId))
    .where(eq(t.wsIncidents.workspaceId, w.workspaceId))
    .orderBy(desc(t.wsIncidents.openedAt));
  return rows.map(({ i, r }) => workspaceIncidentView(i, r, w));
}

export async function loadIncident(w: Membership, id: string): Promise<IncidentView | null> {
  if (w.kind === "DEMO") {
    const story = getStory();
    const ctx = { mode: w.mode, ...demoState(w) };
    if (id === "demo-atlas") return buildDemoIncident(story, "A", ctx);
    if (id === "demo-cedar") return buildDemoIncident(story, "B", ctx);
    return null;
  }
  const { db } = await getProductDb();
  const [row] = await db
    .select({ i: t.wsIncidents, r: t.wsTruthRevisions })
    .from(t.wsIncidents)
    .innerJoin(t.wsTruthRevisions, eq(t.wsTruthRevisions.id, t.wsIncidents.revisionId))
    .where(and(eq(t.wsIncidents.id, id), eq(t.wsIncidents.workspaceId, w.workspaceId)));
  return row ? workspaceIncidentView(row.i, row.r, w) : null;
}

export async function loadMemory(w: Membership): Promise<MemoryEntryView[]> {
  if (w.kind === "DEMO") return buildDemoMemory(getStory(), { mode: w.mode, ...demoState(w) });
  return []; // customer workspaces have no engine-verified recoveries yet
}

export async function loadAgents(w: Membership): Promise<AgentView[]> {
  if (w.kind === "DEMO") return buildDemoAgents(getStory(), w.mode);
  const { db } = await getProductDb();
  const rows = await db
    .select()
    .from(t.wsAgents)
    .where(eq(t.wsAgents.workspaceId, w.workspaceId))
    .orderBy(t.wsAgents.name);
  const incidents = await loadIncidents(w);
  return rows.map((a) => {
    const mine = incidents.find((i) => i.impact.some((x) => x.agent === a.name));
    return {
      id: a.id,
      name: a.name,
      description: a.description || "No description yet.",
      owner: a.owner || "Not set",
      mode: w.mode === "SHADOW" ? "Shadow" : "Approval",
      lastSeen: a.lastSeenAt?.toISOString() ?? null,
      connectedSystems: (a.connectedSystems as string[]) ?? [],
      lastIncident: mine?.title ?? null,
      coverage: "Observed only",
      coverageDetail:
        "Brindle can find what this agent affected. No registered recovery capability covers its systems yet.",
      status:
        a.lastSeenAt && Date.now() - a.lastSeenAt.getTime() < 7 * 86_400_000 ? "Active" : "Quiet",
    };
  });
}

const STATE_TO_STATUS: Record<
  string,
  { status: IncidentUiStatus; label: string; next: string | null }
> = {
  NEEDS_REVIEW: {
    status: "NEEDS_REVIEW",
    label: "Needs review",
    next: "Review the affected decisions and decide what your team needs to do.",
  },
  IN_REVIEW: {
    status: "NEEDS_REVIEW",
    label: "Being reviewed",
    next: "Finish the review and record what was done.",
  },
  RESOLVED_BY_HUMAN: {
    status: "RESOLVED_BY_PERSON",
    label: "Resolved by a person. Not verified by Brindle",
    next: null,
  },
  NO_ACTION_NEEDED: { status: "NO_ACTION", label: "No action needed", next: null },
};

function workspaceIncidentView(
  i: typeof t.wsIncidents.$inferSelect,
  r: typeof t.wsTruthRevisions.$inferSelect,
  w: Membership,
): IncidentView {
  const impact = i.impact as ImpactAnalysis;
  const s = STATE_TO_STATUS[i.state]!;
  const consequenceTreatment: Treatment = "NEEDS_HUMAN_REVIEW";
  const asText = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
  return {
    id: i.id,
    source: "WORKSPACE",
    title: i.title,
    summary: i.summary,
    severity: i.severity as IncidentView["severity"],
    status: s.status,
    statusLabel: s.label,
    nextAction: s.next,
    agents: [...new Set(impact.affected.map((a) => a.agent))],
    businessObject: impact.affected[0]?.consequences[0]?.objectId ?? r.subjectId,
    openedAt: r.observedAt.toISOString(),
    change: {
      subject: r.subjectId,
      fact: r.factKey,
      from: asText(r.previousValue),
      to: asText(r.newValue),
      effectiveFrom: r.effectiveFrom.toISOString(),
      observedAt: r.observedAt.toISOString(),
      retroactive: r.retroactive,
      lagDays: daysBetween(r.effectiveFrom.toISOString(), r.observedAt.toISOString()),
    },
    headline: {
      mayBeAffected: impact.affected.length + impact.totals.consequences,
      wouldChange: 0,
      wouldStayTheSame: 0,
      needsHuman: impact.affected.length,
      recoverableAutomatically: 0,
      cannotBeUndone: impact.totals.cannotBeUndone,
      preservedUnrelated: impact.notAffected.length,
    },
    impact: impact.affected.map((a) => ({
      id: a.decisionId,
      agent: a.agent,
      decision: a.summary,
      counterfactual:
        "Brindle cannot replay your agent, so a person judges whether it would have decided differently.",
      treatment: "NEEDS_HUMAN_REVIEW" as const,
      reason: a.reason,
      consequences: a.consequences.map((c) => ({
        label: `${c.objectType} ${c.objectId}: ${c.description}${c.reversibility === "IRREVERSIBLE" ? "" : ""}`,
        treatment: consequenceTreatment,
        irreversible: c.reversibility === "IRREVERSIBLE",
      })),
      technical: {
        decisionId: a.decisionId,
        decidedAt: a.decidedAt,
        declaredReversibility: a.consequences.map((c) => c.reversibility),
      },
    })),
    preserved: impact.notAffected.map((n) => ({
      label: `${n.agent}: ${n.summary}`,
      why: n.reason,
    })),
    plan: null,
    proof: null,
    memory: null,
    shadowNote:
      w.mode === "SHADOW"
        ? "Shadow Mode: Brindle found what is affected and what to leave alone. It does not change your systems."
        : "No registered recovery capability covers your systems yet, so Brindle can find and explain impact but cannot execute recovery here.",
    evidence: {
      revisionId: r.externalId,
      incidentId: i.id,
      resolutionNote: i.resolutionNote,
      impact,
    },
  };
}
