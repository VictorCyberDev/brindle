import type { readRecovery } from "../../services/recovery";
export function RecoveryPanel({ data }: { data: Awaited<ReturnType<typeof readRecovery>> }) {
  return (
    <section className="temporal-room" aria-labelledby="recovery-title">
      <p className="eyebrow">04 / BOUNDED RECOVERY PLANE</p>
      <h2 id="recovery-title">Change the minimum. Preserve the rest.</h2>
      <p>
        The smallest recovery set after Brindle has removed consequences proven counterfactually
        unaffected.
      </p>
      {!data ? (
        <p>Complete materiality assessment, then plan bounded sandbox recovery.</p>
      ) : (
        <>
          <p>
            Incident: <code>{data.incident.incidentId}</code>
          </p>
          <p data-testid="recovery-state">{data.incident.status}</p>
          <p data-testid="recovery-step-count">{data.steps.length} bounded steps</p>
          {data.plan?.reason ? (
            <p className="candidate-notice">
              Escalated: {data.plan.reason.replaceAll("_", " ")}. Autonomous mutation is blocked.
            </p>
          ) : null}
          <div className="control-path">
            <strong>PRESERVED / PO-901</strong>
            <p>
              The unrelated control is excluded from recovery capabilities. Its complete business
              and receipt baseline is retained for later verification.
            </p>
          </div>
          <ol>
            {data.steps.map((s) => {
              const e = data.effects.find((e) => e.effectId === s.effectId);
              return (
                <li className="candidate-path" key={s.stepId}>
                  <h3>{e?.description}</h3>
                  <p>
                    {s.effectClassification} → {s.mode} · {s.status}
                  </p>
                  <p>
                    Target: <code>{String(s.parameters.targetId)}</code>
                  </p>
                  <p>
                    {s.mode === "REMEDIATE"
                      ? "Corrective compliance escalation. Original notification remains historical fact; no external message is sent."
                      : "Automatic bounded sandbox recovery; preconditions and authority are rechecked."}
                  </p>
                  <details>
                    <summary>Step evidence</summary>
                    <p>
                      Capability: <code>{s.capabilityId}</code>
                    </p>
                    <p>
                      Rule: <code>{e?.ruleId}</code>
                    </p>
                    <p>
                      Step: <code>{s.stepId}</code>
                    </p>
                    <p>
                      Idempotency: <code>{s.idempotencyKey}</code>
                    </p>
                    <p>Executed: {s.executedAt ?? "not executed"}</p>
                    <p>
                      Persisted execution records:{" "}
                      {
                        data.evidence.filter(
                          (x) =>
                            x.stepId === s.stepId &&
                            (x.kind === "EXECUTION" || x.kind === "REMEDIATION"),
                        ).length
                      }
                    </p>
                    {data.evidence
                      .filter((x) => x.stepId === s.stepId && x.kind === "FAILURE")
                      .map((x) => (
                        <p key={x.id}>Failure: {String((x.payload as { code: string }).code)}</p>
                      ))}
                  </details>
                </li>
              );
            })}
          </ol>
          {data.incident.status === "VERIFYING" ? (
            <p className="candidate-notice">
              Recovery executed. Independent verification is still required. Executor success is not
              recovery proof.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
