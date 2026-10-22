# M0 Acceptance Evidence

Checklist mapping each gate to where it is satisfied. Reviewers should re-run the commands; this
file does not claim a pass.

| Gate | Requirement                                  | Evidence / how to check                                                                                  |
| ---- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| A    | Reproducible project                         | `npm ci` from `package-lock.json`; Node ≥ 22.12                                                          |
| B    | `m0-foundation` isolated from `main`         | `git log main..HEAD`; `main` holds only the initial commit                                               |
| C    | Core contracts exist and validate            | `src/brindle/**` and their `*.test.ts`                                                                   |
| D    | Bitemporal truth                             | `truth/assertion.ts`, `truth/revision.ts`, DB `valid_*`/`observed_at`, `truth_revisions_retroactive_chk` |
| E    | PostgreSQL/Drizzle schema + migration        | `src/db/schema.ts`, `drizzle/0000_initial_schema.sql`, `npm run db:check`                                |
| F    | Graph in PostgreSQL                          | `consequence_nodes`, `consequence_edges`                                                                 |
| G    | Sponsor boundaries, no fake live integration | `src/integrations/*`, `boundaries.test.ts`                                                               |
| H    | Health endpoint                              | `GET /api/health`; `e2e/smoke.spec.ts`                                                                   |
| I    | No secrets committed                         | `.env.example` has blanks only; `.env*` gitignored; grep check in handoff                                |
| J–N  | Format, lint, typecheck, tests, build        | `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build`                 |
| O    | CI represents gates                          | `.github/workflows/ci.yml`                                                                               |
| P    | Docs reflect Brindle v3 thesis               | `README.md`, `docs/ARCHITECTURE.md`, ADR 0001                                                            |
| Q    | No M1 scope                                  | No agents, procurement logic, PO flow, fixtures or live sponsor calls in `src/`                          |
