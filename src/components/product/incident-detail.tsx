import Link from "next/link";
import { can, MODE_LABEL, type Mode, type Role } from "../../product/permissions";
import { formatDate, plural } from "../../product/format";
import type { IncidentView } from "../../product/types";
import { Seam } from "../brand/seam";
import { LinkButton } from "../ui/button";
import { EvidenceDrawer } from "../ui/client";
import { ArrowRight, Download } from "../ui/icons";
import { Callout, Card, Mono, SectionTitle } from "../ui/layout";
import { ImpactMap } from "./impact-map";
import { ProofStrip, type Stage } from "./proof-strip";
import { RecoveryApproval } from "./recovery-approval";
import { CannotUndoBadge, IncidentStatusBadge, SeverityTag, TreatmentBadge } from "./status";

function stagesOf(i: IncidentView): Stage[] {
  const recovered = i.status === "RECOVERED";
  const waiting = i.status === "READY_TO_APPROVE" || i.status === "PROPOSED_SHADOW";
  return [
    { label: "Truth changed", state: "done" },
    { label: "Impact traced", state: "done" },
    { label: "Materiality judged", state: "done" },
    { label: "Recovery executed", state: recovered ? "done" : waiting ? "current" : "pending" },
    { label: "Recovery verified", state: recovered ? "done" : "pending" },
  ];
}

function whatChanged(i: IncidentView): string {
  const c = i.change;
  const base = `${c.subject}'s ${c.fact} changed from ${c.from} to ${c.to}.`;
  return c.retroactive
    ? `${base} It took effect on ${formatDate(c.effectiveFrom)}, but Brindle learned of it on ${formatDate(c.observedAt)}${c.lagDays ? `, ${plural(c.lagDays, "day")} later` : ""}. Anything decided in between relied on outdated truth.`
    : `${base} It takes effect on ${formatDate(c.effectiveFrom)}, after the decisions that were already made, so those decisions are unaffected.`;
}

function glance(i: IncidentView): string[] {
  const h = i.headline;
  const out: string[] = [];
  if (i.source === "DEMO") {
    out.push(`${plural(h.mayBeAffected, "consequence")} may be affected`);
    if (h.wouldChange) out.push(`${plural(h.wouldChange, "decision")} would have changed`);
    if (h.wouldStayTheSame) out.push(`${h.wouldStayTheSame} would have stayed the same`);
    if (h.needsHuman) out.push(`${h.needsHuman} need a person`);
    if (h.recoverableAutomatically)
      out.push(`${plural(h.recoverableAutomatically, "action")} can be recovered automatically`);
    if (h.cannotBeUndone) out.push(`${h.cannotBeUndone} cannot be undone`);
    if (h.preservedUnrelated) out.push("PO-901 is preserved");
  } else {
    out.push(`${plural(h.needsHuman, "decision")} need${h.needsHuman === 1 ? "s" : ""} review`);
    if (h.cannotBeUndone) out.push(`${h.cannotBeUndone} cannot be undone`);
    if (h.preservedUnrelated)
      out.push(`${plural(h.preservedUnrelated, "related decision")} not affected`);
  }
  return out;
}

