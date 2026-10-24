import type { readProof } from "../../services/verification";
import type { readRecoveryMemory } from "../../services/recovery-memory";
import type { readTemporalDemo } from "../../demo/temporal";
import type { readMateriality } from "../../services/materiality";
import type { readRecovery } from "../../services/recovery";
const invariantNames: Record<string, string> = {
  "prohibited-vendor-open-pos": "Prohibited vendor open POs",
  "invalid-po-finance-approvals": "Active approvals for invalid PO",
  "invalid-po-receiving-allocations": "Active allocations for invalid PO",
  "irreversible-consequences-handled": "Irreversible consequences handled",
  "unrelated-control-preserved": "PO-901 preserved unchanged",
  "no-duplicate-compensation": "No duplicate compensation",
};
export function ProofPanel({
  proof,
  memory,
  temporal,
  materiality,
  recovery,
}: {
  proof: Awaited<ReturnType<typeof readProof>> | null;
  memory: Awaited<ReturnType<typeof readRecoveryMemory>> | null;
  temporal: Awaited<ReturnType<typeof readTemporalDemo>>;
  materiality: Awaited<ReturnType<typeof readMateriality>> | null;
  recovery: Awaited<ReturnType<typeof readRecovery>>;
}) {
  const proven =
    proof?.receipt?.verdict === "RECOVERED" &&
    proof.recovery?.incident.status === "RECOVERED" &&
    proof.recovery.incident.closure?.recoveryReceiptId === proof.receipt.receiptId;
  const stages = [
    { name: "TRUTH CHANGED", done: Boolean(temporal) },
    { name: "IMPACT TRACED", done: Boolean(temporal?.candidates.length) },
    { name: "MATERIALITY ASSESSED", done: Boolean(materiality?.complete) },
    {
      name: "RECOVERY EXECUTED",
      done: Boolean(
        recovery &&
        ["VERIFYING", "RECOVERED"].includes(recovery.incident.status) &&
        recovery.steps.every((s) => s.status === "SUCCEEDED"),
      ),
    },
    { name: "RECOVERY VERIFIED", done: Boolean(proven) },
  ];
  return (
    <section className="proof-room" aria-labelledby="proof-title">
      <p className="eyebrow">RECOVER ONLY WHAT BECAME WRONG. PRESERVE EVERYTHING ELSE.</p>
      <ol className="proof-strip" data-testid="proof-strip">
        {stages.map((s, i) => (
          <li key={s.name} data-done={s.done}>
            <span aria-hidden="true">{s.done ? "✓" : "○"}</span> {i + 1}. {s.name}
            <span className="sr-only">{s.done ? " complete" : " pending"}</span>
          </li>
        ))}
      </ol>
      <h2 id="proof-title">
        {proven
          ? "RECOVERY PROVEN"
          : proof?.receipt
            ? "RECOVERY REQUIRES ATTENTION"
            : "A changed fact. A controlled response."}
      </h2>
      {!temporal ? (
        <p>
          Start with a successful procurement world, then inject the later Atlas certification
          correction.
        </p>
      ) : (
        <p>
          Atlas certification changed retroactively. PO-827 is traced; PO-901 remains the unrelated
          control.
        </p>
      )}
      {!proof?.metrics ? (
        <div className="proof-metrics">
          <p>
            <strong>{temporal?.candidates.length ?? 0}</strong> consequence candidates
          </p>
          <p>
            <strong>
              {materiality?.assessments.filter((a) => a.assessment.result === "CHANGED").length ??
                0}
            </strong>{" "}
            changed decisions
          </p>
          <p>
            <strong>
              {materiality?.assessments.filter((a) => a.assessment.result === "SAME").length ?? 0}
            </strong>{" "}
            SAME / preserve
          </p>
          <p>
            <strong>{recovery?.steps.length ?? 0}</strong> bounded recovery steps
          </p>
        </div>
      ) : (
        <div className="proof-metrics" data-testid="proof-metrics">
          <p>
            <strong>{proof.metrics.consequencesExamined}</strong> consequences examined
          </p>
          <p>
            <strong>{proof.metrics.materiallyAffected}</strong> effects requiring recovery
          </p>
          <p>
            <strong>{proof.metrics.preservedDecisions}</strong> preserved decisions, including
            control
          </p>
          <p>
            <strong>{proof.metrics.automaticallyRecovered}</strong> automatically recovered
          </p>
          <p>
            <strong>{proof.metrics.safelyRemediated}</strong> safely remediated
          </p>
          <p>
            <strong>{proof.metrics.residualViolations}</strong> residual invariant violations
          </p>
          <p>
            <strong>{proof.metrics.duplicateCompensations}</strong> duplicate compensations
          </p>
        </div>
      )}
      {proven ? (
        <p className="preservation-callout">
          PRESERVED / PO-901 and its receipts are unchanged. The original notification remains
          historical fact; its corrective compliance case is OPEN.
        </p>
      ) : (
        <p className="candidate-notice">
          Executor success is not proof. Independent reads and every required invariant must pass
          before closure.
        </p>
      )}
      {proof?.receipt ? (
        <details className="proof-evidence">
          <summary>Independent invariant evidence and Recovery Receipt</summary>
          <p>Verdict: {proof.receipt.verdict}</p>
          <p>
            <a className="receipt-link" href="/api/demo/recovery-receipt">
              Download machine-checkable Recovery Receipt
            </a>
          </p>
          <p>
            Receipt: <code>{proof.receipt.receiptId}</code>
          </p>
          <p>
            Issued: <code>{proof.receipt.issuedAt}</code>
          </p>
          <p>
            Trace: <code>{proof.receipt.traceId}</code>
          </p>
          <ul>
            {proof.receipt.invariantResults.map((r) => (
              <li key={r.resultId}>
                <strong>{r.status}</strong> · {invariantNames[r.invariantId] ?? r.invariantId}
                <br />
                <code>{r.resultId}</code>
                <p>
                  Fresh source: {r.observation.source} · {r.observation.observedAt}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <section className="memory-room" aria-labelledby="memory-title">
        <h3 id="memory-title">H-MEM Recovery Memory</h3>
        <p>
          Actual local Meterless H-MEM spec engine. Advisory only; memory cannot create authority,
          execute recovery, or close an incident.
        </p>
        <p data-testid="memory-records">
          {memory?.recordCount ?? 0} verified recovery patterns · {memory?.ledgerCount ?? 0}{" "}
          trust-ledger records
        </p>
        {memory?.lastAdvisory ? (
          <>
            <p data-testid="memory-match-count">
              {memory.lastAdvisory.matches.length} relevant verified matches
            </p>
            <p>
              {memory.lastAdvisory.query.excludeIncidentId
                ? "Prior-experience lookup before planning; the current incident was excluded. No match means the registry plan proceeds without a prior pattern."
                : "Advisory lookup for a future certification-revocation recovery. This does not imply that the current plan used memory created after its execution."}
            </p>
            {memory.lastAdvisory.matches.map((m) => (
              <article className="control-path" key={m.memoryId}>
                <strong>Verified recovery found</strong>
                <p>
                  Incident: <code>{m.experience.incidentId}</code>
                </p>
                <p>
                  Receipt: <code>{m.experience.receiptId}</code>
                </p>
                <p>
                  Engine relevance: {m.relevance.toFixed(4)} · {m.experience.verification.length}{" "}
                  passing invariant results
                </p>
                <p>
                  Successful registered pattern: {m.experience.successfulCapabilities.join(" · ")}
                </p>
                <p>{m.experience.irreversiblePattern}</p>
                {m.warnings.map((w) => (
                  <p className="candidate-notice" key={w}>
                    {w}
                  </p>
                ))}
              </article>
            ))}
          </>
        ) : null}
      </section>
      <p className="sponsor-boundary">
        Sandbox proof is separate from sponsor LIVE acceptance. Real Zetaris and Nightshift →
        Nemotron acceptance remains deferred and mandatory before submission.
      </p>
    </section>
  );
}
