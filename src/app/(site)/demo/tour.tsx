"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ImpactMap } from "../../../components/product/impact-map";
import { TreatmentBadge, CannotUndoBadge } from "../../../components/product/status";
import { Seam, type SeamState } from "../../../components/brand/seam";
import { Button, buttonClass } from "../../../components/ui/button";
import { cn } from "../../../components/ui/cn";
import { CheckCircle2, ChevronRight, AlertTriangle } from "../../../components/ui/icons";
import { Callout, Card } from "../../../components/ui/layout";
import { formatDate } from "../../../product/format";
import type { IncidentView } from "../../../product/types";

interface Step {
  id: string;
  title: string;
  seam: SeamState;
  body: ReactNode;
}

const STEP_MS = 7000;

export function DemoTour({
  a,
  bPlanned,
  bDone,
  computedAt,
}: {
  a: IncidentView;
  bPlanned: IncidentView;
  bDone: IncidentView;
  computedAt: string;
}) {
  const [started, setStarted] = useState(false);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  const steps: Step[] = [
    {
      id: "healthy",
      title: "Your agents did the right thing",
      seam: "valid",
      body: (
        <>
          <p>
            Atlas Components held a valid certification. Three agents acted on it: they approved a
            purchase order, scheduled production and quoted a customer. Everything was consistent
            and correct.
          </p>
          <ul className="mt-4 space-y-1">
            {a.impact.map((r) => (
              <li key={r.id} className="text-muted">
                <b className="text-fg">{r.agent}</b>: {r.decision}
              </li>
            ))}
          </ul>
        </>
      ),
    },
    {
      id: "change",
      title: "Then the truth changed",
      seam: "break",
      body: (
        <>
          <p>
            {a.change.subject}&apos;s {a.change.fact} changed from <b>{a.change.from}</b> to{" "}
            <b>{a.change.to}</b>.
          </p>
          <p className="mt-3 text-muted">
            It took effect {formatDate(a.change.effectiveFrom)}. The business learned of it{" "}
            {formatDate(a.change.observedAt)}, {a.change.lagDays} days later. The change is{" "}
            <b className="text-fg">retroactive</b>: your agents acted on a fact that was already
            wrong.
          </p>
        </>
      ),
    },
    {
      id: "impact",
      title: "Brindle traces exactly what it touched",
      seam: "break",
      body: (
        <>
          <p className="mb-4">
            From the changed fact, Brindle follows every decision that used it and everything those
            decisions created.
          </p>
          <ImpactMap incident={a} />
        </>
      ),
    },
    {
      id: "materiality",
      title: "Which decisions would really have changed?",
      seam: "break",
      body: (
        <>
          <p>
            Brindle re-evaluates each decision with the corrected fact. A decision is recovered only
            if the corrected fact would have changed it.
          </p>
          <ul className="mt-4 space-y-3">
            {a.impact.map((r) => (
              <li key={r.id} className="rounded-md bg-sunken p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <TreatmentBadge treatment={r.treatment} />
                  <span className="font-semibold">{r.agent}</span>
                </div>
                <p className="mt-1 text-sm text-muted">{r.reason}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4">
            <b>{a.headline.preservedUnrelated}</b> unrelated decisions were never touched.
          </p>
        </>
      ),
    },
    {
      id: "plan",
      title: "A precise plan, and what it will not do",
      seam: "recovering",
      body: (
        <>
          <ol className="space-y-3">
            {a.plan?.steps.map((s) => (
              <li key={s.order} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-paper">
                  {s.order}
                </span>
                <span>
                  <span className="block font-semibold">{s.title}</span>
                  <span className="block text-sm text-muted">{s.why}</span>
                  {s.cannotBeUndone ? <CannotUndoBadge /> : null}
                </span>
              </li>
            ))}
          </ol>
          {a.plan?.cannotBeUndone.length ? (
            <div className="mt-5">
              <Callout tone="evidence" title="Cannot be undone">
                {a.plan.cannotBeUndone.join(" ")} Brindle escalates this to a person instead of
                pretending it can be reversed.
              </Callout>
            </div>
          ) : null}
        </>
      ),
    },
    {
      id: "approve",
      title: "A person approves. Then Brindle acts.",
      seam: "recovering",
      body: (
        <>
          <p>
            In Approval Mode, a named person approves the plan and Brindle executes only that plan,
            step by step, each one re-validated against current facts. In Shadow Mode it would only
            have proposed. In Bounded Autonomous Mode it acts alone, only through registered
            capabilities.
          </p>
          <p className="mt-4 text-muted">
            Brindle can only use fixed capabilities. There is no way to make it run an arbitrary
            command.
          </p>
        </>
      ),
    },
    {
      id: "proof",
      title: "Proof, from a fresh read",
      seam: "verified",
      body: (
        <>
          <p className="text-xl font-semibold text-recovery-text">{a.proof?.verdictLabel}.</p>
          <p className="mt-1 text-muted">
            Brindle read the real state again from scratch and re-checked each invariant. It did not
            reuse numbers from recovery.
          </p>
          <ul className="mt-4 space-y-2">
            {a.proof?.checks.map((c) => (
              <li key={c.title} className="flex items-center gap-2">
                {c.status === "PASS" ? (
                  <CheckCircle2 size={18} className="text-recovery-text" aria-label="Passed" />
                ) : (
                  <AlertTriangle size={18} className="text-critical-text" aria-label="Failed" />
                )}
                {c.title}
              </li>
            ))}
          </ul>
          <p className="mt-4">
            <Link className="underline underline-offset-4" href="/proof/demo-atlas">
              Open the full Recovery Proof
            </Link>
          </p>
        </>
      ),
    },
    {
      id: "memory",
      title: "It remembers what worked",
      seam: "verified",
      body: (
        <>
          <p>
            Because the recovery was independently verified, Brindle stored the pattern. Nothing
            unverified is ever remembered.
          </p>
          <p className="mt-3 text-muted">Pattern remembered:</p>
          <ul className="mt-1 list-disc pl-5">
            {(bPlanned.memory?.hits[0]?.pattern ?? []).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </>
      ),
    },
    {
      id: "second",
      title: "A second incident, planned with memory",
      seam: "recovering",
      body: (
        <>
          <p>
            Later, a different supplier&apos;s certification is revoked: {bPlanned.title}. Before
            planning, Brindle consulted memory.
          </p>
          {bPlanned.memory?.hits.map((h) => (
            <Card key={h.incidentId} className="mt-4">
              <p className="eyebrow mb-1">Similar verified recovery</p>
              <p className="font-semibold">{h.title}</p>
              <p className="text-sm text-muted">
                {h.relevancePct}% relevant. {h.why}
              </p>
            </Card>
          ))}
          <p className="mt-4 text-muted">
            Memory advised the plan. Brindle still checked every step against today&apos;s facts,
            and verified the result again: {bDone.proof?.verdictLabel}.
          </p>
        </>
      ),
    },
  ];

  const last = steps.length - 1;
  const step = steps[i]!;

  useEffect(() => {
    if (!playing || i >= last) return;
    const t = setTimeout(() => {
      setI(i + 1);
      if (i + 1 >= last) setPlaying(false);
    }, STEP_MS);
    return () => clearTimeout(t);
  }, [playing, i, last]);

  useEffect(() => {
    if (started) heading.current?.focus({ preventScroll: false });
  }, [i, started]);

  if (!started) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-20">
        <p className="eyebrow mb-3">Product tour · no sign-up</p>
        <h1 className="display text-5xl md:text-6xl">One changed fact. One precise recovery.</h1>
        <p className="mt-5 max-w-[56ch] text-lg text-muted">
          Walk through a complete recovery in {steps.length} steps. Watch it play, or explore each
          step yourself.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button
            variant="primary"
            size="lg"
            data-testid="run-story"
            onClick={() => {
              setStarted(true);
              setPlaying(true);
            }}
          >
            Run the recovery story
          </Button>
          <Button
            size="lg"
            data-testid="explore"
            onClick={() => {
              setStarted(true);
              setPlaying(false);
            }}
          >
            Explore step by step
          </Button>
        </div>
        <p className="mt-8 max-w-[62ch] text-sm text-muted">
          DEMO DATA. This is a recording of one real run of Brindle&apos;s recovery engine against a
          sandbox business system, produced {formatDate(computedAt)}. Nothing here touches real
          systems.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-10" data-testid="tour">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted" aria-live="polite">
          Step {i + 1} of {steps.length} · DEMO DATA
        </p>
        <Button size="sm" onClick={() => setPlaying((p) => !p)} data-testid="play-pause">
          {playing ? "Pause" : i >= last ? "Replay" : "Play"}
        </Button>
      </div>
      <div className="grid gap-8 md:grid-cols-[16rem_1fr]">
        <ol className="hidden space-y-1 md:block" aria-label="Steps">
          {steps.map((s, idx) => (
            <li key={s.id}>
              <button
                onClick={() => {
                  setPlaying(false);
                  setI(idx);
                }}
                aria-current={idx === i ? "step" : undefined}
                className={cn(
                  "w-full rounded px-2 py-1.5 text-left text-sm",
                  idx === i ? "bg-sunken font-semibold" : "text-muted hover:text-fg",
                )}
              >
                {idx + 1}. {s.title}
              </button>
            </li>
          ))}
        </ol>
        <section aria-labelledby="step-title" data-testid="tour-step" data-step={step.id}>
          <Seam state={step.seam} animate className="mb-6 h-10 w-56 text-fg" key={step.id} />
          <h1
            id="step-title"
            ref={heading}
            tabIndex={-1}
            className="display text-4xl outline-none md:text-5xl"
          >
            {step.title}
          </h1>
          <div className="mt-6 max-w-[64ch] text-lg">{step.body}</div>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button
              onClick={() => {
                setPlaying(false);
                setI(Math.max(0, i - 1));
              }}
              disabled={i === 0}
            >
              Back
            </Button>
            {i < last ? (
              <Button
                variant="primary"
                onClick={() => {
                  setPlaying(false);
                  setI(i + 1);
                }}
                data-testid="next"
              >
                Next <ChevronRight size={16} aria-hidden />
              </Button>
            ) : (
              <>
                <Link href="/sign-up" className={buttonClass("primary")} data-testid="tour-cta">
                  Open the Demo Workspace
                </Link>
                <Link href="/beta" className={buttonClass("secondary")}>
                  Request beta access
                </Link>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
