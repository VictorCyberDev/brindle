"use client";

import { incidentStateAction } from "../../app/actions";
import { ActionForm } from "../ui/action-form";
import { Callout } from "../ui/layout";

const field = "mt-1.5 block w-full rounded-md border border-line-strong bg-surface px-3 py-2";

/** A person closes a customer incident. The record says so: Brindle did not verify it. */
export function ResolveIncident({ incidentId }: { incidentId: string }) {
  return (
    <section aria-labelledby="resolve" className="mt-14 max-w-xl border-t border-line pt-8">
      <h2 id="resolve" className="text-lg font-semibold">
        Close this incident
      </h2>
      <Callout tone="evidence" className="mt-3">
        Brindle cannot run recovery on your systems yet. When you resolve this, the record shows a
        person resolved it. Brindle does not claim it verified anything.
      </Callout>
      <ActionForm
        action={incidentStateAction}
        submitLabel="Mark resolved"
        variant="secondary"
        className="mt-4"
      >
        <input type="hidden" name="incidentId" value={incidentId} />
        <input type="hidden" name="to" value="RESOLVED_BY_HUMAN" />
        <label htmlFor="note" className="text-sm font-medium">
          What was done?
        </label>
        <textarea id="note" name="note" required minLength={3} rows={3} className={field} />
      </ActionForm>
    </section>
  );
}
