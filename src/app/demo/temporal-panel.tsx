import type { readTemporalDemo } from "../../demo/temporal";

function belief(value: unknown): string {
  if (value && typeof value === "object" && "status" in value) return String(value.status);
  return "unavailable";
}

type Data = Awaited<ReturnType<typeof readTemporalDemo>>;
export function TemporalPanel({ data }: { data: Data }) {
  return (
    <section className="temporal-room" aria-labelledby="temporal-title">
      <p className="eyebrow">02 / TEMPORAL CONSEQUENCE GRAPH</p>
      <h2 id="temporal-title">A changed truth. A bounded trace.</h2>
      <p>Recover only what became wrong. Preserve everything else.</p>
      <p className="candidate-notice">
        M2 identifies candidates for review. Materiality has not been evaluated. No recovery has
        run.
      </p>
      {!data ? (
        <p>Run the successful world, then inject the sandbox Atlas revision.</p>
      ) : (
        <>
          <article className="revision-seam">
            <h3>
              Truth revision{" "}
              <span className="badge">
                {data.revision.retroactive ? "RETROACTIVE" : "FUTURE-ONLY"}
              </span>
            </h3>
            <p className="beliefs">
              {belief(data.truth[0]?.value)} <span aria-hidden="true"> → </span>{" "}
              {belief(data.truth[1]?.value)}
            </p>
            <p>Atlas Components / ISO-9001 certification · sandbox correction</p>
            <dl className="evidence-list">
              <dt>Effective time / world</dt>
              <dd>{data.revision.effectiveFrom}</dd>
              <dt>Effective until (exclusive)</dt>
              <dd>{data.revision.effectiveTo ?? "open"}</dd>
              <dt>Observed time / knowledge</dt>
              <dd>{data.revision.observedAt}</dd>
              <dt>Revision ID</dt>
              <dd>{data.revision.id}</dd>
              {data.truth.map((a, i) => (
                <div className="truth-ref" key={a.truthVersionId}>
                  <dt>{i === 0 ? "Superseded truth" : "Replacement truth"}</dt>
                  <dd>
                    {a.truthVersionId}
                    <br />
                    Recorded by: {a.provenance.recordedBy}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
          <h3>Consequence map</h3>
          <p>
            Read from persisted receipts and executor records. Arrows below follow discovery
            direction; DEPENDS_ON and DERIVED_FROM are reversed from their stored dependency
            direction.
          </p>
          <ol className="consequence-map" data-testid="consequence-map">
            {data.candidates.map((c) => (
              <li key={c.id} className="candidate-path">
                <span className="badge">CANDIDATE / {c.kind}</span>
                <strong>{c.label}</strong>
                <code>{c.ref_id}</code>
                <details>
                  <summary>Path evidence · {c.depth} hops</summary>
                  <p>
                    Trace:{" "}
                    <code>
                      {String(
                        (
                          data.nodes.find((n) => n.id === c.id)?.attributes as
                            { traceId?: string } | undefined
                        )?.traceId ?? "see decision in path",
                      )}
                    </code>
                  </p>
                  <ol>
                    {c.path.map((id) => (
                      <li key={id}>
                        <code>{id}</code>
                      </li>
                    ))}
                  </ol>
                </details>
              </li>
            ))}
          </ol>
          <h3>
            Blast radius <span data-testid="candidate-count">{data.candidates.length}</span>
          </h3>
          <p>
            Candidate entities only. A candidate is structurally and temporally plausible, with no
            verdict about whether its outcome changes.
          </p>
          <div className="control-path" data-testid="temporal-control">
            <strong>PO-901 / CONTROL / UNRELATED</strong>
            <p>
              {data.control.outside
                ? "Outside Atlas candidate blast radius"
                : "Control evidence requires inspection"}
            </p>
            <details>
              <summary>Persisted control evidence ({data.control.refs.length} nodes)</summary>
              {data.control.refs.map((ref) => (
                <p key={ref}>
                  <code>{ref}</code>
                </p>
              ))}
            </details>
          </div>
          <details>
            <summary>
              Graph provenance · {data.nodes.length} nodes / {data.edges.length} edges
            </summary>
            <ul>
              {data.edges.map((e) => (
                <li key={e.id}>
                  <code>
                    {e.fromNodeId} — {e.type} → {e.toNodeId}
                  </code>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
