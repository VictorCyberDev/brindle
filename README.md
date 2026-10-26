# Brindle Recovery

**Truth changed. Recover precisely.**

When a fact your AI agents relied on turns out to be wrong, Brindle finds exactly what it touched,
recovers only that, preserves everything else, and proves it. The recovery plane for AI agents.

- **Live private beta:** https://brindle-start-up16.vercel.app
- **Product tour (no sign-up):** https://brindle-start-up16.vercel.app/demo
- **Docs:** https://brindle-start-up16.vercel.app/docs

> Brindle Recovery is a working name. See [docs/BRAND_NAMING_RISK.md](docs/BRAND_NAMING_RISK.md).

---

## For customers

Your agents approved orders, scheduled work and told customers dates. Then a supplier's
certification turned out to have been revoked a week earlier. Rolling everything back destroys good
work. Doing nothing leaves wrong work standing.

Brindle:

1. **Traces** the changed fact through every decision that used it and every consequence that followed.
2. **Decides** which decisions would really have changed, by re-evaluating each with the corrected fact.
3. **Recovers** only those, through fixed, validated capabilities. Never what cannot be undone.
4. **Proves** the result by reading the real state again from scratch and checking six invariants.

You choose how far it may go: **Shadow** (reports, changes nothing; the default), **Approval** (acts
after a person approves) or **Bounded Autonomous** (acts alone, only through registered capabilities).

### What works today, and what does not

| Works                                                                                      | Does not exist yet                                                                        |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Accounts, workspaces, roles, API keys                                                      | Connectors that execute recovery inside **your** systems                                  |
| Evidence API: send decisions and truth changes, get incidents with an honest impact report | Replaying your agent (so your decisions are marked **Needs human review**, never guessed) |
| Demo Workspace with a complete recovery, approval, Recovery Proof and Recovery Memory      | SSO, MFA, email, self-serve deletion, billing                                             |
| Shadow and Approval modes, plan review, shareable proof for the demo                       | Any compliance certification (SOC 2, ISO, HIPAA, GDPR). None is claimed.                  |

In your own workspace Brindle observes and proposes. It does not change your systems, because no
recovery capability for them is registered. See [Security](docs/M6_SECURITY_REVIEW.md) and the
customer docs in [`content/docs`](content/docs).

## For developers

```bash
npm ci
npm run dev        # http://localhost:3000. No credentials needed: an in-process PostgreSQL is used.
```

Send evidence from your agent ([API reference](content/docs/api.md), [OpenAPI](src/product/openapi.ts)):

```bash
curl -X POST $HOST/api/v1/decisions     -H "Authorization: Bearer $BRINDLE_API_KEY" -H "Content-Type: application/json" -d @decision.json
curl -X POST $HOST/api/v1/truth-revisions -H "Authorization: Bearer $BRINDLE_API_KEY" -H "Content-Type: application/json" -d @revision.json
```

The API receives evidence only. There is no endpoint that runs an action or grants authority.

| Command                                           | Purpose                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| `npm run format:check` / `lint` / `typecheck`     | Static gates                                                           |
| `npm test`                                        | Unit and integration tests (in-process PostgreSQL, migrations applied) |
| `npm run test:e2e`                                | Playwright journeys against the production build                       |
| `npm run eval:m6`                                 | The 8-scenario evaluation and ablation against the real engine         |
| `npm run story:snapshot`                          | Re-record the demo story from a fresh engine run                       |
| `npm run hmem:conformance` / `hmem:probe`         | Recovery Memory conformance and restart probe                          |
| `npm run db:generate` / `db:check` / `db:migrate` | Drizzle migrations                                                     |

Configuration is in [.env.example](.env.example). Production needs `DATABASE_URL`,
`BETTER_AUTH_SECRET` (32+ chars) and `BETTER_AUTH_URL`. `/api/health` reports what is configured,
never the values.

### Architecture

```
src/brindle/        Deterministic domain core (no I/O): truth, graph, counterfactual, recovery, receipts
src/services/       Bitemporal truth, consequence graph, materiality, recovery, verification, H-MEM
src/story/          One recorded real engine run + the 8-scenario evaluation and ablation
src/product/        Product model: roles, modes, authority rule, view models, ingest contracts
src/server/         Auth, workspaces, API keys, ingestion, data facade (the only reader of workspace data)
src/app/            Next.js App Router: public site, /app product, /api/v1, onboarding
src/components/     Brand (the Seam), ui, product components
content/docs/       Customer documentation rendered at /docs
docs/               Engineering docs, milestone evidence, brand, security review, submission package
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## For judges

- **What is real:** the recovery engine (bitemporal truth, consequence graph, counterfactual
  materiality, registry-bound recovery, fresh independent verification, Recovery Receipt) and a
  local H-MEM Recovery Memory engine. The demo is a recording of one real engine run; a test re-runs
  the engine and checks the recording still matches.
- **What is mocked:** truth and reasoning in the demo are MOCK. No sponsor service is called by the
  deployed demo.
- **Sponsor LIVE status:** M1 LIVE sponsor acceptance (Zetaris, Meterless Nightshift) is **BLOCKED**
  and is not claimed. See [docs/M1_SPONSOR_INTEGRATION.md](docs/M1_SPONSOR_INTEGRATION.md) and
  [docs/submission/SPONSOR_PROOF_CHECKLIST.md](docs/submission/SPONSOR_PROOF_CHECKLIST.md).
- **Evidence:** [docs/M6_ABLATION.md](docs/M6_ABLATION.md), [docs/evidence/M6_EVAL_RESULTS.json](docs/evidence/M6_EVAL_RESULTS.json),
  [docs/M5_HMEM_RECOVERY_MEMORY.md](docs/M5_HMEM_RECOVERY_MEMORY.md).
- **Submission package:** [docs/submission](docs/submission) (demo script, shot list, deck outline, copy, sponsor checklist).

## For investors

Agents are being given authority faster than organisations can undo their mistakes. Observability
tells you what happened. Guardrails try to prevent it. Nothing today answers: _a fact we relied on
changed, what exactly do we undo, and can we prove we undid only that?_ Brindle is that layer.

Where it stands, honestly: a working recovery engine and a usable private-beta product with an
evidence API and a full demo. It is not yet connected to customers' own systems, has no paying
customers and no certifications. The next milestone is the first registered connector and a design
partner using Approval Mode on real data. Detail in [docs/MILESTONES.md](docs/MILESTONES.md).

## Safety boundaries (non-negotiable)

- Irreversible effects are never rolled back. They are escalated and stated in the proof.
- Brindle acts only through a fixed registry of capabilities. There is no arbitrary execution path.
- Shadow Mode never executes. Memory advises and never authorizes.
- Demo data is always labeled. Nothing is claimed that does not exist.
