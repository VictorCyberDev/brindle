/**
 * User-facing view models. Raw engine concepts (SAME / CHANGED / UNCERTAIN, enums, ids) are translated
 * to plain language here; the technical values stay available under `evidence` for the drawer.
 */
export type Severity = "HIGH" | "MEDIUM" | "LOW";

export type IncidentUiStatus =
  | "NEEDS_REVIEW" // a person should look (also: shadow-mode proposal awaiting a decision)
  | "READY_TO_APPROVE" // bounded recovery prepared, waiting for approval
  | "PROPOSED_SHADOW" // recovery proposed; Shadow Mode will not execute it
  | "NEEDS_PERSON" // Brindle could not decide safely
  | "RECOVERY_INCOMPLETE"
  | "RECOVERED" // independently verified
  | "NO_ACTION"
  | "RESOLVED_BY_PERSON"; // a person closed it; Brindle did not verify

export type Treatment = "NEEDS_RECOVERY" | "PRESERVED" | "NEEDS_HUMAN_REVIEW" | "NOT_AFFECTED";

export const TREATMENT_LABEL: Record<Treatment, string> = {
  NEEDS_RECOVERY: "Needs recovery",
  PRESERVED: "Preserved",
  NEEDS_HUMAN_REVIEW: "Needs human review",
  NOT_AFFECTED: "Not affected",
};

export interface ImpactRow {
  id: string;
  agent: string;
  /** What the agent did, in a sentence. */
  decision: string;
  /** What it would have done with the corrected fact, in a sentence. */
  counterfactual: string;
  treatment: Treatment;
  reason: string;
  consequences: { label: string; treatment: Treatment; irreversible: boolean }[];
  /** Technical enum shown only in the evidence drawer. */
  technical: Record<string, unknown>;
}

export interface PlanStepView {
  order: number;
  title: string;
  why: string;
  kind: "Reverses" | "Compensates" | "Corrective case";
  cannotBeUndone: boolean;
  authority: string;
  status: "PLANNED" | "DONE" | "FAILED";
  technical: Record<string, unknown>;
}

export interface PlanView {
  steps: PlanStepView[];
  willNotChange: string[];
  cannotBeUndone: string[];
  authorityRequired: string[];
  expectedResult: string;
  /** Whether every step is covered by a registered capability. */
  registered: boolean;
}

export interface CheckView {
  title: string;
  status: "PASS" | "FAIL" | "ERROR";
  technical: Record<string, unknown>;
}

export interface ProofView {
  receiptId: string;
  verdict: "RECOVERED" | "RECOVERY_INCOMPLETE" | "ESCALATED";
  verdictLabel: string;
  issuedAt: string;
  whatChanged: string;
  affected: string[];
  preserved: string[];
  brindleChanged: {
    text: string;
    outcome: "Reversed" | "Compensated" | "Corrective case opened" | "Unresolved";
  }[];
  stillIrreversible: { text: string; handling: string; owner: string; status: string }[];
  checks: CheckView[];
  receiptJson: unknown;
}

export interface MemoryHitView {
  incidentId: string;
  title: string;
  relevancePct: number;
  why: string;
  pattern: string[];
  warnings: string[];
  recoveredAt: string;
}

export interface MemoryView {
  consultedBeforePlanning: boolean;
  hits: MemoryHitView[];
  note: string;
}

export interface IncidentView {
  id: string;
  source: "DEMO" | "WORKSPACE";
  title: string;
  summary: string;
  severity: Severity;
  status: IncidentUiStatus;
  statusLabel: string;
  /** The one thing a person should do next, or null when nothing is needed. */
  nextAction: string | null;
  agents: string[];
  businessObject: string;
  openedAt: string;
  change: {
    subject: string;
    fact: string;
    from: string;
    to: string;
    effectiveFrom: string;
    observedAt: string;
    retroactive: boolean;
    lagDays: number;
  };
  headline: {
    mayBeAffected: number;
    wouldChange: number;
    wouldStayTheSame: number;
    needsHuman: number;
    recoverableAutomatically: number;
    cannotBeUndone: number;
    preservedUnrelated: number;
  };
  impact: ImpactRow[];
  preserved: { label: string; why: string }[];
  plan: PlanView | null;
  proof: ProofView | null;
  memory: MemoryView | null;
  /** Shadow-mode report for customer workspaces without registered capabilities. */
  shadowNote: string | null;
  evidence: Record<string, unknown>;
}

export interface MemoryEntryView {
  id: string;
  incidentTitle: string;
  trigger: string;
  pattern: string[];
  warnings: string[];
  verifiedChecks: number;
  rememberedAt: string;
  receiptId: string;
  retrievedBy: { incidentTitle: string; relevancePct: number }[];
}

export interface AgentView {
  id: string;
  name: string;
  description: string;
  owner: string;
  mode: string;
  lastSeen: string | null;
  connectedSystems: string[];
  lastIncident: string | null;
  coverage: "Protected" | "Observed only" | "Needs setup";
  coverageDetail: string;
  status: "Active" | "Quiet" | "Never seen";
}
