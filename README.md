# Brindle

**The Recovery Plane for AI Agents.**

AI agents know how to act. Brindle gives them a way to recover when a previously valid decision
becomes wrong because the underlying truth changes.

> Status: **M1 — Successful Agent World** (code complete; live sponsor acceptance pending).
> A sandbox procurement world (PO-827 plus an unrelated control PO-901) runs end to end with
> deterministic authorization and Decision Receipts. Recovery is not built yet. See
> [docs/MILESTONES.md](docs/MILESTONES.md), [docs/M1_SUCCESSFUL_WORLD.md](docs/M1_SUCCESSFUL_WORLD.md) and
> [docs/M1_SPONSOR_INTEGRATION.md](docs/M1_SPONSOR_INTEGRATION.md).

## The differentiating case

A workflow succeeds. Later, authoritative truth changes **retroactively** (a supplier certificate
turns out to have been expired all along). Brindle discovers which successful real-world
consequences became invalid, and safely reconciles **only what needs changing** — leaving
decisions that would have come out the same untouched, and being honest about effects that cannot
be undone.

```
retroactive truth revision
  → consequence graph
  → counterfactual materiality   (SAME / CHANGED / UNCERTAIN)
  → real-world effect classification   (REVERSIBLE / COMPENSABLE / IRREVERSIBLE)
  → Minimal Recovery Set
  → bounded compensation / remediation   (registered RecoveryCapabilities only)
  → independent invariant verification
  → Recovery Receipt
```

## What Brindle is NOT

- **Not generic observability.** It does not trace or dashboard agent runs.
- **Not generic rollback.** Irreversible effects are never "rolled back"; they are remediated and reported honestly.
- **Not a generic agent framework.** It does not build or orchestrate agents.
- **Not a data quality platform.** It reacts to a truth revision; it does not detect bad data.
- **Not a security scanner.**
- **Not a generic workflow builder.**

## Safety boundaries (non-negotiable)

LLM reasoning never owns the safety boundary. Graph traversal, effect classification, authority,
idempotency and invariant closure are **deterministic code**. Zetaris is read-only truth, never an
executor. Business mutations happen only through registered `RecoveryCapability`s. Incident closure
requires fresh independent verification, never an executor's success response.
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [ADR 0001](docs/adr/0001-truth-reasoning-recovery-separation.md).

## Stack

Next.js · TypeScript · React · Tailwind CSS · PostgreSQL · Drizzle ORM · Zod · Vitest · Playwright · GitHub Actions.
Later: Vercel (hosting), Zetaris (truth plane), NVIDIA Nemotron (reasoning), Meterless (runtime + recovery memory).

## Getting started

Requires Node.js ≥ 22.12.

```bash
npm ci
cp .env.example .env.local   # optional: local mode needs no credentials
npm run dev                  # http://localhost:3000, health at /api/health, demo at /demo
npm run demo:m1              # run the M1 world in MOCK mode (no credentials)
```

| Command                                   | Purpose                                                     |
| ----------------------------------------- | ----------------------------------------------------------- |
| `npm run format:check` / `npm run format` | Prettier                                                    |
| `npm run lint`                            | ESLint (includes module-boundary rules)                     |
| `npm run typecheck`                       | `tsc --noEmit`                                              |
| `npm test`                                | Vitest unit tests, incl. migration applied to in-process PG |
| `npm run build`                           | Production build                                            |
| `npm run test:e2e`                        | Playwright smoke test (builds and serves the app)           |
| `npm run db:generate` / `db:check`        | Generate / validate Drizzle migrations (offline)            |
| `npm run db:migrate`                      | Apply migrations to `DATABASE_URL`                          |

### Configuration

`BRINDLE_RUNTIME_MODE=local` (default) runs without any sponsor credentials; sponsor adapters
exist as interfaces and fail loudly if called. `live` requires `DATABASE_URL` and all sponsor
variables and refuses to start otherwise, naming what is missing. `/api/health` reports which
integrations are configured, never their values. See [.env.example](.env.example).

## Repository layout

```
src/app/            Next.js shell (home page, /api/health)
src/brindle/        Deterministic domain core (no I/O, no sponsor or DB imports)
  truth/ receipts/ graph/ counterfactual/ recovery/ verification/ memory/
src/integrations/   Sponsor boundary interfaces: zetaris/ meterless/ nemotron/
src/db/             Drizzle schema + lazy client      drizzle/  generated migrations
src/config/         Typed environment handling
src/demo/           M1 sandbox world: orchestrator, store, MOCK doubles, seed (no live code paths to mocks)
scripts/            demo + live probe commands (never run in CI)
data/zetaris-seed/  CSVs to provision Zetaris
```
