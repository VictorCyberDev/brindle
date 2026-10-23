# M4 — Recovery Plane

M3 passed overnight self-progression at `739171de99dd57ecaad0f3a6a6eab892b93029c9`:
163 tests, 6 E2E, full exact-HEAD CI. This is not GUIDE acceptance. M4 is stacked on that exact
head. M1 LIVE remains deferred and mandatory. No sponsor commissioning occurs here.

## Rules and smallest justified set

Real candidate business records are associated with CHANGED decision ancestry through M3's
persisted graph. SAME-only descendants are excluded, UNCERTAIN/unassessed ancestry blocks
planning and escalates. Shared targets are deduplicated. The claim is precisely:

> The smallest recovery set after Brindle has removed consequences proven counterfactually unaffected.

This is not a claim of globally optimal combinatorial minimization. Four named deterministic
rules classify open purchase orders REVERSIBLE, finance approvals COMPENSABLE, receiving
allocations COMPENSABLE, and historical supplier notifications IRREVERSIBLE. Rules and action
node provenance are persisted in Effect records. No model classifies effects or creates authority.

The bounded registry contains exactly PO cancellation (REVERSE), finance revocation (COMPENSATE),
receiving cancellation (COMPENSATE), and corrective notification escalation (REMEDIATE). Every
capability specifies version, target type, required authority, max one object, and DERIVED_KEY_V1.
Strict parameters carry an exact before image, target, primary PO, assessment fingerprint and order.
The whole plan is bounded to four objects, exclusively in PO-827. No arbitrary SQL/HTTP/model tool
surface exists. Plan order is receiving → finance → PO → notification; PO cancellation requires
that active allocations and approvals have been removed. Unknown/unsupported effects fail safely.

## Authority, execution and retry

Sandbox endpoints accept no operation parameters or privileges from request bodies. The trusted
local sandbox operator holds the four explicit authorities. Service callers must provide authority;
planning and each new execution recheck capability, classification/mode, object bounds and exact
preconditions. Actor authority is recorded in durable execution evidence.

Each step's mutation, success evidence and status commit atomically in a transaction with incident
and step locks. A unique successful execution record prevents duplicate compensation even across
retries. The deterministic idempotency key is derived from incident/effect/capability. Completed
steps are not compensated twice. Failed attempts are separately recorded with bounded safe codes;
three failed attempts exhaust the retry budget and escalate on the next retry. There is no autonomous
retry loop. A changed precondition is not silently relaxed. Partial successes persist; failure keeps
the incident RECOVERY_INCOMPLETE, never silently VERIFYING. A transient failure can be retried
through the same guarded plan after the underlying condition is repaired.

Finance/receiving inverse operations remove the active rows; their complete before images and
execution records retain the historical evidence. PO cancellation retains the original PO record.
The original supplier notification is NEVER deleted or described as rolled back. REMEDIATE creates
a durable corrective escalation owned by COMPLIANCE, OPEN for human follow-through. No external
notification is sent. The original consequence remains a historical fact.

## Persistence extension justification

Migration `0002_recovery_evidence` adds only:

1. CANCELLED to the sandbox PO status vocabulary: existing statuses cannot honestly represent a
   cancelled PO, and deleting it would violate historical notification foreign keys.
2. `recovery_evidence`: append-only plan baseline, execution, failure and remediation records.
   Existing recovery_steps has planned parameters and status but no durable execution-output or
   corrective-case structure. A planned remediation is not evidence that a corrective case exists.
   Unique partial indexes allow one PLAN per incident and one successful execution/remediation per
   step. Foreign keys tie evidence to real incidents and steps.

No new database, dependency, workflow engine or broad schema redesign is introduced.

## Lifecycle and preservation

OPEN → ANALYZING → RECOVERY_PLANNED → RECOVERING → VERIFYING is the successful M4 path.
UNCERTAIN analysis escalates. Partial/failed recovery stays incomplete or escalated. M4 never
writes invariant results, closes RECOVERED or issues a Recovery Receipt. Executor success is not
proof: M5 owns fresh reads and invariant-backed closure.

The full PO-901 business and receipt snapshot is saved before execution and remains byte-for-byte
unchanged. A genuinely equivalent truth-revision fixture produces SAME-only consequences, zero
steps and zero business mutations. SAME operations' own frozen-input action is preserved in the
canonical scenario, while its effects still have independently CHANGED upstream parents.

## Demo and tests

After materiality, Plan recovery shows preserved state, four effect classifications/modes, explicit
preconditions and irreversible remediation. Execute sandbox recovery completes four steps and
stops at VERIFYING. PO-827 is CANCELLED, active approval/allocation are absent, notification remains
with a corrective escalation. UI does not claim RECOVERY PROVEN.

Database tests cover classifications/rules, closed registry, authority/bounds/mode/idempotency,
actual business inverses, durable notification, control preservation, genuine SAME-only preservation,
UNCERTAIN escalation, unavailable capability, changed precondition, transaction failure/partial
recovery/retry, retry bound, immutable M3 assessments, and absence of M5 closure/receipts.
All prior suites and complete exact-HEAD CI are required for self-progression; GUIDE remains pending.
