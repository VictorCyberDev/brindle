import { formatDate } from "../../product/format";
import type { IncidentView } from "../../product/types";
import { CopyButton, EvidenceDrawer } from "../ui/client";
import { Download, CheckCircle2, AlertTriangle } from "../ui/icons";
import { buttonClass } from "../ui/button";
import { Callout, Card, Mono, SectionTitle } from "../ui/layout";
import { Seam } from "../brand/seam";

/** The Recovery Proof: one document a finance lead, auditor or customer can read in two minutes. */
export function ProofDocument({
  incident,
  downloadHref,
  shareUrl,
}: {
  incident: IncidentView;
  downloadHref: string;
  shareUrl?: string;
}) {
  const p = incident.proof!;
  const passed = p.checks.filter((c) => c.status === "PASS").length;
  const ok = p.verdict === "RECOVERED";
  return (
    <article data-testid="recovery-proof" className="space-y-10">
      <header className="rounded-lg bg-surface p-6 shadow-raise md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="eyebrow">
              Recovery Proof{incident.source === "DEMO" ? " · DEMO DATA" : ""}
            </p>
            <h1 className="mt-2 text-3xl font-semibold md:text-4xl" data-testid="proof-verdict">
              {p.verdictLabel}
            </h1>
            <p className="mt-2 max-w-[60ch] text-muted">
              {incident.change.subject}: {incident.change.fact} changed from {incident.change.from}{" "}
              to {incident.change.to}. {passed} of {p.checks.length} independent checks passed.
              Issued {formatDate(p.issuedAt)}.
            </p>
          </div>
          <Seam
            state={ok ? "verified" : "break"}
            className="h-12 w-48 shrink-0 text-fg"
            label={ok ? "Connected and verified" : "Not yet reconnected"}
          />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={downloadHref}
            className={buttonClass("secondary")}
            data-testid="download-receipt"
          >
            <Download size={16} aria-hidden /> Download receipt (JSON)
          </a>
          {shareUrl ? <CopyButton value={shareUrl} label="Copy link" /> : null}
          <EvidenceDrawer title="Receipt evidence" label="View technical evidence">
            <pre className="overflow-x-auto rounded-md bg-sunken p-4 font-mono text-xs">
              {JSON.stringify(p.receiptJson, null, 2)}
            </pre>
          </EvidenceDrawer>
        </div>
      </header>

      <section aria-labelledby="what">
        <SectionTitle id="what">What changed</SectionTitle>
        <p className="max-w-[64ch]">{p.whatChanged}</p>
      </section>

      <section aria-labelledby="affected">
        <SectionTitle id="affected">What was affected</SectionTitle>
        <ul className="list-disc space-y-1 pl-5">
          {p.affected.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="preserved">
        <SectionTitle id="preserved">What was preserved</SectionTitle>
        <ul className="list-disc space-y-1 pl-5" data-testid="proof-preserved">
          {p.preserved.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="changed">
        <SectionTitle id="changed">What Brindle changed</SectionTitle>
        <ul className="space-y-2">
          {p.brindleChanged.map((c) => (
            <li key={c.text} className="flex gap-3">
              <span className="mt-0.5 w-40 shrink-0 text-sm font-semibold text-recovery-text">
                {c.outcome}
              </span>
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="irrev">
        <SectionTitle id="irrev">What could not be undone</SectionTitle>
        {p.stillIrreversible.length ? (
          <ul className="space-y-3">
            {p.stillIrreversible.map((s) => (
              <li key={s.text}>
                <Callout tone="evidence" title={s.text}>
                  {s.handling} Owner: {s.owner}. Status: {s.status}.
                </Callout>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">Nothing in this incident was irreversible.</p>
        )}
      </section>

      <section aria-labelledby="checks">
        <SectionTitle id="checks">Independent verification</SectionTitle>
        <p className="mb-3 max-w-[64ch] text-muted">
          After recovery, Brindle read the real state again from scratch and re-checked each
          invariant. It did not reuse the numbers produced during recovery.
        </p>
        <Card as="div" className="p-0 md:p-0">
          <ul className="divide-y divide-line">
            {p.checks.map((c) => (
              <li key={c.title} className="flex items-center gap-3 px-5 py-3">
                {c.status === "PASS" ? (
                  <CheckCircle2 size={18} className="text-recovery-text" aria-label="Passed" />
                ) : (
                  <AlertTriangle size={18} className="text-critical-text" aria-label="Failed" />
                )}
                <span>{c.title}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <p className="text-sm text-muted">
        Receipt <Mono>{p.receiptId}</Mono>. A Recovery Proof is evidence of what Brindle checked. It
        is not a compliance certification.
      </p>
    </article>
  );
}
