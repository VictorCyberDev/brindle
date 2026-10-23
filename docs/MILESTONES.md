# Milestones

**M0** is complete and merged. **M1** is code complete on `m1-successful-agent-world` (draft PR #2; LIVE sponsor acceptance pending). **M2** is implemented on its stacked branch; code/test/CI verification and GUIDE acceptance are required before PASS. **M3-M6** remain documented scope.

| Milestone | Name                       | Scope                                                                                                                                                                                                                                                                                                                                    |
| --------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0**    | Foundation                 | Repo, domain contracts, PostgreSQL/Drizzle schema + migration, config, sponsor boundaries, health endpoint, tests, CI, docs.                                                                                                                                                                                                             |
| **M1**    | Successful Agent World     | Zetaris truth reads (hackathon `/sql-editor/sqls/run`), Nemotron procurement reasoning via the Meterless Nightshift runtime, Decision Receipts, reproducible sandbox PO flow. **Code complete; LIVE sponsor acceptance deferred and mandatory before submission. Does not satisfy the Meterless Engine requirement (that is M5 H-MEM).** |
| M2        | Temporal Consequence Graph | Bitemporal truth, revision ingestion, persisted graph construction and deterministic temporal CANDIDATE blast radius. Verification / GUIDE acceptance pending; not complete.                                                                                                                                                             |
| M3        | Counterfactual Materiality | SAME / CHANGED / UNCERTAIN evaluation; proof that unaffected decisions are preserved.                                                                                                                                                                                                                                                    |
| M4        | Recovery Plane             | Capability registry, Minimal Recovery Set, idempotent compensation, irreversible-effect remediation.                                                                                                                                                                                                                                     |
| M5        | Verification & Proof       | Independent invariant verification, recovery loop, Recovery Receipt, and **H-MEM Recovery Memory — HACKATHON ELIGIBILITY CRITICAL** (actual working Meterless Engine integration; see below).                                                                                                                                            |
| M6        | Win Gate                   | Eight-scenario evaluation suite, UX, ablation, docs, demo, submission package.                                                                                                                                                                                                                                                           |

Track: Reasoning Architecture. Vertical: Procurement + supplier compliance.

## Locked: H-MEM Recovery Memory (M5) is hackathon eligibility critical

The official Participant Setup Guide requires **at least one actual Meterless Engine in a working product feature**. Provider integration alone (Meterless Nightshift as the model runtime) does **not** satisfy this, and **M1 does not satisfy it**.

M5 must therefore deliver **H-MEM Recovery Memory** with all of:

- an **actual working integration** with the Meterless Engine (not an interface or a stub);
- **user-visible, useful product behaviour** (recovery memory that visibly informs recovery);
- a **reproducible demo**;
- **conformance / evaluation / test evidence**.

Until then, nothing in M1-M4 may be described as meeting the Meterless Engine requirement.

## Canonical sponsor stack

| Layer                | Role                                                              |
| -------------------- | ----------------------------------------------------------------- |
| Zetaris              | Hackathon local Docker truth plane (read-only)                    |
| Meterless Nightshift | Primary competition AI runtime                                    |
| NVIDIA               | Provider configured inside Nightshift (direct API secondary only) |
| Nemotron             | Required reasoning model behind the accepted LIVE demo            |
| H-MEM                | Mandatory M5 Meterless Engine integration                         |
