"use client";

import { useActionState, useEffect, type ReactNode } from "react";
import type { ActionResult } from "../../server/actions-core";
import { SubmitButton, useToast } from "./client";

type Action<T> = (prev: ActionResult<T> | null, formData: FormData) => Promise<ActionResult<T>>;

/** A form bound to a server action: pending-safe submit, inline error, optional toast on success. */
export function ActionForm<T = undefined>({
  action,
  children,
  submitLabel,
  pendingLabel,
  variant = "primary",
  className,
  toastOnSuccess = true,
  onResult,
  testId,
}: {
  action: Action<T>;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
  toastOnSuccess?: boolean;
  onResult?: (result: ActionResult<T>) => ReactNode;
  testId?: string;
}) {
  const [state, formAction] = useActionState<ActionResult<T> | null, FormData>(action, null);
  const toast = useToast();
  useEffect(() => {
    if (state?.ok && state.message && toastOnSuccess) toast(state.message);
  }, [state, toast, toastOnSuccess]);
  return (
    <form action={formAction} className={className}>
      {children}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <SubmitButton variant={variant} pendingLabel={pendingLabel} data-testid={testId}>
          {submitLabel}
        </SubmitButton>
        {state && !state.ok ? (
          <p role="alert" className="text-sm text-critical-text" data-testid="form-error">
            {state.message}
          </p>
        ) : null}
      </div>
      {state ? onResult?.(state) : null}
    </form>
  );
}
