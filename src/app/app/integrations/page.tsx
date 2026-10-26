import { StatusBadge } from "../../../components/ui/badge";
import { AlertTriangle, CheckCircle2, CircleDashed, Clock } from "../../../components/ui/icons";
import { Callout, Card, PageHeader } from "../../../components/ui/layout";
import { getConfig, summarizeConfig } from "../../../config/env";
import { requireWorkspace } from "../../../server/session";

export const metadata = { title: "Integrations" };

type State = "CONNECTED" | "NEEDS SETUP" | "AVAILABLE" | "COMING LATER";
interface Row {
  name: string;
  what: string;
  state: State;
  note: string;
}

export default async function IntegrationsPage() {
  await requireWorkspace("/app/integrations");
  const cfg = summarizeConfig(getConfig()).integrations;
  const rows: Row[] = [
    {
      name: "Evidence API",
      what: "Send decisions and truth revisions from your own code.",
      state: "AVAILABLE",
      note: "Create an API key in Developer.",
    },
    {
      name: "Recovery Memory (H-MEM)",
      what: "Remembers verified recoveries and advises later plans.",
      state: "CONNECTED",
      note: "Runs locally inside Brindle. Advisory only.",
    },
    {
      name: "Meterless Nightshift",
      what: "Model gateway for explanations and drafting.",
      state: cfg.meterless === "configured" ? "CONNECTED" : "NEEDS SETUP",
      note:
        cfg.meterless === "configured"
          ? "Credentials are configured."
          : "Not configured in this deployment. Brindle's recovery decisions never depend on a model.",
    },
    {
      name: "Zetaris",
      what: "Federated SQL over source systems.",
      state: cfg.zetaris === "configured" ? "CONNECTED" : "NEEDS SETUP",
      note:
        cfg.zetaris === "configured"
          ? "Credentials are configured."
          : "Not configured in this deployment.",
    },
    {
      name: "ERP and procurement connectors",
      what: "Registered recovery capabilities that can reverse or compensate in your systems.",
      state: "COMING LATER",
      note: "No connector is registered. Brindle cannot change your systems yet, so it runs in Shadow and Approval modes only.",
    },
    {
      name: "Slack and email notifications",
      what: "Tell the right person when an incident needs them.",
      state: "COMING LATER",
      note: "Not built. Incidents appear in the app.",
    },
  ];
  const tone = (s: State) =>
    s === "CONNECTED" ? "recovery" : s === "NEEDS SETUP" ? "evidence" : "neutral";
  return (
    <>
      <PageHeader
        title="Integrations"
        description="What is connected, what needs setup, and what does not exist yet. Nothing here is a mock-up."
      />
      <Callout tone="evidence" title="Today Brindle observes. It does not act on your systems.">
        Recovery that changes your systems needs registered capabilities for those systems. Until
        you register one, every recovery stays a proposal.
      </Callout>
      <ul className="mt-8 space-y-3" data-testid="integrations-list">
        {rows.map((r) => (
          <Card as="li" key={r.name}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{r.name}</h2>
              <StatusBadge
                tone={tone(r.state)}
                icon={
                  r.state === "CONNECTED"
                    ? CheckCircle2
                    : r.state === "NEEDS SETUP"
                      ? AlertTriangle
                      : r.state === "AVAILABLE"
                        ? CircleDashed
                        : Clock
                }
              >
                {r.state}
              </StatusBadge>
            </div>
            <p className="mt-1 text-muted">{r.what}</p>
            <p className="mt-2 text-sm">{r.note}</p>
          </Card>
        ))}
      </ul>
    </>
  );
}
