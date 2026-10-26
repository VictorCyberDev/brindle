import type { IncidentView } from "../../product/types";
import { TreatmentBadge, CannotUndoBadge } from "./status";
import { Seam } from "../brand/seam";

/** A readable, linear map of what is connected: change -> decisions -> what they created. */
export function ImpactMap({ incident }: { incident: IncidentView }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Seam state="break" className="h-7 w-28 shrink-0 text-fg" />
        <p className="font-semibold">
          {incident.change.subject}: {incident.change.fact} {incident.change.from} →{" "}
          {incident.change.to}
        </p>
      </div>
      <ul className="space-y-5 border-l-2 border-line-strong pl-5">
        {incident.impact.map((row) => (
          <li key={row.id} className="relative">
            <span
              aria-hidden
              className="absolute -left-[1.62rem] top-2 h-3 w-3 rounded-full border-2 border-fg bg-bg"
            />
            <p className="font-semibold">{row.agent}</p>
            <p className="text-sm text-muted">{row.decision}</p>
            <div className="mt-1.5">
              <TreatmentBadge treatment={row.treatment} />
            </div>
            {row.consequences.length ? (
              <ul className="mt-3 space-y-2 border-l border-line pl-4">
                {row.consequences.map((c) => (
                  <li key={c.label} className="flex flex-wrap items-center gap-2 text-sm">
                    <span>{c.label}</span>
                    {c.irreversible ? (
                      <CannotUndoBadge />
                    ) : (
                      <TreatmentBadge treatment={c.treatment} />
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
