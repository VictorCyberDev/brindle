# M5 — Verification and Recovery Proof

M4 passed overnight self-progression at `3ec841fd4061f7078f95829b3c79bf97848894c7`:
183 tests, 7 E2E, full exact-HEAD CI. GUIDE acceptance remains pending for M3–M5.
M1 LIVE sponsor acceptance is still deferred and mandatory before submission. M6 is not started.

## Independent boundary

Executor success is not proof. `fresh-verifier.ts` accepts a database boundary and incident ID;
it accepts no mutation response, cached state or caller-supplied observation. It queries the business
rows, control receipts, steps, ledger and assessments afresh. Verification runs in a serializable
transaction, locks the incident and shares business-row locks, and records database-clock source
observations with kind FRESH_INDEPENDENT_READ. Closure reads are separate from mutation execution.

The verifier checks registered source, observation freshness relative to the attempt and latest
execution, and verified-time ordering. A failed database read produces ERROR evidence in a new
transaction after rollback; its detail explicitly records a failed read attempt, never a successful
observation. Unsupported truth states fail closed. Future LIVE requires fresh Zetaris and business
adapter sources; current proof covers the sandbox only.

## Closed required invariants

| Invariant                                   | Fresh evidence                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| Prohibited vendor open POs = 0              | Actual supplier PO rows and corrected certification status                       |
| Invalid PO active finance approvals = 0     | Actual approval rows                                                             |
| Invalid PO active receiving allocations = 0 | Actual allocation rows                                                           |
| Unhandled irreversible consequences = 0     | Original notification unchanged plus a valid explicit corrective COMPLIANCE path |
| PO-901 remains unchanged                    | Complete business/receipt snapshot equals saved pre-execution control baseline   |
| No duplicate compensation                   | Actual execution ledger groups and complete, matching evidence for each step     |

IRREVERSIBLE is handled by an OPEN corrective case, not erased history or a claim that a real
supplier received a correction. Each invariant persists ID, PASS/FAIL/ERROR, verifier, source,
observed time, detail and verified time. Six passing invariants are necessary, not a substitute for
resolved effects, complete materiality and zero UNCERTAIN decisions.

## Receipt and closure

The Recovery Receipt is built from persisted assessments, effects, steps and invariant results.
The proof panel links to `/api/demo/recovery-receipt` for its machine-checkable JSON download.
Its references are revalidated against the database; the required invariant registry cannot be
shrunk by a caller. Missing, changed or mismatched references fail. Preserved decisions include
real SAME decisions and the unrelated control receipts. Effect outcome vocabulary stays honest:
REVERSED, COMPENSATED, REMEDIATED or UNRESOLVED.

RECOVERED is issued only after all required results PASS, no unresolved effects, no uncertainty,
and the incident is VERIFYING. Receipt insert and `closeIncident()` closure commit atomically.
There is no alternative service path to RECOVERED. Terminal proof is immutable and represents its
observed/issued instant, not a promise that future external state can never change.

FAIL/ERROR gives RECOVERY_INCOMPLETE; three failed verification attempts escalate. The operator
can explicitly repair a transient condition, retry the original guarded M4 execution, and request a
new fresh verification. No infinite autonomous loop or silent precondition relaxation exists.
Repeated terminal verification returns the original receipt without contradictory new results.

## Control Room

The top-level Recovery Proof Strip follows persisted stages: truth changed, impact traced,
materiality assessed, recovery executed, recovery verified. RECOVERY PROVEN requires a real
RECOVERED receipt and its matching incident closure. Metrics are computed from persisted evidence:
canonical sandbox has 10 consequence candidates examined, 4 affected effects, 4 preserved decisions
(including 3 control receipts), 3 automatic recoveries, 1 corrective remediation, 0 residual invariant
violations and 0 duplicate compensations. These are outcomes, not hardcoded UI numbers.

The original successful-world evidence remains inspectable, with focused truth/materiality/recovery
panels and a prominent preservation result. Provider MOCK and sponsor LIVE limitations remain visible.

## Actual H-MEM Engine gate

See `M5_HMEM_RECOVERY_MEMORY.md`. Official documentation describes a local implementation spec,
not an assumed hosted REST service. Brindle uses the pinned official runnable engine code with a
PostgreSQL persistence adapter and passes the unchanged 13-case upstream runtime conformance
runner. An actual-engine probe proves verified promotion, ranking/retrieval, irrelevant rejection,
trust ledger persistence, and retrieval after PostgreSQL database restart. This is not a memory
protocol double. It is also not real Zetaris or Nightshift/Nemotron proof.

## Persistence justification

M5 core reuses existing invariant_results/recovery_receipts/incidents and M4 evidence structures.
Migration `0003_hmem_postgres` is solely for H-MEM's required canonical state and append-only trust
ledger. There was no memory store in the existing schema. recovery_evidence is incident/step-bound
and cannot honestly represent cross-incident memory state and retrieval audit events. Two narrow
PostgreSQL tables preserve the canonical engine snapshot, pinned version and ordered ledger; no
second database, runtime framework, dependency or generic memory platform is added.

## Validation and limitations

Focused core tests cover executor-vs-proof separation, fresh FAIL/ERROR, unresolved/uncertain
blocking, control preservation, real receipt references, missing/wrong evidence, stale-source
rejection, idempotence, bounded retry/escalation, canonical closure and real metrics. Memory tests
use the actual local engine and cover trust eligibility, relevant/irrelevant retrieval, prior failure
warnings, immutable promotion and authority isolation. The unchanged official conformance suite
and actual-engine PostgreSQL restart probe run in CI alongside all existing gates.

The embedder is the documented reference's deterministic hash implementation; no neural semantic
quality or production scale is claimed. Actual local engine proof does not replace M1's mandatory
external sponsor LIVE acceptance. No merge, M6 work or overall submission eligibility is claimed.
