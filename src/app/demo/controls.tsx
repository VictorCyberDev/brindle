"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DemoControls() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function post(path: string, label: string) {
    setBusy(label);
    setMessage(null);
    try {
      const res = await fetch(path, { method: "POST" });
      const body = (await res.json()) as {
        status?: string;
        result?: { status?: string; code?: string };
        message?: string;
      };
      setMessage(
        `${label}: HTTP ${res.status} ${body.result?.status ?? body.status ?? ""} ${body.result?.code ?? body.message ?? ""}`.trim(),
      );
      router.refresh();
    } catch {
      setMessage(`${label}: request failed`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        disabled={busy !== null}
        onClick={() => post("/api/demo/run-success", "Run successful world")}
        data-testid="run-success"
      >
        Run successful world
      </button>
      <button
        className="rounded border border-neutral-400 px-3 py-1.5 text-sm disabled:opacity-50"
        disabled={busy !== null}
        onClick={() => post("/api/demo/reset", "Reset sandbox")}
        data-testid="reset-sandbox"
      >
        Reset sandbox
      </button>
      <button
        className="seam-button"
        disabled={busy !== null}
        onClick={() => post("/api/demo/revise-truth", "Inject sandbox truth revision")}
        data-testid="inject-revision"
      >
        Inject truth revision
      </button>
      <button
        className="seam-button"
        disabled={busy !== null}
        onClick={() => post("/api/demo/assess-materiality", "Assess materiality")}
        data-testid="assess-materiality"
      >
        Assess materiality
      </button>
      <button
        className="seam-button"
        disabled={busy !== null}
        onClick={() => post("/api/demo/recovery-plan", "Plan recovery")}
        data-testid="plan-recovery"
      >
        Plan recovery
      </button>
      <button
        className="seam-button"
        disabled={busy !== null}
        onClick={() => post("/api/demo/execute-recovery", "Execute sandbox recovery")}
        data-testid="execute-recovery"
      >
        Execute sandbox recovery
      </button>
      <button
        className="seam-button"
        disabled={busy !== null}
        onClick={() => post("/api/demo/verify-recovery", "Verify independently")}
        data-testid="verify-recovery"
      >
        Verify independently
      </button>
      <button
        className="seam-button"
        disabled={busy !== null}
        onClick={() => post("/api/demo/recall-memory", "Recall verified pattern")}
        data-testid="recall-memory"
      >
        Recall verified pattern
      </button>
      {busy ? <span className="text-sm text-neutral-500">{busy}…</span> : null}
      {message ? (
        <span className="text-sm text-neutral-700" data-testid="control-message">
          {message}
        </span>
      ) : null}
    </div>
  );
}
