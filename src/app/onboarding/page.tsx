import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "../../components/brand/seam";
import { ActionForm } from "../../components/ui/action-form";
import { LinkButton } from "../../components/ui/button";
import { ThemeToggle } from "../../components/ui/client";
import { CheckCircle2, AlertTriangle } from "../../components/ui/icons";
import { Card } from "../../components/ui/layout";
import { MODES, MODE_LABEL, MODE_SUMMARY, availableModes } from "../../product/permissions";
import { getProductDb } from "../../server/db";
import { runSafetyCheck } from "../../server/safety-check";
import { getWorkspaceContext, requireUser } from "../../server/session";
import {
  chooseModeAction,
  createWorkspaceAction,
  finishOnboardingAction,
  startDemoWorkspaceAction,
} from "../actions";
import { cn } from "../../components/ui/cn";

export const metadata = { title: "Set up your workspace" };

const STEPS = ["Workspace", "Recovery mode", "Connect", "Safety check"];

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  await requireUser("/onboarding");
  const ctx = await getWorkspaceContext();
  const wanted = Number((await searchParams).step ?? 1);
  const step = !ctx ? 1 : Math.min(Math.max(wanted || 1, 1), 4);
  // A user who already has a workspace and arrives without a step goes straight to the app.
  if (ctx && !(await searchParams).step) redirect("/app");

  const standard = ctx?.memberships.find((m) => m.kind === "STANDARD");
  const active = ctx?.active;

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <Link href="/" aria-label="Brindle Recovery home">
          <Wordmark />
        </Link>
        <ThemeToggle />
      </header>
      <main id="main" className="mx-auto max-w-3xl px-6 pb-20">
        <ol className="mb-10 flex gap-2" aria-label="Setup progress">
          {STEPS.map((s, i) => (
            <li
              key={s}
              aria-current={i + 1 === step ? "step" : undefined}
              className={cn(
                "flex-1 border-t-2 pt-2 text-sm",
                i + 1 <= step ? "border-signal text-fg" : "border-line text-muted",
              )}
            >
              <span className="hidden sm:inline">{i + 1}. </span>
              {s}
            </li>
          ))}
        </ol>

        {step === 1 ? (
          <section aria-labelledby="s1" data-testid="onboarding-step-1">
            <h1 id="s1" className="text-3xl font-semibold">
              Name your workspace
            </h1>
            <p className="mt-2 max-w-[56ch] text-muted">
              A workspace holds your agents, the decisions they made and the facts they relied on.
              Nothing in it is visible to any other workspace.
            </p>
            <Card className="mt-6">
              <ActionForm
                action={createWorkspaceAction}
                submitLabel="Create workspace"
                pendingLabel="Creating…"
                toastOnSuccess={false}
                testId="create-workspace"
              >
                <label htmlFor="name" className="block text-sm font-medium">
                  Workspace name
                </label>
                <input
                  id="name"
                  name="name"
                  required
                  minLength={2}
                  maxLength={60}
                  autoComplete="organization"
                  placeholder="Acme Procurement"
                  className="mt-1 h-11 w-full rounded-md border border-line-strong bg-surface px-3"
                />
              </ActionForm>
            </Card>
            <div className="mt-6 text-sm text-muted">
              Just looking around?{" "}
              <form action={startDemoWorkspaceAction} className="inline">
                <button className="underline underline-offset-4" data-testid="skip-to-demo">
                  Open the demo workspace instead
                </button>
              </form>
              . It is clearly labeled demo data.
            </div>
          </section>
        ) : null}

        {step === 2 && active ? (
          <section aria-labelledby="s2" data-testid="onboarding-step-2">
            <h1 id="s2" className="text-3xl font-semibold">
              How much should Brindle be allowed to do?
            </h1>
            <p className="mt-2 max-w-[56ch] text-muted">
              You can change this any time. Shadow Mode is the safe default: Brindle reports and
              proposes, and changes nothing.
            </p>
            <ActionForm
              action={chooseModeAction}
              submitLabel="Continue"
              toastOnSuccess={false}
              testId="choose-mode"
              className="mt-6"
            >
              <fieldset className="space-y-3">
                <legend className="sr-only">Recovery mode</legend>
                {availableModes(standard?.kind ?? "STANDARD").map((m) => (
                  <label
                    key={m}
                    className="flex cursor-pointer gap-3 rounded-lg bg-surface p-4 shadow-raise has-[:checked]:ring-2 has-[:checked]:ring-signal"
                  >
                    <input
                      type="radio"
                      name="mode"
                      value={m}
                      defaultChecked={m === "SHADOW"}
                      className="mt-1.5"
                    />
                    <span>
                      <span className="block font-semibold">
                        {MODE_LABEL[m]}
                        {m === "SHADOW" ? (
                          <span className="ml-2 text-sm font-normal text-muted">Recommended</span>
                        ) : null}
                      </span>
                      <span className="block text-muted">{MODE_SUMMARY[m]}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            </ActionForm>
            <p className="mt-4 text-sm text-muted">
              {MODES.length} modes exist. Bounded Autonomous only ever acts through recovery
              capabilities you have registered. No connector is registered yet, so it cannot change
              anything in your systems today.
            </p>
          </section>
        ) : null}

        {step === 3 && active ? (
          <section aria-labelledby="s3" data-testid="onboarding-step-3">
            <h1 id="s3" className="text-3xl font-semibold">
              Show Brindle what your agents did
            </h1>
            <p className="mt-2 max-w-[56ch] text-muted">
              Brindle needs two kinds of evidence: the decisions your agents made, and the facts
              they relied on. Send them from your own code.
            </p>
            <Card className="mt-6">
              <h2 className="font-semibold">Send evidence with the API</h2>
              <p className="mt-1 text-muted">
                Create an API key in Developer, then post one decision. The quickstart there has a
                working curl command.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <LinkButton href="/app/developer" variant="primary">
                  Open the quickstart
                </LinkButton>
              </div>
            </Card>
            <Card className="mt-4">
              <h2 className="font-semibold">Or explore with sample data first</h2>
              <p className="mt-1 text-muted">
                The demo workspace replays a complete recovery. Your own workspace stays empty and
                untouched.
              </p>
              <form action={startDemoWorkspaceAction} className="mt-4">
                <button className="inline-flex h-10 items-center rounded-md border border-line-strong px-4 hover:bg-sunken">
                  Open the demo workspace
                </button>
              </form>
            </Card>
            <p className="mt-6">
              <Link
                href="/onboarding?step=4"
                className="font-medium underline underline-offset-4"
                data-testid="to-safety-check"
              >
                Continue to the safety check
              </Link>
            </p>
          </section>
        ) : null}

        {step === 4 && active ? (
          <SafetyStep workspaceId={active.workspaceId} mode={active.mode} />
        ) : null}
      </main>
    </div>
  );
}

async function SafetyStep({
  workspaceId,
  mode,
}: {
  workspaceId: string;
  mode: (typeof MODES)[number];
}) {
  const { db } = await getProductDb();
  const items = await runSafetyCheck(db, { workspaceId, mode });
  const ok = items.every((i) => i.pass);
  return (
    <section aria-labelledby="s4" data-testid="onboarding-step-4">
      <h1 id="s4" className="text-3xl font-semibold">
        Safety check
      </h1>
      <p className="mt-2 max-w-[56ch] text-muted">
        These checks ran just now against your workspace. They are measurements, not promises.
      </p>
      <ul className="mt-6 space-y-3">
        {items.map((i) => (
          <li key={i.title} className="flex gap-3 rounded-lg bg-surface p-4 shadow-raise">
            {i.pass ? (
              <CheckCircle2 className="mt-0.5 shrink-0 text-recovery-text" aria-label="Passed" />
            ) : (
              <AlertTriangle className="mt-0.5 shrink-0 text-critical-text" aria-label="Failed" />
            )}
            <span>
              <span className="block font-semibold">{i.title}</span>
              <span className="block text-muted">{i.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      <form action={finishOnboardingAction} className="mt-8">
        <button
          disabled={!ok}
          className="inline-flex h-11 items-center rounded-md bg-signal px-5 font-semibold text-signal-on disabled:opacity-50"
          data-testid="finish-onboarding"
        >
          Enter your workspace
        </button>
      </form>
    </section>
  );
}
