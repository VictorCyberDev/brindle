"use client";

import { Button } from "../../components/ui/button";
import { Callout } from "../../components/ui/layout";

/** Specific, calm failure UX: no stack traces, no internals, a way to retry. */
export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-xl space-y-4" role="alert">
      <Callout tone="critical" title="We could not load this page">
        Nothing was changed. This is usually a brief connection problem. Try again, and if it keeps
        happening check the status of your database connection in Settings.
      </Callout>
      <Button variant="primary" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