export function IncidentDetail({
  incident: i,
  role,
  mode,
}: {
  incident: IncidentView;
  role: Role;
  mode: Mode;
}) {
  const canApprove = can(role, "recovery.approve");
  const readyToApprove = i.status === "READY_TO_APPROVE";
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_16rem]">
      <div className="min-w-0 space-y-14">
        {/* A. SUMMARY */}
        <section aria-labelledby="summary">
          <div className="flex flex-wrap items-center gap-2">
            <IncidentStatusBadge status={i.status} label={i.statusLabel} />
            <SeverityTag severity={i.severity} />
            {i.source === "DEMO" ? (
              <span className="text-xs font-semibold tracking-wide text-muted">DEMO DATA</span>
            ) : null}
          </div>
          <h1
            id="summary"
            className="mt-3 text-[2rem] font-semibold leading-tight md:text-[2.4rem]"
            data-testid="incident-title"
          >
            {i.title}
          </h1>
          <p className="mt-2 text-lg text-muted">{i.summary}</p>
          <p className="mt-6 max-w-[62ch] text-[1.05rem]" data-testid="what-changed">
            {whatChanged(i)}
          </p>
          <div className="mt-8">
            <ProofStrip stages={stagesOf(i)} />
          </div>
        </section>

        {/* B. IMPACT */}
        <section aria-labelledby="impact">
          <SectionTitle id="impact">What may be affected</SectionTitle>
          <p className="max-w-[62ch] text-muted">
            {i.source === "DEMO"
              ? `${plural(i.headline.mayBeAffected, "consequence")} connect to this change: the decisions that used it, the actions they took, and the records those actions created.`
              : `${plural(i.impact.length, "recorded decision")} used the superseded value after it stopped being true.`}
          </p>
          <div className="mt-4 flex gap-2">
            <EvidenceDrawer label="View impact map" title="Impact map">
              <ImpactMap incident={i} />
            </EvidenceDrawer>
          </div>
        </section>

        {/* C. MATERIALITY */}
        <section aria-labelledby="materiality">
          <SectionTitle id="materiality">What would actually have changed</SectionTitle>
          <p className="max-w-[62ch] text-muted">
            {i.source === "DEMO"
              ? "Brindle rebuilt each decision as it was originally made, swapped in only the corrected fact, and asked what the agent would have done."
              : "Brindle cannot replay your agent, so it does not guess. Each decision below needs a person to judge."}
          </p>
          <ul className="mt-5 divide-y divide-line" data-testid="impact-list">
            {i.impact.map((row) => (
              <li key={row.id} className="py-5 first:pt-0" data-testid="impact-row">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{row.agent}</span>
                  <TreatmentBadge treatment={row.treatment} />
                </div>
                <p className="mt-1.5">{row.decision}</p>
                <p className="text-muted">{row.counterfactual}.</p>
                <p className="mt-1 text-sm text-muted">{row.reason}</p>
                {row.consequences.length ? (
                  <ul className="mt-3 space-y-1.5 border-l-2 border-line pl-4 text-sm">
                    {row.consequences.map((c) => (
                      <li key={c.label} className="flex flex-wrap items-center gap-2">
                        {c.label}
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

          {i.preserved.length ? (
            <div className="mt-8" data-testid="preserved">
              <h3 className="font-semibold">What Brindle will preserve</h3>
              <ul className="mt-3 space-y-2">
                {i.preserved.map((p) => (
                  <li key={p.label} className="flex gap-3">
                    <TreatmentBadge treatment="PRESERVED" />
                    <span>
                      <span className="font-medium">{p.label}.</span>{" "}
                      <span className="text-muted">{p.why}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {/* D. RECOVERY PLAN */}
        <section aria-labelledby="plan">
          <SectionTitle id="plan">Recovery plan</SectionTitle>
          {i.memory ? (
            <div className="mb-6" data-testid="memory-block">
              <p className="eyebrow mb-2">Consulted before planning</p>
              {i.memory.hits.length ? (
                i.memory.hits.map((h) => (
                  <Card key={h.incidentId} className="bg-signal-wash p-4 shadow-none md:p-5">
                    <div className="flex items-center gap-3">
                      <Seam state="verified" className="h-5 w-20 shrink-0 text-fg" />
                      <p
                        className="text-xs font-bold tracking-widest"
                        data-testid="similar-verified"
                      >
                        SIMILAR VERIFIED RECOVERY
                      </p>
                    </div>
                    <p className="mt-2 font-semibold">
                      {h.title} · {h.relevancePct}% relevant
                    </p>
                    <p className="text-sm text-muted">{h.why}</p>
                    <p className="mt-2 text-sm">Worked before: {h.pattern.join("; ")}.</p>
                    {h.warnings.length ? (
                      <p className="mt-1 text-sm text-evidence-text">
                        Watch for: {h.warnings.join("; ")}
                      </p>
                    ) : null}
                  </Card>
                ))
              ) : (
                <p className="text-muted">{i.memory.note}</p>
              )}
              {i.memory.hits.length ? (
                <p className="mt-2 text-sm text-muted">{i.memory.note}</p>
              ) : null}
            </div>
          ) : null}

          {i.plan ? (
            <>
              <h3 className="font-semibold">What Brindle will change</h3>
              <ol className="mt-3 space-y-4" data-testid="plan-steps">
                {i.plan.steps.map((s) => (
                  <li key={s.order} className="flex gap-4">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sunken text-xs font-bold">
                      {s.order}
                    </span>
                    <div>
                      <p className="font-medium">
                        {s.title}{" "}
                        {s.status === "DONE" ? (
                          <span className="ml-1 text-sm font-normal text-recovery-text">Done</span>
                        ) : null}
                      </p>
                      <p className="text-sm text-muted">{s.why}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                        <span className="rounded-sm border border-line px-1.5 py-0.5 text-xs">
                          {s.kind}
                        </span>
                        {s.cannotBeUndone ? <CannotUndoBadge /> : null}
                        <span className="text-muted">Needs: {s.authority.toLowerCase()}</span>
                      </p>
                    </div>
                  </li>
                ))}
              </ol>

              <h3 className="mt-8 font-semibold">What Brindle will not change</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                {i.plan.willNotChange.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>

              {i.plan.cannotBeUndone.length ? (
                <Callout tone="critical" title="Cannot be undone" className="mt-6">
                  {i.plan.cannotBeUndone.join("; ")}. Brindle does not call this a rollback. It
                  records a corrective case with an owner and keeps the original as history.
                </Callout>
              ) : null}

              <p className="mt-6 text-sm text-muted">
                <strong className="text-fg">Expected result.</strong> {i.plan.expectedResult}
              </p>

              <div className="mt-6 rounded-lg border border-line p-5">
                {readyToApprove && canApprove ? (
                  <div className="flex flex-wrap items-center gap-4">
                    <RecoveryApproval
                      incidentId={i.id}
                      businessObject={i.businessObject}
                      steps={i.plan.steps.map((s) => s.title)}
                      cannotBeUndone={i.plan.cannotBeUndone}
                    />
                    <p className="text-sm text-muted">
                      Only registered steps run. Anything else waits for a person.
                    </p>
                  </div>
                ) : readyToApprove ? (
                  <Callout tone="evidence" title="You can read this, but not approve it">
                    Your role is read-only. An operator, admin or owner can approve.
                  </Callout>
                ) : i.status === "PROPOSED_SHADOW" ? (
                  <div>
                    <p className="font-semibold">{MODE_LABEL[mode]} never changes your systems.</p>
                    <p className="mt-1 text-sm text-muted">
                      This is what Brindle would do. To let it act with your approval, switch to
                      Approval Mode.
                    </p>
                    <div className="mt-3">
                      <LinkButton href="/app/settings" variant="secondary">
                        Review recovery mode
                      </LinkButton>
                    </div>
                  </div>
                ) : (
                  <p className="font-semibold text-recovery-text">
                    All steps ran and were independently verified.
                  </p>
                )}
              </div>
            </>
          ) : (
            <Callout tone="neutral" title="Shadow report" data-testid="shadow-note">
              {i.shadowNote}
            </Callout>
          )}
        </section>

        {/* E. PROOF */}
        <section aria-labelledby="proof">
          <SectionTitle id="proof">Proof</SectionTitle>
          {i.proof ? (
            <div data-testid="proof-block">
              <p className="text-xl font-semibold text-recovery-text">{i.proof.verdictLabel}.</p>
              <p className="mt-1 max-w-[62ch] text-muted">
                {i.proof.checks.filter((c) => c.status === "PASS").length} of{" "}
                {i.proof.checks.length} independent checks passed on fresh reads of the real state,
                issued {formatDate(i.proof.issuedAt)}.
              </p>
              <div className="mt-4">
                <LinkButton href={`/app/recoveries/${i.id}`} variant="secondary">
                  Open the Recovery Proof <ArrowRight size={16} aria-hidden />
                </LinkButton>
              </div>
            </div>
          ) : (
            <p className="max-w-[62ch] text-muted">
              {i.source === "WORKSPACE"
                ? "Brindle has not verified anything for this incident because it cannot execute recovery on your systems. A person resolves it, and the resolution is recorded as theirs."
                : "No proof yet. Brindle issues a Recovery Proof only after the recovery runs and an independent check passes."}
            </p>
          )}
        </section>

        {/* F. EVIDENCE */}
        <section aria-labelledby="evidence">
          <SectionTitle id="evidence">Evidence</SectionTitle>
          <p className="text-muted">
            Identifiers, enumerations and the raw records behind everything above.
          </p>
          <div className="mt-3">
            <EvidenceDrawer title="Technical evidence">
              <dl className="space-y-3 text-sm">
                {i.impact.map((r) => (
                  <div key={r.id}>
                    <dt className="font-semibold">{r.agent}</dt>
                    <dd>
                      <Mono>{JSON.stringify(r.technical)}</Mono>
                    </dd>
                  </div>
                ))}
              </dl>
              <pre className="mt-5 overflow-x-auto rounded-md bg-sunken p-3 font-mono text-xs leading-relaxed">
                {JSON.stringify(i.evidence, null, 2)}
              </pre>
            </EvidenceDrawer>
          </div>
        </section>
      </div>

      {/* Side panel (desktop). On smaller screens the same facts sit at the top of the story. */}
      <aside className="hidden lg:block">
        <div className="sticky top-24 space-y-8">
          <div>
            <p className="eyebrow mb-3">At a glance</p>
            <ul className="space-y-2 text-[0.95rem]" data-testid="glance">
              {glance(i).map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
          {i.nextAction ? (
            <div>
              <p className="eyebrow mb-2">Next</p>
              <p className="text-[0.95rem] font-medium">{i.nextAction}</p>
            </div>
          ) : null}
          <nav aria-label="On this page">
            <p className="eyebrow mb-3">On this page</p>
            <ul className="space-y-1.5 text-sm text-muted">
              {[
                ["summary", "Summary"],
                ["impact", "Impact"],
                ["materiality", "Materiality"],
                ["plan", "Recovery plan"],
                ["proof", "Proof"],
                ["evidence", "Evidence"],
              ].map(([id, label]) => (
                <li key={id}>
                  <Link href={`#${id}`} className="hover:text-fg">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </aside>
    </div>
  );
}
