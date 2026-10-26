"use client";

import { ActionForm } from "../../../components/ui/action-form";
import { CopyButton } from "../../../components/ui/client";
import { Callout } from "../../../components/ui/layout";
import { issueKeyAction, revokeKeyAction } from "../../actions";

export function IssueKeyForm() {
  return (
    <ActionForm
      action={issueKeyAction}
      submitLabel="Create key"
      pendingLabel="Creating…"
      testId="issue-key"
      toastOnSuccess={false}
      className="max-w-md"
      onResult={(r) =>
        r.ok && r.data ? (
          <div className="mt-4" data-testid="new-key">
            <Callout tone="evidence" title="Copy this key now. You will not see it again.">
              <code
                className="block break-all rounded bg-sunken p-2 font-mono text-sm"
                data-testid="key-plaintext"
              >
                {r.data.plaintext}
              </code>
              <div className="mt-2">
                <CopyButton value={r.data.plaintext} label="Copy key" />
              </div>
            </Callout>
          </div>
        ) : null
      }
    >
      <label htmlFor="label" className="block text-sm font-medium">
        Label
      </label>
      <input
        id="label"
        name="label"
        required
        minLength={2}
        maxLength={60}
        placeholder="Procurement agent, production"
        className="mt-1 h-10 w-full rounded-md border border-line-strong bg-surface px-3"
      />
    </ActionForm>
  );
}

export function RevokeKeyForm({ keyId }: { keyId: string }) {
  return (
    <ActionForm action={revokeKeyAction} submitLabel="Revoke" variant="danger">
      <input type="hidden" name="keyId" value={keyId} />
    </ActionForm>
  );
}
