# ADR 0001 — Separate truth, reasoning and recovery; keep safety deterministic

- Status: Accepted (M0)

## Context

Brindle repairs real-world consequences after authoritative truth is revised retroactively. A
system that lets an LLM decide _what is affected_, _what is safe_ and _what to change_ can fail
silently and irreversibly. A system that lets the truth source also execute changes conflates
observation with mutation.

## Decision

1. **Truth is observed, never mutated, by Brindle.** Zetaris is a governed read-only truth plane.
   Its adapter exposes read operations only.
2. **Reasoning is advisory.** Nemotron may reason about materiality, planning and evaluation. It
   receives a structured request and returns output validated against a Zod schema. It has no tool
   or execution surface, and cannot invent mutations.
3. **Safety is deterministic code.** Graph traversal, effect classification, authority,
   idempotency and invariant closure never depend on a model.
4. **Mutation happens only via registered `RecoveryCapability`s** — bounded, authority-checked,
   idempotent — and the mode is dictated by the effect class (reversible → reverse, compensable →
   compensate, irreversible → remediate, never "rolled back").
5. **Closure requires fresh independent verification**, not an executor's success response.
6. **Counterfactual replay** reconstructs original context plus corrected fact, not the present world.

## Enforcement

- Types/schemas: strict Zod contracts; `FRESH_INDEPENDENT_READ` is the only observation kind.
- Database `CHECK`s mirror the key invariants (retroactivity, mode vs. classification, closure iff RECOVERED).
- ESLint import boundaries keep `src/brindle` free of db/config/integration/app imports.
- Tests assert adapter operation lists and reject tool-like parameters.

## Consequences

Model output cannot directly affect business state; a model failure degrades to `UNCERTAIN` or
escalation rather than a wrong mutation. Cost: more explicit contracts and a capability registry
before any recovery can run (M4).
