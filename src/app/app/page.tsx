import Link from "next/link";
import { IncidentCard } from "../../components/product/incident-card";
import { Seam } from "../../components/brand/seam";
import { LinkButton } from "../../components/ui/button";
import { ArrowRight } from "../../components/ui/icons";
import { Card, EmptyState, PageHeader, SectionTitle } from "../../components/ui/layout";
import { formatDate, plural } from "../../product/format";
import { MODE_LABEL, MODE_SUMMARY } from "../../product/permissions";
import { loadAgents, loadIncidents } from "../../server/data";
import { requireWorkspace } from "../../server/session";

export const metadata = { title: "Overview" };

const NEEDS = new Set([
  "NEEDS_REVIEW",
  "READY_TO_APPROVE",
  "PROPOSED_SHADOW",
  "NEEDS_PERSON",
  "RECOVERY_INCOMPLETE",
]);

export default async function OverviewPage() {
  const ctx = await requireWorkspace();
  const [incidents, agents] = await Promise.all([
    loadIncidents(ctx.active),
    loadAgents(ctx.active),
  ]);
  const attention = incidents.filter((i) => NEEDS.has(i.status));
  const recovered = incidents.filter((i) => i.status === "RECOVERED");
  const recentChanges = [...incidents]
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
    .slice(0, 3);

  return (
    <>
      <PageHeader
        title="Overview"
        description="Are we healthy? Does anything need you? What did Brindle recover?"
      />

      <section
        aria-labelledby="status"
        className="mb-10 flex flex-col gap-5 md:flex-row md:items-center"
      >
        <Seam
          state={attention.length ? "break" : "verified"}
          className="h-10 w-48 shrink-0 text-fg"
          label={attention.length ? "A truth change needs attention" : "Everything is consistent"}
        />
        <div>
          <h2 id="status" className="text-2xl font-semibold" data-testid="system-status">
            {attention.length
              ? `${plural(attention.length, "incident")} ${attention.length === 1 ? "needs" : "need"} you.`
              : agents.length
                ? `All clear. Brindle is watching ${plural(agents.length, "agent")}.`
                : "Nothing to watch yet."}
          </h2>
          <p className="mt-1 text-muted">
            {attention.length
              ? "A fact changed after your agents acted on it. Nothing has been changed without you."
              : agents.length
                ? "No fact your agents relied on has changed in a way that matters."
                : "Connect your first agent, or open the demo workspace to see a full recovery."}
          </p>
        </div>
      </section>

      <section aria-labelledby="attention" className="mb-12">
        <SectionTitle
          id="attention"
          aside={
            <Link href="/app/incidents" className="underline underline-offset-4">
              All incidents
            </Link>
          }
        >
          Needs your attention
        </SectionTitle>
        {attention.length ? (
          <ul className="space-y-4">
            {attention.map((i) => (
              <IncidentCard key={i.id} incident={i} />
            ))}
          </ul>
        ) : (
          <EmptyState
            title={`No recovery needed. Brindle is watching ${plural(agents.length, "registered agent")}.`}
            seam
          >
            When a fact your agents used turns out to be wrong, the affected decisions show up here
            with a plan.
          </EmptyState>
        )}
      </section>

      <section aria-labelledby="recoveries" className="mb-12">
        <SectionTitle
          id="recoveries"
          aside={
            <Link href="/app/recoveries" className="underline underline-offset-4">
              All recoveries
            </Link>
          }
        >
          Recent verified recoveries
        </SectionTitle>
        {recovered.length ? (
          <ul className="divide-y divide-line rounded-lg bg-surface shadow-raise">
            {recovered.map((i) => (
              <li key={i.id}>
                <Link
                  href={`/app/recoveries/${i.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-sunken"
                >
                  <span>
                    <span className="block font-semibold">{i.title}</span>
                    <span className="block text-sm text-muted">
                      {i.proof ? `Proof issued ${formatDate(i.proof.issuedAt)}` : "Proof issued"} ·{" "}
                      {i.headline.preservedUnrelated} unrelated decisions preserved
                    </span>
                  </span>
                  <ArrowRight size={16} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Verified recoveries will appear here">
            Brindle lists a recovery only after an independent check confirms the business is
            consistent again.
          </EmptyState>
        )}
      </section>

      <div className="grid gap-10 md:grid-cols-2">
        <section aria-labelledby="coverage">
          <SectionTitle
            id="coverage"
            aside={
              <Link href="/app/agents" className="underline underline-offset-4">
                Agents
              </Link>
            }
          >
            Agent coverage
          </SectionTitle>
          {agents.length ? (
            <ul className="space-y-3">
              {agents.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-4">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-sm text-muted">{a.coverage}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Connect your first agent"
              action={
                <LinkButton href="/app/developer" variant="primary">
                  Open the quickstart
                </LinkButton>
              }
            >
              Send one decision your agent made and Brindle starts watching the facts it relied on.
            </EmptyState>
          )}
        </section>

        <section aria-labelledby="mode">
          <SectionTitle
            id="mode"
            aside={
              <Link href="/app/settings" className="underline underline-offset-4">
                Change
              </Link>
            }
          >
            Recovery mode
          </SectionTitle>
          <Card className="p-5">
            <p className="text-lg font-semibold" data-testid="overview-mode">
              {MODE_LABEL[ctx.active.mode]}
            </p>
            <p className="mt-1 text-muted">{MODE_SUMMARY[ctx.active.mode]}</p>
          </Card>
        </section>
      </div>

      {recentChanges.length ? (
        <section aria-labelledby="changed" className="mt-12">
          <SectionTitle id="changed">What changed recently</SectionTitle>
          <ol className="space-y-3">
            {recentChanges.map((i) => (
              <li key={i.id} className="flex gap-4">
                <span className="w-28 shrink-0 text-sm text-muted">
                  {formatDate(i.change.observedAt)}
                </span>
                <span>
                  <Link
                    href={`/app/incidents/${i.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {i.change.subject}: {i.change.fact} {i.change.from} → {i.change.to}
                  </Link>
                  <span className="block text-sm text-muted">
                    {i.change.retroactive
                      ? `Took effect ${formatDate(i.change.effectiveFrom)}, learned ${i.change.lagDays} days later`
                      : "Effective going forward"}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  );
}
