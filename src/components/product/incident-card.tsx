import Link from "next/link";
import { formatDate, relativeTime } from "../../product/format";
import type { IncidentView } from "../../product/types";
import { ArrowRight } from "../ui/icons";
import { IncidentStatusBadge, SeverityTag } from "./status";

export function IncidentCard({ incident, now }: { incident: IncidentView; now?: Date }) {
  const lines = [
    incident.headline.wouldChange
      ? `${incident.headline.wouldChange} ${incident.headline.wouldChange === 1 ? "decision" : "decisions"} would have changed`
      : null,
    incident.headline.cannotBeUndone
      ? `${incident.headline.cannotBeUndone} cannot be undone`
      : null,
    incident.headline.needsHuman ? `${incident.headline.needsHuman} need a person` : null,
  ].filter(Boolean);
  return (
    <li className="group">
      <Link
        href={`/app/incidents/${incident.id}`}
        className="block rounded-lg bg-surface p-5 shadow-raise transition-[transform,box-shadow] duration-150 ease-brindle hover:-translate-y-px hover:shadow-pop md:p-6"
        data-testid="incident-card"
      >
        <div className="flex flex-wrap items-center gap-2">
          <IncidentStatusBadge status={incident.status} label={incident.statusLabel} />
          <SeverityTag severity={incident.severity} />
          {incident.source === "DEMO" ? (
            <span className="text-xs font-semibold tracking-wide text-muted">DEMO DATA</span>
          ) : null}
        </div>
        <h3 className="mt-3 text-xl font-semibold">{incident.title}</h3>
        <p className="mt-1 text-muted">{incident.summary}</p>
        <p className="mt-3 text-sm text-muted">
          {incident.businessObject} ·{" "}
          {incident.agents.length ? [...new Set(incident.agents)].join(", ") : "No agents affected"}{" "}
          ·{" "}
          <span title={formatDate(incident.openedAt, true)}>
            {relativeTime(incident.openedAt, now)}
          </span>
          {lines.length ? ` · ${lines.join(" · ")}` : ""}
        </p>
        {incident.nextAction ? (
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium">
            {incident.nextAction}
            <ArrowRight
              size={15}
              aria-hidden
              className="transition-transform duration-150 group-hover:translate-x-0.5"
            />
          </p>
        ) : null}
      </Link>
    </li>
  );
}
