import Link from "next/link";
import { EmptyState, PageHeader } from "../../../components/ui/layout";
import { IncidentStatusBadge } from "../../../components/product/status";
import { formatDate } from "../../../product/format";
import { loadIncidents } from "../../../server/data";
import { requireWorkspace } from "../../../server/session";

export const metadata = { title: "Recoveries" };

export default async function RecoveriesPage() {
  const ctx = await requireWorkspace("/app/recoveries");
  const all = await loadIncidents(ctx.active);
  const proven = all.filter((i) => i.proof);
  return (
    <>
      <PageHeader
        title="Recoveries"
        description="Every recovery Brindle has proven. Each one links to a Recovery Proof you can share."
      />
      {proven.length ? (
        <ul
          className="divide-y divide-line rounded-lg bg-surface shadow-raise"
          data-testid="recoveries-list"
        >
          {proven.map((i) => (
            <li key={i.id}>
              <Link
                href={`/app/recoveries/${i.id}`}
                className="flex flex-col gap-2 px-5 py-4 hover:bg-sunken md:flex-row md:items-center md:justify-between"
              >
                <span>
                  <span className="block font-semibold">{i.title}</span>
                  <span className="block text-sm text-muted">
                    {i.proof ? `Proof issued ${formatDate(i.proof.issuedAt)}` : ""} ·{" "}
                    {i.headline.preservedUnrelated} unrelated decisions preserved
                  </span>
                </span>
                <IncidentStatusBadge status={i.status} label={i.proof?.verdictLabel} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No verified recoveries yet" seam>
          A recovery appears here after Brindle executes it and an independent check passes. In
          Shadow Mode, Brindle proposes recoveries and never executes them, so there is nothing to
          prove yet.
        </EmptyState>
      )}
    </>
  );
}
