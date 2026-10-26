import { IncidentCard } from "../../../components/product/incident-card";
import { LinkButton } from "../../../components/ui/button";
import { EmptyState, PageHeader, SectionTitle } from "../../../components/ui/layout";
import { plural } from "../../../product/format";
import { loadAgents, loadIncidents } from "../../../server/data";
import { requireWorkspace } from "../../../server/session";

export const metadata = { title: "Incidents" };
const OPEN = new Set([
  "NEEDS_REVIEW",
  "READY_TO_APPROVE",
  "PROPOSED_SHADOW",
  "NEEDS_PERSON",
  "RECOVERY_INCOMPLETE",
]);

export default async function IncidentsPage() {
  const ctx = await requireWorkspace();
  const [incidents, agents] = await Promise.all([
    loadIncidents(ctx.active),
    loadAgents(ctx.active),
  ]);
  const open = incidents.filter((i) => OPEN.has(i.status));
  const closed = incidents.filter((i) => !OPEN.has(i.status));
  return (
    <>
      <PageHeader
        title="Incidents"
        description="Each incident starts with a fact that changed after your agents used it. Open the ones that need you first."
      />
      {incidents.length === 0 ? (
        <EmptyState
          seam
          title={`No recovery needed. Brindle is watching ${plural(agents.length, "registered agent")}.`}
          action={
            <LinkButton href="/app/developer" variant="secondary">
              See how to send evidence
            </LinkButton>
          }
        >
          An incident appears when a fact your agents relied on is revised in a way that matters.
        </EmptyState>
      ) : (
        <div className="space-y-12">
          <section aria-labelledby="open">
            <SectionTitle id="open">Needs attention ({open.length})</SectionTitle>
            {open.length ? (
              <ul className="space-y-4">
                {open.map((i) => (
                  <IncidentCard key={i.id} incident={i} />
                ))}
              </ul>
            ) : (
              <p className="text-muted">Nothing needs you right now.</p>
            )}
          </section>
          {closed.length ? (
            <section aria-labelledby="closed">
              <SectionTitle id="closed">Closed ({closed.length})</SectionTitle>
              <ul className="space-y-4">
                {closed.map((i) => (
                  <IncidentCard key={i.id} incident={i} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}
