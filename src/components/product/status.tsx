import { StatusBadge, Tag } from "../ui/badge";
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  CircleSlash,
  Eye,
  FileCheck2,
  UserRound,
} from "../ui/icons";
import type { IncidentUiStatus, Severity, Treatment } from "../../product/types";

const MAP: Record<
  IncidentUiStatus,
  {
    tone: "recovery" | "evidence" | "critical" | "signal" | "neutral";
    icon: typeof Check;
    label: string;
  }
> = {
  RECOVERED: { tone: "recovery", icon: CheckCircle2, label: "Recovered · proven" },
  READY_TO_APPROVE: { tone: "evidence", icon: FileCheck2, label: "Ready for approval" },
  PROPOSED_SHADOW: { tone: "signal", icon: Eye, label: "Proposed · Shadow Mode" },
  NEEDS_REVIEW: { tone: "evidence", icon: AlertTriangle, label: "Needs review" },
  NEEDS_PERSON: { tone: "evidence", icon: UserRound, label: "Needs a person" },
  RECOVERY_INCOMPLETE: { tone: "critical", icon: Ban, label: "Recovery incomplete" },
  NO_ACTION: { tone: "neutral", icon: CircleSlash, label: "No action needed" },
  RESOLVED_BY_PERSON: { tone: "neutral", icon: Check, label: "Resolved by a person" },
};

export function IncidentStatusBadge({
  status,
  label,
}: {
  status: IncidentUiStatus;
  label?: string;
}) {
  const m = MAP[status];
  return (
    <StatusBadge tone={m.tone} icon={m.icon} data-testid="incident-status">
      {label ?? m.label}
    </StatusBadge>
  );
}

export function SeverityTag({ severity }: { severity: Severity }) {
  return (
    <Tag>
      {severity === "HIGH" ? "High impact" : severity === "MEDIUM" ? "Medium impact" : "Low impact"}
    </Tag>
  );
}

const TREATMENT: Record<
  Treatment,
  {
    tone: "recovery" | "evidence" | "critical" | "signal" | "neutral";
    icon: typeof Check;
    label: string;
  }
> = {
  NEEDS_RECOVERY: { tone: "signal", icon: AlertTriangle, label: "Needs recovery" },
  PRESERVED: { tone: "recovery", icon: Check, label: "Preserved" },
  NEEDS_HUMAN_REVIEW: { tone: "evidence", icon: UserRound, label: "Needs human review" },
  NOT_AFFECTED: { tone: "neutral", icon: CircleSlash, label: "Not affected" },
};
export function TreatmentBadge({ treatment }: { treatment: Treatment }) {
  const m = TREATMENT[treatment];
  return (
    <StatusBadge tone={m.tone} icon={m.icon} data-testid={`treatment-${treatment}`}>
      {m.label}
    </StatusBadge>
  );
}

/** "Cannot be undone" is its own honest state, never styled like a rollback. */
export function CannotUndoBadge() {
  return (
    <StatusBadge tone="critical" icon={Ban} data-testid="cannot-undo">
      Cannot be undone
    </StatusBadge>
  );
}
