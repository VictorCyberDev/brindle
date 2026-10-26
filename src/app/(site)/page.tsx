import Link from "next/link";
import { Seam } from "../../components/brand/seam";
import { buttonClass } from "../../components/ui/button";
import { ArrowRight, Brain, FileCheck2, Lock, ShieldCheck } from "../../components/ui/icons";
import { buildDemoIncident } from "../../product/dossier";
import { getStory } from "../../story/get";

export const metadata = {
  title: "Brindle Recovery: truth changed, recover precisely",
  description:
    "When a fact your AI agents relied on turns out to be wrong, Brindle finds what is affected, recovers only that, preserves everything else, and proves it.",
};

const FAQ = [
  [
    "Does Brindle change my systems today?",
    "Not in your own workspace. Brindle traces impact and proposes recoveries. Changing a system needs a registered recovery capability for it, and none is shipped for customer systems yet. The demo shows the full recovery on a sandbox business system.",
  ],
  [
    "Is the demo real?",
    "The recovery engine in the demo is the real implementation, run against a sandbox business system with sample data. The data is labeled DEMO DATA wherever it appears.",
  ],
  [
    "What can it not undo?",
    "Anything that left the building: a sent email, a confirmed shipment, a paid invoice. Brindle never pretends otherwise. It marks them, opens a corrective case for a person, and states them in the proof.",
  ],
  [
    "Do I have to trust a model?",
    "No. Which decisions would have changed is computed deterministically from your own facts. Models are not in the recovery path.",
  ],
  ["What does it cost?", "The private beta is a free pilot. There is no billing in this product."],
];

