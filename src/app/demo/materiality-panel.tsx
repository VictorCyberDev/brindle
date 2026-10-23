import type { readMateriality } from "../../services/materiality";
function actionLabel(action: { actionType: string; parameters: unknown }) {
  return action.actionType.replaceAll("_", " ");
}
export function MaterialityPanel({
  data,
}: {
  data: Awaited<ReturnType<typeof readMateriality>> | null;
}) {
  return (
    <section className="temporal-room" aria-labelledby="materiality-title">
      <p className="eyebrow">03 / COUNTERFACTUAL MATERIALITY</p>
      <h2 id="materiality-title">What would actually have differed?</h2>
      <p>
        Brindle does not undo everything touched by the incident. It determines which decisions
        would actually have differed.
      </p>
      <p className="proof-strip">
        TRUTH CHANGED → IMPACT TRACED
        {data?.complete ? " → MATERIALITY ASSESSED" : " → MATERIALITY PENDING"}
      </p>
      {!data?.examined ? (
        <p>Assess the traced candidate decisions using their original evidence.</p>
      ) : (
        <>
          <p data-testid="materiality-counts">
            {data.examined} examined ·{" "}
            {data.assessments.filter((a) => a.assessment.result === "SAME").length} SAME / PRESERVE
            · {data.assessments.filter((a) => a.assessment.result === "CHANGED").length} CHANGED ·{" "}
            {data.assessments.filter((a) => a.assessment.result === "UNCERTAIN").length} UNCERTAIN
          </p>
          <ol>
            {data.assessments.map((v) => (
              <li
                className={v.assessment.result === "SAME" ? "control-path" : "candidate-path"}
                key={v.assessment.assessmentId}
              >
                <h3>
                  {v.assessment.result}
                  {v.assessment.result === "SAME" ? " / PRESERVE" : ""}
                </h3>
                <p>
                  <code>{v.assessment.decisionId}</code>
                </p>
                <p>Original: {actionLabel(v.originalAction)}</p>
                <p>
                  Corrected fact: {v.correctedFact?.factKey ?? "historical evidence unavailable"}
                  {v.correctedFact ? ` v${v.correctedFact.version}` : ""}
                </p>
                {v.assessment.result === "CHANGED" ? (
                  <p>Counterfactual: {actionLabel(v.assessment.counterfactualAction)}</p>
                ) : null}
                {v.assessment.result === "UNCERTAIN" ? (
                  <p>Autonomous recovery blocked: {v.assessment.uncertaintyReason}</p>
                ) : null}
                <details>
                  <summary>Assessment provenance</summary>
                  <p>
                    Receipt: <code>{v.assessment.decisionId}</code>
                  </p>
                  <p>
                    Assessment: <code>{v.assessment.assessmentId}</code>
                  </p>
                  <p>
                    Trace: <code>{v.assessment.traceId}</code>
                  </p>
                  <p>
                    Assessed: <code>{v.assessment.assessedAt}</code>
                  </p>
                  <p>Policy: {v.context?.receipt.policyVersion ?? "unavailable"}</p>
                  <p>Original decision time: {v.context?.receipt.decidedAt ?? "unavailable"}</p>
                  <p>
                    Evidence fingerprint: <code>{v.evidenceHash}</code>
                  </p>
                </details>
              </li>
            ))}
          </ol>
          <div className="control-path">
            <strong>PO-901 / UNRELATED / PRESERVED</strong>
            <p>
              Outside Atlas materiality work. Its receipts and business records remain untouched.
            </p>
          </div>
          <p>
            Preserved decisions keep their own frozen-input outcome. A consequence with a separate
            CHANGED upstream parent remains eligible for recovery analysis.
          </p>
          <ul>
            {data.consequences
              .filter((c) => c.kind === "BUSINESS_OBJECT")
              .map((c) => (
                <li key={c.id}>
                  {c.label} · {c.treatment.replaceAll("_", " ")}
                </li>
              ))}
          </ul>
        </>
      )}
    </section>
  );
}
