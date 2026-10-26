"use client";

import { useRouter } from "next/navigation";
import { approveRecoveryAction } from "../../app/actions";
import { ConfirmAction, useToast } from "../ui/client";

/** Approval names exactly what will happen; there is no generic "Confirm". */
export function RecoveryApproval({
  incidentId,
  businessObject,
  steps,
  cannotBeUndone,
}: {
  incidentId: string;
  businessObject: string;
  steps: string[];
  cannotBeUndone: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  return (
    <ConfirmAction
      testId="approve-recovery"
      trigger={`Approve recovery of ${businessObject}`}
      title={`Approve recovery of ${businessObject}?`}
      confirmLabel={`Approve ${steps.length} ${steps.length === 1 ? "step" : "steps"} and recover ${businessObject}`}
      consequences={
        <div className="space-y-3">
          <p className="text-muted">
            Brindle will run only these registered steps, in this order, then verify the result with
            fresh reads:
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            {steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          {cannotBeUndone.length ? (
            <p className="rounded-md bg-critical-wash p-3 text-critical-text">
              <strong>Cannot be undone:</strong> {cannotBeUndone.join("; ")}. Brindle opens a
              corrective case; the original record stays as history.
            </p>
          ) : null}
        </div>
      }
      onConfirm={async () => {
        const form = new FormData();
        form.set("incidentId", incidentId);
        const result = await approveRecoveryAction(null, form);
        if (!result.ok) throw new Error(result.message);
        toast(result.message ?? "Approved.");
        router.refresh();
      }}
    />
  );
}
