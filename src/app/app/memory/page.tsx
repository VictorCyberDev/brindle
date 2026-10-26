import { Brain } from "../../../components/ui/icons";
import { Callout, Card, EmptyState, PageHeader } from "../../../components/ui/layout";
import { formatDate } from "../../../product/format";
import { loadMemory } from "../../../server/data";
import { requireWorkspace } from "../../../server/session";

export const metadata = { title: "Recovery Memory" };

export default async function MemoryPage() {
  const ctx = await requireWorkspace("/app/memory");
  const memory = await loadMemory(ctx.active);
  return (
    <>
      <PageHeader
        title="Recovery Memory"
        description="What Brindle learned from recoveries it has already proven. Memory advises. It never authorizes an action."
      />
      <Callout tone="evidence" title="How memory is kept honest">
        An entry is created only after a recovery is independently verified. A failed or unverified
        recovery never becomes a memory. When planning a new incident, Brindle consults memory
        first, shows you what it recalled, and still checks every step against the current facts.
      </Callout>
      <div className="mt-8" />
      {memory.length ? (
        <ul className="space-y-4" data-testid="memory-list">
          {memory.map((m) => (
            <Card as="li" key={m.id} data-testid="memory-entry">
              <div className="flex items-start gap-3">
                <Brain size={20} className="mt-1 shrink-0 text-evidence-text" aria-hidden />
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">{m.incidentTitle}</h2>
                  <p className="text-sm text-muted">
                    {m.trigger} · remembered {formatDate(m.rememberedAt)} · {m.verifiedChecks}{" "}
                    verification checks passed
                  </p>
                  <h3 className="mt-4 text-sm font-semibold">Pattern that worked</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {m.pattern.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                  {m.warnings.length ? (
                    <>
                      <h3 className="mt-4 text-sm font-semibold">Warnings to remember</h3>
                      <ul className="mt-1 list-disc space-y-1 pl-5">
                        {m.warnings.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  <h3 className="mt-4 text-sm font-semibold">Used since</h3>
                  {m.retrievedBy.length ? (
                    <ul className="mt-1 space-y-1">
                      {m.retrievedBy.map((r) => (
                        <li key={r.incidentTitle}>
                          Consulted when planning {r.incidentTitle} ({r.relevancePct}% relevant)
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted">Not consulted yet.</p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </ul>
      ) : (
        <EmptyState title="No verified recoveries to remember yet" seam>
          Memory starts empty and grows only from recoveries Brindle has proven.
        </EmptyState>
      )}
    </>
  );
}
