import { StatusBadge } from "../../../components/ui/badge";
import { CheckCircle2, CircleDashed } from "../../../components/ui/icons";
import { LinkButton } from "../../../components/ui/button";
import { Card, DataList, EmptyState, PageHeader } from "../../../components/ui/layout";
import { formatDate } from "../../../product/format";
import { loadAgents } from "../../../server/data";
import { requireWorkspace } from "../../../server/session";

export const metadata = { title: "Agents" };

export default async function AgentsPage() {
  const ctx = await requireWorkspace("/app/agents");
  const agents = await loadAgents(ctx.active);
  return (
    <>
      <PageHeader
        title="Agents"
        description="The agents Brindle knows about, what they touch, and how much of it Brindle can recover."
      />
      {agents.length ? (
        <ul className="grid gap-4 md:grid-cols-2" data-testid="agents-list">
          {agents.map((a) => (
            <Card as="li" key={a.id}>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold">{a.name}</h2>
                <StatusBadge
                  tone={a.coverage === "Protected" ? "recovery" : "neutral"}
                  icon={a.coverage === "Protected" ? CheckCircle2 : CircleDashed}
                >
                  {a.coverage}
                </StatusBadge>
              </div>
              <p className="mt-1 text-muted">{a.description}</p>
              <DataList
                className="mt-4"
                items={[
                  { label: "Owner", value: a.owner },
                  { label: "Mode", value: a.mode },
                  { label: "Status", value: a.status },
                  {
                    label: "Last seen",
                    value: a.lastSeen ? formatDate(a.lastSeen, true) : "Never",
                  },
                  { label: "Systems", value: a.connectedSystems.join(", ") || "None recorded" },
                  { label: "Last incident", value: a.lastIncident ?? "None" },
                ]}
              />
              <p className="mt-4 text-sm text-muted">{a.coverageDetail}</p>
            </Card>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No agents yet"
          action={
            <LinkButton href="/app/developer" variant="primary">
              Connect your first agent
            </LinkButton>
          }
        >
          An agent appears here the first time you send a decision it made.
        </EmptyState>
      )}
    </>
  );
}
