"use client";

import { ActionForm } from "../../../components/ui/action-form";
import { betaRequestAction } from "./actions";

const input = "mt-1 h-11 w-full rounded-md border border-line-strong bg-surface px-3";

export function BetaForm() {
  return (
    <div className="rounded-lg bg-surface p-6 shadow-raise">
      <ActionForm
        action={betaRequestAction}
        submitLabel="Request access"
        pendingLabel="Sending…"
        testId="beta-submit"
        className="grid gap-4"
        onResult={(r) =>
          r.ok ? (
            <p
              role="status"
              className="mt-4 font-medium text-recovery-text"
              data-testid="beta-success"
            >
              {r.message}
            </p>
          ) : null
        }
      >
        <div>
          <label htmlFor="email" className="text-sm font-medium">
            Work email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className={input}
          />
        </div>
        <div>
          <label htmlFor="company" className="text-sm font-medium">
            Company
          </label>
          <input
            id="company"
            name="company"
            required
            minLength={2}
            maxLength={120}
            autoComplete="organization"
            className={input}
          />
        </div>
        <div>
          <label htmlFor="role" className="text-sm font-medium">
            Your role
          </label>
          <input
            id="role"
            name="role"
            required
            minLength={2}
            maxLength={120}
            autoComplete="organization-title"
            className={input}
          />
        </div>
        <div>
          <label htmlFor="useCase" className="text-sm font-medium">
            What do your agents do?
          </label>
          <textarea
            id="useCase"
            name="useCase"
            required
            minLength={10}
            maxLength={1000}
            rows={4}
            className="mt-1 w-full rounded-md border border-line-strong bg-surface p-3"
          />
        </div>
        {/* Honeypot: hidden from people and assistive tech. */}
        <div aria-hidden className="absolute -left-[9999px]">
          <label htmlFor="website">Website</label>
          <input id="website" name="website" tabIndex={-1} autoComplete="off" />
        </div>
      </ActionForm>
    </div>
  );
}
