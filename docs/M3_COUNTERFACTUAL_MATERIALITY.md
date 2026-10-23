# M3 — Counterfactual Materiality

M2 is GUIDE PASS at `cfc2e4b2535ce599c22672f98089ac65826c09c1`.
M3 is not GUIDE accepted. M1 LIVE remains deferred and mandatory before submission.

## Question and reconstruction

If the corrected fact had been known at the original decision time, with all unrelated inputs
held fixed, would the authorized chosen action have differed?

The service loads the immutable original receipt and its exact truth versions, policy version,
memory references, prompt/schema/model metadata and the revision's replacement version. Only the
specific previous assertion/version is substituted. Today's truth, policy and business tables are
never used for replay. Missing truth, historical memory payload, document evidence or a supported
mechanism yields UNCERTAIN. A missing receipt prevents persistence rather than fabricating a FK.

M1-v1 did not store separate input snapshots. Its supported successful receipts do retain the
request parameters, creation objective (whose versioned serialization includes description),
original supplier-name truth, creation/approval actions and explicit document dependencies.
These reconstruct the original request, CREATED PO at finance and APPROVED PO/approval at
operations. Successful atomic gated execution establishes the original absence preconditions.
The rule is limited to the exact M1-v1 actor/prompt/schema/action contracts; unknown versions are
UNCERTAIN. It does not reverse-engineer historical business state from today's mutable rows.

## Replay and authority

All three M1 actor proposals used the existing NemotronReasoner boundary, including MOCK protocol
doubles. M3 reuses the exact actor instructions, proposal schemas, evidence builder and proposal
validation. The original decision timestamp explicitly anchors the meaning of "today". Original
model metadata remains in reconstruction; the serving replay model ID is separately persisted.
No sponsor commissioning occurs. Competition LIVE remains Nightshift → NVIDIA Nemotron.

The M1 deterministic authorization functions run after the proposal. They do not call a model.
The dock/arrival rule is replayed deterministically. The effective action of a denied proposal is
a closed DECLINE/REJECT/HOLD action, not a business mutation. A model cannot choose the final
SAME/CHANGED classification: canonical structured action comparison does. Object key order is
ignored; array order and values are preserved. Explicit uncertainty, malformed/unavailable output,
unknown evidence citations or missing reconstruction remains UNCERTAIN.

## Immutable persistence

An assessment identity is revision + decision + replay version. The revision row lock serializes
assessment writes. The persisted evidence envelope includes original context, corrected fact,
metadata and a canonical input fingerprint. Identical retries return the existing assessment with
no second model call; conflicting input evidence fails. No immutable assessment is overwritten.
The existing reconstruction JSONB supports the evidence envelope; the domain assessment contract
remains unchanged. No migration is needed.

## Consequences and preservation

Materiality is evaluated only at decisions. The persisted consequence graph associates descendant
candidate actions/business objects with all relevant decision parents, respecting stored causal
and prerequisite edge directions. Reachability uses a visited set; shared/diamond targets are
not duplicated. UNCERTAIN dominates and blocks autonomous treatment. Otherwise any CHANGED
parent requires M4 analysis; all-SAME parents imply PRESERVE. Unassessed work blocks completion.

A SAME operations decision means it still schedules receiving with its _original approved PO_
held fixed. It does not assert that the PO's upstream creation remains justified. The same receiving
consequence can have an independently CHANGED procurement/finance ancestor. This distinction is
visible rather than manufacturing a fake materiality verdict.

## Demo and scope

After the M2 injection, Assess materiality examines three Atlas decisions. With the MOCK protocol
double, procurement and finance are CHANGED by the original deterministic eligibility gates;
operations is genuinely SAME under its frozen approved-PO evidence. All ten PO-901 control nodes
stay outside the work. The interface shows original/counterfactual action labels, uncertainty,
receipt/trace/fingerprint provenance and the first three stages of the Recovery Proof Strip.
No effects, incidents, recovery steps or Recovery Receipts are written by M3.

Tests cover substitution, temporal leakage, policy preservation, canonical comparison, real SAME,
explicit/malformed/missing-evidence UNCERTAIN, pure deterministic gates, existing model boundary,
control preservation, immutable retries/conflicts and multiple-parent blocking. Full gates and
exact published HEAD CI are required before overnight self-progression. Self-progression is not
GUIDE acceptance.

The existing secret-free probe test now loads the same scripts via `node --import tsx`,
which avoids the tsx CLI Unix-socket requirement in restricted execution environments.
All refusal assertions and the credential-stripped environment remain unchanged.
