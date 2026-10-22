# M1 sponsor integration

This records exactly how Brindle talks to each sponsor, what was verified from official material, and what is **not** verified. Nothing here was exercised against a live sponsor service during implementation (no credentials were available): see [Live acceptance status](#live-acceptance-status).

## Sources consulted (current at implementation time)

| Sponsor   | Source                                                                                                                                                      | Used for                                                          |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Zetaris   | OpenAPI spec `https://api.saas.enterprise.zetaris.com/redoc/docs.yaml` (rendered at `/redoc/index.html`), `info.version: v1`                                | Exact endpoints, headers, request/response schemas, auth schemes  |
| Zetaris   | Zetaris knowledge base: "Accessing Zetaris using API", "rest api" (`kbase.zetaris.com`)                                                                     | Login/token flow, `pageLimit` range 1-100, `queryToken` lifecycle |
| NVIDIA    | NVIDIA hosted API: OpenAI-compatible base URL `https://integrate.api.nvidia.com/v1`, key from build.nvidia.com                                              | Chat-completions wire protocol                                    |
| Meterless | `https://meterless.ai` (Nightshift): "one OpenAI-compatible base URL and key" exposed by the user's own hotspot, with Nemotron models listed in its catalog | Alternative OpenAI-compatible route                               |

No endpoint, field or model identifier was invented. Where official material was silent, the code fails closed and this document says so.

## Zetaris: governed read-only truth plane

**Method:** HTTPS to the tenant's Zetaris API using the documented SQL query API.

```
POST   {ZETARIS_BASE_URL}/api/v1.0/query/sql/start             body {"select": "...", "pageLimit": 100} -> OpenSqlResponse
GET    {ZETARIS_BASE_URL}/api/v1.0/query/sql/page              (not used in M1; single page enforced)
DELETE {ZETARIS_BASE_URL}/api/v1.0/query/sql/close/{queryToken}
Headers on every call:
  Authorization: Bearer <ZETARIS_API_KEY>   (spec scheme "httpAuth2": "Api Token via Bearer token")
  X-Org-ID: <ZETARIS_ORG_ID>                (int64)
  X-Request-ID: <fresh uuid>                (our correlation id, logged)
```

- `ZETARIS_API_KEY` is a Zetaris **API token** (the spec distinguishes it from the login `idToken`; the SQL endpoints use the API-token scheme). Obtain it from the Zetaris API token generator. The Basic-auth login endpoint is not used.
- **Read-only by construction:** SQL is only built from three fixed templates `SELECT * FROM <schema>.<table> WHERE <key column> = '<id>'`; identifiers are regex-validated, a guard rejects anything that is not a single plain SELECT, and no adapter method accepts caller SQL. The only non-read call is `DELETE .../close/{queryToken}`, which discards the server-side cursor.
- **Tables (3):** `supplier_master`, `supplier_certifications`, `procurement_policy`, in the schema named by `ZETARIS_SCHEMA`.
- **Normalization:** rows become M0 `TruthAssertion`s (see `src/integrations/zetaris/rows.ts`): column names are matched case-insensitively; booleans accept `true/false` (any of `true|TRUE|false|FALSE` or JSON booleans); timestamps accept ISO 8601 or `YYYY-MM-DD HH:MM:SS` interpreted as UTC. Anything else throws `TruthNormalizationError` (fail closed). **Valid time** comes from the row (`updated_at`, `valid_from`/`valid_to`, `effective_from`); **observed time** is when Brindle read it. No `TruthAssertion` field was changed.

### Zetaris provisioning (required once, before a LIVE run)

The smallest deterministic dataset is committed as CSV in `data/zetaris-seed/` (generated from `src/demo/seed-data.ts`; a test keeps them in sync):

1. In your Zetaris tenant create a schema/database (suggested name `brindle_truth`).
2. Upload the three CSVs as tables named exactly `supplier_master`, `supplier_certifications`, `procurement_policy` (header row = column names). Use text/string columns for `enabled` and `max_po_amount_cents`, or native boolean/int; both are accepted.
3. Generate an API token; note your organisation id.
4. Put into `.env.local`: `ZETARIS_BASE_URL`, `ZETARIS_API_KEY`, `ZETARIS_ORG_ID`, `ZETARIS_SCHEMA`.
5. Verify: `npm run live:zetaris` (must show 4 normalized assertions for `SUP-ATLAS`, 4 for `SUP-BOREAL` and 1 for `POL-PROC-001`).

LIVE mode **never** reads the local fixture: there is no code path from LIVE to `MockFixtureTruthRowSource`.

### Unverified Zetaris assumptions (verify with `npm run live:zetaris`)

- The tenant base URL (the published spec lists none; `api.saas.enterprise.zetaris.com` hosts the docs only).
- Whether the returned `records` use upper- or lower-case keys, and how booleans/timestamps are typed (handled defensively, but unobserved).
- Whether `schema.table` is the correct qualified-name form for the tenant.
- Whether the API token (not `idToken`) is accepted as `Authorization: Bearer` for SQL start/close, as the spec states.
- Multi-page results are intentionally unsupported in M1 and raise an error.

## Nemotron: structured reasoning

**Method:** OpenAI-compatible Chat Completions (`POST {base}/chat/completions`, `GET {base}/models`) with `Authorization: Bearer <key>`. No `tools`/`functions`/`tool_choice` are ever sent; `temperature: 0`, `stream: false`. The system prompt embeds the Zod-derived JSON Schema; the reply text is stripped of `<think>` blocks, parsed as JSON and must pass the strict Zod schema before anything is used. Provider "reasoning" side-channel fields are ignored and never stored. Rationale kept in a DecisionReceipt is the model's _structured_ `rationale` object, not hidden reasoning.

**Model id:** not hard-coded. Third-party documentation lists several Nemotron ids that differ by date, so the id must be discovered: `npm run live:nemotron` calls `GET /models`, prints the Nemotron-family ids the route exposes, verifies that `NEMOTRON_MODEL_ID` is among them, and performs one structured call. The id that call actually exercised is the one to pin in `NEMOTRON_MODEL_ID` and is recorded on every DecisionReceipt (the provider-reported served model, falling back to the configured one).

**Routes** (`NEMOTRON_PROVIDER`):

| Provider    | Base URL                                                         | Key                 | When                                                           |
| ----------- | ---------------------------------------------------------------- | ------------------- | -------------------------------------------------------------- |
| `nvidia`    | `NVIDIA_BASE_URL`, default `https://integrate.api.nvidia.com/v1` | `NVIDIA_API_KEY`    | Direct to NVIDIA's hosted API                                  |
| `meterless` | `METERLESS_BASE_URL` (your Nightshift hotspot's `/v1`)           | `METERLESS_API_KEY` | When the hackathon environment routes models through Meterless |

## Meterless role in M1

Meterless is a model/runtime boundary. In M1 its only exercised role is as the _optional OpenAI-compatible route_ for Nemotron (`NEMOTRON_PROVIDER=meterless`). Its published materials describe a locally-run hotspot (Nightshift) rather than a hosted API with its own documented schema, so **no Meterless-specific API was invented**. The recovery-memory boundary (`remember`/`recall`) remains an interface only (M5); `memoryRefs` on every receipt are `[]` because no memory was used. If the hackathon provides Nemotron directly via NVIDIA, use `nvidia`; the reasoning abstraction (`NemotronReasoner`) is unchanged either way.

## Live acceptance status

**LIVE ACCEPTANCE: BLOCKED** at the time of this implementation. No Zetaris tenant URL/token/org id and no NVIDIA or Meterless key were available to the implementing session, so no real Zetaris request, no real Nemotron call and no sponsor-backed end-to-end run were made. Everything here is implemented against published protocols and tested with clearly labelled protocol doubles that prove wire-format conformance only.

Missing to complete it: Zetaris base URL + API token + org id + a schema with the three seed tables; one Nemotron route (NVIDIA key, or a Meterless hotspot URL + key) and a model id discovered via `live:nemotron`; a reachable PostgreSQL `DATABASE_URL` with migrations applied (`npm run db:migrate`).

## Exact live verification procedure

```bash
cp .env.example .env.local        # fill in values; BRINDLE_RUNTIME_MODE may stay "local" for the probes
npm ci
npm run db:migrate                # needs DATABASE_URL
npm run live:zetaris              # real read-only round trip, prints request ids
npm run live:nemotron             # lists models, pins check, one structured call, prints served model + request id
BRINDLE_RUNTIME_MODE=live npm run live   # both probes, then a sandbox-reset + full LIVE end-to-end run
```

Evidence to capture: the probe output (secret-free), the `LIVE ::` banner on the run, six DecisionReceipts whose `modelId` is the served model and whose `truthRefs` resolve to assertions with `source_id = 'zetaris'`, and the `/demo` page showing `PROVIDER MODE: LIVE`. Mock output (`MOCK ::`, `MOCK:` ids) is never sponsor evidence.
