# M1 — Successful Agent World

M1 builds the world **before anything goes wrong**, so a later incident is credible:

```
authoritative truth (Zetaris) -> normalized TruthAssertions -> structured reasoning (Nemotron)
 -> deterministic authorization gate -> SANDBOX mutation -> DecisionReceipt -> next actor
```

## The locked story

Atlas Components (`SUP-ATLAS`) is an approved, enabled supplier with a VALID ISO-9001 certification. **Procurement** selects Atlas and creates **PO-827**; **Finance** approves it; **Operations** schedules receiving, and a **supplier notification** is recorded. Everything succeeds. **PO-901** (supplier Borealis Fasteners, `SUP-BOREAL`) runs through the same pipeline as an _unrelated control_: no shared supplier, truth assertion, decision, receipt or sandbox row with PO-827 (it shares only the global procurement policy).

Exactly three actors: Procurement, Finance, Operations. Six decision receipts in total (three per PO).

## SANDBOX BUSINESS SYSTEM

`purchase_orders`, `finance_approvals`, `receiving_allocations`, `supplier_notifications` and `demo_runs` are Brindle's own PostgreSQL tables (migration `0001_sandbox_business`). No money moves, no purchase order is transmitted, **no email is sent**: a supplier notification is a row whose `channel` is constrained by the database to `SANDBOX_RECORD`. The UI and docs label this everywhere.

## Authority boundary

The model **advises**; deterministic code **decides**.

| Actor       | Allowed proposals                       | Gate (`src/brindle/business/authorization.ts`)                                                                                                                              |
| ----------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Procurement | `SELECT_SUPPLIER` / `DECLINE_SUPPLIER`  | supplier exists, enabled, APPROVED; required certification present, status VALID and covering the decision time; PO not already existing; currency and amount within policy |
| Finance     | `APPROVE_PO` / `REJECT_PO`              | PO exists and is `CREATED`, not already approved; amount/currency within policy; supplier still eligible _in the persisted truth context the PO was created under_          |
| Operations  | `SCHEDULE_RECEIVING` / `HOLD_RECEIVING` | PO exists, finance approval exists, PO is `APPROVED`, no allocation yet                                                                                                     |

Model output must (1) parse as JSON, (2) satisfy a strict Zod schema with a closed decision vocabulary and no extra fields (so no arbitrary action names, tools or hidden reasoning), (3) cite only evidence ids it was shown, (4) target the expected entity, and then (5) pass the gate. Any failure produces a `BLOCKED` run and **no business effect**. Dock and arrival date are chosen by deterministic rule, not by the model. Executors write the receipt and the business effect in one transaction, so an effect can never exist without its DecisionReceipt.

## Truth and receipts

Zetaris rows are normalized into M0 `TruthAssertion`s and persisted as immutable versions in `truth_assertions` (unchanged facts reuse their version; a changed fact becomes the next version; **no TruthRevision is created**, that is M2). Each DecisionReceipt's `truthRefs` are real `(assertionId, version)` references to those rows; `sourceId` is `zetaris` for LIVE and `MOCK:zetaris-fixture` for MOCK. Receipts record policy version, served model id, prompt/schema versions, chosen action, target, the model's structured justification, typed evidence (truth versions, policy, sandbox documents), trace id and timestamp. `memoryRefs` is `[]` (no memory was used).

## Mock vs live

|                | MOCK (`BRINDLE_RUNTIME_MODE=local`, default)                                                  | LIVE (`BRINDLE_RUNTIME_MODE=live`)          |
| -------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Truth          | `MockFixtureTruthRowSource` serving `src/demo/seed-data.ts`; source id `MOCK:zetaris-fixture` | Real Zetaris SQL API; source id `zetaris`   |
| Reasoning      | `MockDeterministicReasoner`, model id `MOCK:deterministic-reasoner`                           | Real Nemotron over NVIDIA or Meterless      |
| Database       | `DATABASE_URL` if set, else in-process PostgreSQL (PGlite)                                    | `DATABASE_URL` required                     |
| Missing config | n/a                                                                                           | **Fails loudly. Never falls back to mock.** |

Mode comes only from `BRINDLE_RUNTIME_MODE`, never inferred from credentials. It is recorded on each `demo_runs` row and shown in the `/demo` banner (`PROVIDER MODE: LIVE` or `MOCK — no sponsor was contacted`). CI is MOCK-only and needs no secrets.

## Running it

```bash
npm run demo:m1        # reset sandbox, run the world (mode per BRINDLE_RUNTIME_MODE)
npm run demo:reset     # clear Brindle's sandbox tables only (cannot touch Zetaris)
npm run dev            # then open /demo
```

API (fixed actions only, no body, no arbitrary action names): `GET /api/demo/state`, `POST /api/demo/reset`, `POST /api/demo/run-success`. Re-running after success returns `ALREADY_COMPLETE` and performs no model or truth calls; partially populated state returns `409` until reset.

## Known limitations

- **LIVE acceptance not yet achieved** (no sponsor access in the implementing session); see `docs/M1_SPONSOR_INTEGRATION.md`.
- The demo API has no authentication; do not expose a LIVE deployment publicly (reset and run are unauthenticated by design in M1).
- The procurement request supplies the candidate supplier; there is no supplier search or comparison.
- One truth read per supplier per run; Zetaris multi-page results and `knownAsOf` history are unsupported until M2.
- A run blocked mid-way (e.g. at Finance) leaves earlier committed steps in place and requires an explicit reset.
- The mock database for local mode is in-process and lost on restart.
- Out of scope and deliberately absent: consequence-graph construction, truth-revision handling, counterfactuals, recovery.
