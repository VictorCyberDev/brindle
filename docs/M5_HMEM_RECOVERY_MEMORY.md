# M5 — Actual H-MEM Recovery Memory

## What the official documentation actually says

Pinned upstream: `Meterless/Meterless@1742dec56a66e58eef9dda2d2b865823758ca8cd`.

- [Official implementation guide](https://github.com/Meterless/Meterless/blob/1742dec56a66e58eef9dda2d2b865823758ca8cd/engines/hmem/AGENTS.md)
- [Official runnable reference](https://github.com/Meterless/Meterless/tree/1742dec56a66e58eef9dda2d2b865823758ca8cd/engines/hmem/reference)
- [Official conformance runner](https://github.com/Meterless/Meterless/blob/1742dec56a66e58eef9dda2d2b865823758ca8cd/engines/hmem/conformance/runner.ts)
- [Official engine integration examples](https://github.com/Meterless/Meterless/tree/1742dec56a66e58eef9dda2d2b865823758ca8cd/engines/hmem/examples)

H-MEM is a documentation-first local engine specification with an executable reference. The
repository explicitly describes it as an implementation spec, not a hosted runtime library/API.
No H-MEM REST endpoint, Nightshift-derived auth scheme, engine identifier or request envelope was
invented. No human token/setup is needed for this documented local implementation route.

Repository sponsor documentation was inspected first. The original Participant Setup Guide is
referenced there but not included as a source file. Official upstream guidance and runnable
contracts were retrieved directly. A local implementation/conformance result is not represented
as an organizer's independent eligibility ruling.

## Actual product feature

Only persisted RECOVERED incidents with a validated Recovery Receipt and all required PASS
invariants can become long-term recovery memory. The entry carries real trigger facts, affected
entity types, material/preserved decisions, successful capabilities, failed compensators and their
precondition fingerprints, irreversible-remediation pattern, proof IDs and final verdict.

The official engine performs add/query/enrichment/hybrid ranking and emits real trace scores.
PostgreSQL canonical state and append-only ordered trust ledger survive engine/database restart.
Duplicate promotion returns the existing record. Failed, unverified, executor-only and corrupted
closure evidence cannot be promoted as trusted success patterns.

Before planning, the sandbox queries prior verified experience and excludes the current incident.
A missing/unavailable advisory does not create authority or prevent the deterministic registry
planner. The first incident honestly has no prior pattern. After proof, Recall verified pattern
performs an actual engine lookup for a future similar recovery and shows the source receipt,
relevance, successful pattern and prior failure warnings when such evidence exists. The UI does
not pretend the current plan used memory that was created after it executed.

Relevance is not authority: retrieved records are rechecked against real proof and filtered by
trigger/status/entity scope. Reinjection includes only trusted relevant matches. A warning can
flag an actually failed capability and exact precondition fingerprint for inspection. It cannot
invent a capability, mutate state, bypass materiality/policy, override failed invariants or close
an incident. The model never gains recovery authority through memory.

## Reproduce the actual Engine gate

```bash
npm ci
npm run hmem:conformance
npm run hmem:probe
```

The official conformance runtime assertions and vectors are pinned and unchanged. The typed
launcher compiles the upstream runner fixture using the existing TypeScript dependency; it does
not change expectations or skip cases. Expected exit 0 and `13/13 checks passed`.

The probe invokes the actual engine against a file-backed PostgreSQL/PGlite database, stores a
real invariant-verified sandbox recovery, retrieves it, closes/reopens PostgreSQL, retrieves it
again, and rejects an irrelevant trigger. It fails nonzero for any missing proof/retrieval/restart
requirement. Truth and reasoning inputs are explicitly MOCK; the H-MEM engine is actual local code.

To record fresh secret-free probe evidence deliberately:

```bash
npm run hmem:probe -- --record
```

It writes `docs/evidence/M5_HMEM_ACTUAL_ENGINE_PROBE.json`. CI runs the probe without rewriting the
committed evidence file. This proves actual local Engine use; it is not an HTTP connectivity probe.

## Gate status boundaries

- Actual local H-MEM engine: exercised, with 13/13 conformance and PostgreSQL restart/retrieval evidence.
- Hosted H-MEM endpoint/authentication: not asserted or required by the documented local route.
- Production semantic embeddings: not asserted; the reference's lightweight deterministic hash embedder is retained.
- Real Zetaris and Nightshift → NVIDIA Nemotron: still deferred mandatory M1 LIVE acceptance.
- Overall hackathon eligibility/submission readiness: BLOCKED until those external M1 proofs exist and GUIDE reviews the exact milestone HEADs.

There is no H-MEM human-owned blocker for the exercised local engine path. Do not describe the
absence of Nightshift credentials as a reason this local engine could not run. Do not describe the
local engine's success as proof that Nightshift or Zetaris ran.
