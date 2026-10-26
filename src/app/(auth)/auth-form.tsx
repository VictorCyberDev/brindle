"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { authClient, safeNext } from "../../lib/auth-client";

const field =
  "mt-1.5 block h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-base placeholder:text-faint";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"), mode === "sign-up" ? "/onboarding" : "/app");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    try {
      const result =
        mode === "sign-up"
          ? await authClient.signUp.email({
              email,
              password,
              name: String(form.get("name") ?? "").trim() || email.split("@")[0]!,
            })
          : await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(
          mode === "sign-in"
            ? "That email and password did not match. Check them and try again."
            : (result.error.message ??
                "We could not create that account. Check the details and try again."),
        );
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "sign-in" ? "Sign in" : "Create your account";
  return (
    <div>
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="mt-2 text-muted">
        {mode === "sign-in"
          ? "Welcome back. Pick up where recovery left off."
          : "Start in Shadow Mode. Nothing of yours is ever changed without you."}
      </p>
      <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
        {mode === "sign-up" ? (
          <div>
            <label htmlFor="name" className="text-sm font-medium">
              Your name
            </label>
            <input id="name" name="name" autoComplete="name" required className={field} />
          </div>
        ) : null}
        <div>
          <label htmlFor="email" className="text-sm font-medium">
            Work email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={field}
          />
        </div>
        <div>
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            minLength={mode === "sign-up" ? 10 : undefined}
            required
            className={field}
            aria-describedby={mode === "sign-up" ? "pw-hint" : undefined}
          />
          {mode === "sign-up" ? (
            <p id="pw-hint" className="mt-1.5 text-sm text-muted">
              At least 10 characters.
            </p>
          ) : null}
        </div>
        {error ? (
          <p
            role="alert"
            className="rounded-md bg-critical-wash p-3 text-sm text-critical-text"
            data-testid="auth-error"
          >
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={busy}
          data-testid="auth-submit"
        >
          {busy ? "One moment…" : title}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted">
        {mode === "sign-in" ? (
          <>
            New to Brindle?{" "}
            <Link className="font-medium text-fg underline underline-offset-4" href="/sign-up">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link className="font-medium text-fg underline underline-offset-4" href="/sign-in">
              Sign in
            </Link>
          </>
        )}
      </p>
      <p className="mt-2 text-sm text-muted">
        Just looking?{" "}
        <Link className="font-medium text-fg underline underline-offset-4" href="/demo">
          Try the recovery demo
        </Link>
        , no account needed.
      </p>
    </div>
  );
}
