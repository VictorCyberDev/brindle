import { StatusBadge } from "../../../components/ui/badge";
import { Check } from "../../../components/ui/icons";
import { Callout, Card, PageHeader } from "../../../components/ui/layout";
import { MODE_LABEL, MODE_SUMMARY, MODES } from "../../../product/permissions";
import { requireWorkspace } from "../../../server/session";

export const metadata = { title: "Policies" };

const RULES = [
  {
    title: "Irreversible effects are never rolled back",
    body: "A sent email, a confirmed shipment or a paid invoice cannot be undone by software. Brindle marks it, opens a corrective case for a person, and says so in the proof.",
  },
  {
    title: "Only registered capabilities can change a system",
    body: "Brindle acts through a fixed registry of recovery capabilities. There is no way to make it run an arbitrary command or query.",
  },
  {
    title: "Every step is re-checked against current facts",
    body: "A plan is validated again at execution time. If a fact moved since approval, the step is refused.",
  },
  {
    title: "Recovery is proven by a fresh read",
    body: "Brindle re-reads the real state and checks six invariants independently before it issues a Recovery Proof.",
  },
  {
    title: "Memory advises and never authorizes",
    body: "A past recovery can inform a plan. It can never approve an action or skip a check.",
  },
];

export default async function PoliciesPage() {
  const ctx = await requireWorkspace("/app/policies");
  return (
    <>
      <PageHeader
        title="Policies"
        description="The rules Brindle follows in this workspace. These are fixed guarantees, not settings."
      />
      <section aria-labelledby="modes" className="mb-10">
        <h2 id="modes" className="mb-3 text-xl font-semibold">
          Recovery mode
        </h2>
        <ul className="grid gap-3 md:grid-cols-3">
          {MODES.map((m) => (
            <Card as="li" key={m} className={m === ctx.active.mode ? "ring-2 ring-signal" : ""}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{MODE_LABEL[m]}</h3>
                {m === ctx.active.mode ? (
                  <StatusBadge tone="signal" icon={Check}>
                    Current
                  </StatusBadge>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-muted">{MODE_SUMMARY[m]}</p>
            </Card>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">
          Change the mode in Settings. Owners and admins can do this.
        </p>
      </section>
      <section aria-labelledby="rules">
        <h2 id="rules" className="mb-3 text-xl font-semibold">
          Guarantees
        </h2>
        <ul className="space-y-3">
          {RULES.map((r) => (
            <li key={r.title}>
              <Callout tone="neutral" title={r.title}>
                {r.body}
              </Callout>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