export default function LandingPage() {
  const a = buildDemoIncident(getStory(), "A", { mode: "APPROVAL", approvedB: false });
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-5 pb-20 pt-16 md:pt-24">
          <p className="eyebrow mb-5">The recovery plane for AI agents</p>
          <h1
            className="display max-w-4xl text-[2.9rem] leading-[1.02] sm:text-6xl md:text-7xl"
            data-testid="hero-title"
          >
            Truth changed.
            <br />
            <span className="italic text-signal-text">Recover precisely.</span>
          </h1>
          <p className="mt-7 max-w-[56ch] text-xl text-muted">
            Your agents acted on a fact that later turned out to be wrong. Brindle finds exactly
            what that touched, recovers only that, preserves everything else, and proves it.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/demo" className={buttonClass("primary", "lg")} data-testid="hero-demo">
              Run the recovery story <ArrowRight size={18} aria-hidden />
            </Link>
            <Link href="/beta" className={buttonClass("secondary", "lg")}>
              Request private beta access
            </Link>
          </div>
          <Seam
            state="verified"
            animate
            className="mt-16 h-14 w-full max-w-2xl text-fg"
            label="A line breaks where the fact changed, follows a corrected path, and reconnects verified"
          />
        </div>
      </section>

      <section className="border-y border-line bg-sunken">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-2">
          <div>
            <p className="eyebrow mb-3">The problem</p>
            <h2 className="display text-4xl md:text-5xl">
              A fact changes. Your agents already acted.
            </h2>
          </div>
          <div className="space-y-4 text-lg text-muted">
            <p>
              A supplier&apos;s certification is revoked. It took effect a week ago. You find out
              today. In that week your agents approved orders, released payments and told customers
              dates.
            </p>
            <p>
              Rolling everything back destroys good work. Doing nothing leaves wrong work standing.
              Today a person reads logs and guesses.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20" aria-labelledby="how">
        <p className="eyebrow mb-3">How it works</p>
        <h2 id="how" className="display max-w-3xl text-4xl md:text-5xl">
          Trace. Decide. Recover. Prove.
        </h2>
        <ol className="mt-12 grid gap-8 md:grid-cols-4">
          {[
            [
              "Trace",
              "Follow the changed fact through every decision that used it and every consequence that followed.",
            ],
            [
              "Decide",
              "Re-evaluate each decision with the corrected fact. Mark it would change, would stay the same, or needs a person.",
            ],
            [
              "Recover",
              "Reverse or compensate only what would change, through fixed, validated capabilities. Never what cannot be undone.",
            ],
            [
              "Prove",
              "Read the real state again from scratch and check six invariants. Issue a Recovery Proof.",
            ],
          ].map(([t, d], i) => (
            <li key={t}>
              <span className="mb-3 grid h-9 w-9 place-items-center rounded-full bg-ink text-sm font-bold text-paper">
                {i + 1}
              </span>
              <h3 className="text-xl font-semibold">{t}</h3>
              <p className="mt-2 text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-ink text-paper">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="eyebrow mb-3 !text-paper/60">A real example</p>
          <h2 className="display max-w-3xl text-4xl md:text-5xl">{a.title}</h2>
          <p className="mt-4 max-w-[60ch] text-lg text-paper/75">{a.summary}</p>
          <dl className="mt-12 grid grid-cols-2 gap-8 md:grid-cols-4">
            {[
              [a.headline.wouldChange, "decision would have changed"],
              [a.headline.wouldStayTheSame, "stayed the same, and was kept"],
              [a.headline.cannotBeUndone, "effect cannot be undone, and is escalated"],
              [a.headline.preservedUnrelated, "unrelated decisions untouched"],
            ].map(([n, l]) => (
              <div key={String(l)}>
                <dt className="display text-6xl text-[var(--signal-fill)]">{n}</dt>
                <dd className="mt-1 text-paper/75">{l}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-10 text-sm text-paper/60">
            DEMO DATA from a sandbox business system, produced by the real engine.
          </p>
          <Link href="/demo" className={`${buttonClass("primary", "lg")} mt-6`}>
            Walk through it
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-5 py-20 md:grid-cols-3">
        {[
          [
            ShieldCheck,
            "Recover only what is wrong",
            "Counterfactual materiality: a decision is recovered only if the corrected fact would have changed it.",
          ],
          [
            Lock,
            "Preserve everything else",
            "Correct work stays untouched. The proof lists what was preserved and why.",
          ],
          [
            FileCheck2,
            "Prove it independently",
            "A fresh read of the real state, six invariants, one shareable Recovery Proof.",
          ],
        ].map(([Icon, t, d]) => {
          const I = Icon as typeof Lock;
          return (
            <div key={String(t)} className="rounded-lg bg-surface p-6 shadow-raise">
              <I size={22} className="text-evidence-text" aria-hidden />
              <h3 className="mt-3 text-xl font-semibold">{String(t)}</h3>
              <p className="mt-2 text-muted">{String(d)}</p>
            </div>
          );
        })}
      </section>

      <section className="border-y border-line bg-sunken">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-2">
          <div>
            <p className="eyebrow mb-3">Trust modes</p>
            <h2 className="display text-4xl md:text-5xl">You decide how far it may go.</h2>
          </div>
          <ul className="space-y-5">
            {[
              ["Shadow", "Default. Brindle reports and proposes. It changes nothing."],
              ["Approval", "A named person approves a plan, and Brindle executes only that plan."],
              [
                "Bounded Autonomous",
                "Brindle acts alone, only through registered capabilities, within fixed limits.",
              ],
            ].map(([t, d]) => (
              <li key={t}>
                <h3 className="text-lg font-semibold">{t}</h3>
                <p className="text-muted">{d}</p>
              </li>
            ))}
            <li className="text-sm text-muted">
              No connector to your own systems is shipped yet. In your workspace, Brindle observes
              and proposes.
            </li>
          </ul>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-20 md:grid-cols-2">
        <div>
          <Brain size={26} className="text-evidence-text" aria-hidden />
          <h2 className="display mt-3 text-4xl md:text-5xl">It remembers what worked.</h2>
          <p className="mt-4 max-w-[52ch] text-lg text-muted">
            After a recovery is independently verified, Brindle remembers the pattern. When a
            similar incident appears, it shows what it recalled before planning. Memory advises. It
            never authorizes an action.
          </p>
        </div>
        <div className="rounded-lg bg-surface p-6 shadow-raise">
          <p className="eyebrow mb-2">Similar verified recovery</p>
          <p className="font-semibold">Atlas Components certification revoked</p>
          <p className="mt-1 text-muted">
            Consulted when planning Cedarline Bearings. The same precise-recovery pattern applied,
            and every step was still checked against current facts.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 pb-8" aria-labelledby="faq">
        <h2 id="faq" className="display text-4xl">
          Straight answers
        </h2>
        <dl className="mt-8 divide-y divide-line">
          {FAQ.map(([q, ans]) => (
            <div key={q} className="py-5">
              <dt className="font-semibold">{q}</dt>
              <dd className="mt-1 text-muted">{ans}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto mt-16 max-w-6xl px-5">
        <div className="rounded-xl bg-ink p-10 text-paper md:p-14">
          <h2 className="display max-w-2xl text-4xl md:text-5xl">
            See a recovery proven in two minutes.
          </h2>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/demo" className={buttonClass("primary", "lg")}>
              Run the recovery story
            </Link>
            <Link
              href="/beta"
              className="inline-flex h-12 items-center rounded-md border border-paper/40 px-6 font-medium hover:bg-paper/10"
            >
              Request access
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
