# M1 sponsor integration

The canonical hackathon stack, and exactly how Brindle talks to each part. Zetaris reads were proven against the official sponsor runtime on 2026-10-27. Meterless/Nemotron and full M1 LIVE remain blocked: see [Live acceptance status](#live-acceptance-status).

| Layer                        | Role                                                                        | Status in this repo                                                         |
| ---------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Zetaris**                  | Hackathon **local Docker truth plane** (governed, read-only)                | LIVE PROVEN: official Docker runtime, five HTTP 200 reads, 4/4/1 assertions |
| **Meterless Nightshift**     | **Primary competition AI runtime**                                          | First-class primary provider; protocol-tested only                          |
| **NVIDIA**                   | Provider **configured inside Nightshift**; direct API is **secondary** only | Direct adapter exists as secondary; Nemotron-family model enforced          |
| **Nemotron**                 | **Required** reasoning model behind the accepted LIVE demo                  | Not yet demonstrated live; acceptance requires proof (see below)            |
| **H-MEM** (Meterless Engine) | **Mandatory M5** integration (hackathon eligibility)                        | M1 branch: not implemented. Current M5: see `M5_HMEM_RECOVERY_MEMORY.md`    |

## Zetaris: hackathon local Docker truth plane

**Canonical contract** (Participant Setup Guide). REST base in the hackathon local setup is `http://localhost:8888/api/v1.0` (an example; never hard-coded, configure it as `ZETARIS_REST_URL`).

```
POST {ZETARIS_REST_URL}/sql-editor/sqls/run
Authorization: Bearer <ZETARIS_API_KEY>
X-Org-ID: <ZETARIS_ORG_ID>
X-Request-ID: <fresh UUID>
Content-Type: application/json

{ "queryId": "<fresh UUID>", "sql": "<fixed read-only SELECT>", "source": "SqlEditor", "limit": <1..100> }
```

The query results are read from the response's **`data`**. The hackathon smoke example reads `data[0][0]`, so the endpoint may return **positional rows** as well as object rows, and Brindle does not assume which a given environment returns. The shape is classified explicitly (`src/integrations/zetaris/response-shape.ts`):

| Family                        | Example                                                  | Behaviour                                                                                                                                                                             |
| ----------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OBJECT_ROWS`                 | `data: [{"supplier_id": "SUP-ATLAS", ...}]`              | Normalized.                                                                                                                                                                           |
| `EMPTY`                       | `data: []`                                               | Zero rows (the caller decides whether that is an error).                                                                                                                              |
| `POSITIONAL_ROWS`             | `data: [["SUP-ATLAS", ...]]`, `data: [[1]]`              | Recognized as a legitimate family, but refused with `ZetarisResponseShapeUnsupportedError` unless reliable column metadata identifies the columns. Column order is **never guessed**. |
| `MIXED_ROWS` / `UNRECOGNIZED` | objects and arrays mixed, `data` missing or not an array | Refused with the same error.                                                                                                                                                          |

**Column metadata:** the official runtime OpenAPI documents HeaderRows with headers:string[] and positional data. The actual API returned that shape. Brindle maps only nonempty, trimmed, case-insensitively unique header names with matching row widths. It never guesses column order. See [LIVE evidence](evidence/M1_ZETARIS_LIVE_ACCEPTANCE.md).

`ZetarisResponseShapeUnsupportedError` carries only safe shape facts: family, JS type of `data`, row count, first-row width and top-level key _names_; never row values, the body or credentials. `npm run live:zetaris` prints this classification for every call, so the first live run immediately shows what the real environment returns.

- **Superseded:** the earlier `/query/sql/start|page|close` cursor API from Zetaris's generic OpenAPI spec was **removed**. It is not the hackathon path and no code path uses it.
- **Read-only by construction:** SQL is only built from one fixed template, `SELECT * FROM <schema>.<table> WHERE <key column> = '<id>'` over three tables. Identifiers are regex-validated, a guard rejects anything that is not a single plain SELECT (no `;`, comments, or write verbs), and no adapter method accepts caller SQL. `limit` is a constant bound (100); a result that reaches it is an error.
- **Tables (3):** `supplier_master`, `supplier_certifications`, `procurement_policy`, in the schema named by `ZETARIS_SCHEMA`.
- **Normalization:** rows become M0 `TruthAssertion`s (`src/integrations/zetaris/rows.ts`). Column names match case-insensitively; booleans accept JSON booleans or `true|TRUE|false|FALSE`; timestamps accept ISO 8601 or `YYYY-MM-DD HH:MM:SS` read as UTC; anything else throws (fail closed). Valid time comes from the row; observed time is when Brindle read it. No `TruthAssertion` field changed.
- **Secrets:** the API key is only ever placed in the `Authorization` header. Error messages and call logs carry the HTTP status and our `X-Request-ID`/`queryId`, never the key or the response body.

### Zetaris provisioning procedure

The smallest deterministic truth dataset is committed as CSV in `data/zetaris-seed/` (generated from `src/demo/seed-data.ts`; a test keeps them in sync; regenerate with `npm run zetaris:seed-csv`).

1. Start the hackathon Zetaris Docker environment (REST base normally `http://localhost:8888/api/v1.0`).
2. Create a schema (suggested `brindle_truth`) and load the three CSVs as tables named exactly `supplier_master`, `supplier_certifications`, `procurement_policy` (header row = column names).
3. Obtain the Zetaris API key and your organisation id.
4. Set in `.env.local`: `ZETARIS_REST_URL`, `ZETARIS_API_KEY`, `ZETARIS_ORG_ID`, `ZETARIS_SCHEMA`.
5. Verify: `npm run live:zetaris` must print 4 normalized assertions for `SUP-ATLAS`, 4 for `SUP-BOREAL` and 1 for `POL-PROC-001`.

LIVE mode **never** reads the local fixture; there is no code path from LIVE to `MockFixtureTruthRowSource`.

### Verified Zetaris environment

The official participant runtime returned headers/data/total/timeUsed, accepted schema.table and the fixed read-only queries, and produced the expected normalized assertions. All nine official platform checks passed. The exact source CSVs were loaded with row counts 3/3/1. These observations apply to the recorded runtime version; unsupported shapes remain refused.

## Meterless Nightshift: primary competition AI runtime

```
Brindle  ->  Meterless Nightshift Runtime  ->  NVIDIA provider (configured inside Nightshift)  ->  Nemotron-backed lane
```

Configuration (all three, or none): `METERLESS_BASE_URL`, `METERLESS_RUNTIME_TOKEN`, `METERLESS_MODEL`.

| Purpose         | Request                                         |
| --------------- | ----------------------------------------------- |
| Model discovery | `GET {METERLESS_BASE_URL}/v1/models`            |
| Reasoning       | `POST {METERLESS_BASE_URL}/v1/chat/completions` |

Headers on **every** Meterless Runtime request: `Authorization: Bearer <runtime token>`, `meterless-app: brindle`, `meterless-scope: user`, `Content-Type: application/json`, `Accept: application/json`. `METERLESS_BASE_URL` is the runtime origin; a trailing `/v1` is tolerated and normalized. No `tools`, `functions` or `tool_choice` is ever sent; the reply must be JSON that passes a strict Zod schema; provider "reasoning" side-channels are discarded.

**Competition LIVE mode requires Meterless, with no direct-NVIDIA bypass.** The locked stack is real Zetaris -> Brindle -> real Meterless Nightshift -> NVIDIA provider inside Nightshift -> Nemotron. `BRINDLE_RUNTIME_MODE=live` requires Zetaris, `DATABASE_URL`, fully configured Meterless **and** reasoning provider `meterless`. Setting `NEMOTRON_PROVIDER=nvidia` in LIVE mode (even with valid NVIDIA credentials, and even with Meterless also configured) fails configuration with: _"Competition LIVE mode requires Meterless Nightshift as the primary reasoning runtime. Direct NVIDIA is secondary development/probe only."_ The invariant is enforced twice: in `src/config/env.ts` and, defensively, in `src/demo/runtime.ts` (which refuses a hand-built LIVE config that routes through NVIDIA). NVIDIA credentials present alongside Meterless are ignored: the provider stays `meterless`.

### Direct NVIDIA: secondary only

`NEMOTRON_PROVIDER=nvidia` with `NVIDIA_API_KEY`, `NEMOTRON_MODEL_ID` and optionally `NVIDIA_BASE_URL` (default `https://integrate.api.nvidia.com/v1`) reaches NVIDIA's OpenAI-compatible API directly. The selected model **must be Nemotron-family** (configuration fails otherwise). **No Meterless headers are ever sent to NVIDIA** (tested). It is for local development, explicit standalone provider probing (`BRINDLE_RUNTIME_MODE=local NEMOTRON_PROVIDER=nvidia npm run live:nemotron`) and protocol tests. It can **never** satisfy competition LIVE mode.

## Runtime route vs underlying model

A Meterless routing identifier such as `meterless/auto` names a **runtime lane**, not the model that executed. Brindle keeps them separate everywhere:

- `runtimeRoute`: what was requested/served by (`meterless/auto`, or `nvidia-direct`).
- `underlyingModel`: the model that executed, **only** when the runtime reports a non-route model for that very request (`PROVIDER_REPORTED`), or for direct NVIDIA the requested Nemotron model. Otherwise `null` (`UNPROVEN`).
- The id recorded on a DecisionReceipt is the underlying model if known, else `route:<runtimeRoute>`, so a route can never be read as a model. The `/demo` page shows both, with `UNPROVEN` when applicable.

### Nemotron LIVE evidence requirement

`npm run live:nemotron` passes **only** if (a) the requested route/model is exposed by `GET /v1/models`, (b) a real structured request succeeds, **and** (c) the underlying model reported for that request is Nemotron-family. If the runtime answers but reports only a route id, the probe prints `UNPROVEN` and fails: a reachable Meterless route is not evidence that Nemotron ran. If Nightshift never reports the underlying model in its responses, acceptance needs additional runtime evidence (e.g. a Nightshift-side request record) attached alongside the probe output; the probe will not pass on a route alone.

## Hackathon eligibility lock: H-MEM

The official Participant Setup Guide requires **at least one actual Meterless Engine in a working product feature**. Provider integration alone does **not** satisfy this, and **M1 does not satisfy it**. H-MEM Recovery Memory is therefore locked into **M5 — Verification & Proof** as **HACKATHON ELIGIBILITY CRITICAL**: actual working integration, user-visible useful product behaviour, a reproducible demo, and conformance/evaluation/test evidence. Nothing of H-MEM is implemented in M1 (the `remember`/`recall` boundary remains an interface; every receipt's `memoryRefs` is `[]`).

## Live acceptance status

**LIVE ACCEPTANCE: BLOCKED** on a supported, reachable Meterless Nightshift runtime with NVIDIA/Nemotron configured and request-level model attribution. Zetaris is now LIVE PROVEN; the local isolated PostgreSQL database has all five migrations. See [Zetaris acceptance](evidence/M1_ZETARIS_LIVE_ACCEPTANCE.md) and [reasoning gate refusal](evidence/M1_NIGHTSHIFT_BLOCKER.txt). No full LIVE recovery or sponsor-backed receipt exists.

Needed: METERLESS_BASE_URL, METERLESS_RUNTIME_TOKEN and a discovered route with a Nemotron-family provider behind it. The x86_64 Codespace does not meet the official DGX ARM64 installer requirement, and no supported remote runtime was available. Resume discovery and strict model proof before the full LIVE run.

## Exact live verification procedure

```bash
cp .env.example .env.local        # fill in; BRINDLE_RUNTIME_MODE may stay "local" for the probes
npm ci
npm run db:migrate                # needs DATABASE_URL
npm run live:zetaris              # real read-only round trip; prints X-Request-ID / queryId
npm run live:nemotron             # GET /v1/models, one structured call, route vs underlying model, Nemotron proof
BRINDLE_RUNTIME_MODE=live npm run live   # both probes, then a sandbox-reset + full LIVE end-to-end run
```

Evidence to capture (all secret-free): probe output; the `LIVE ::` banner on the run; six DecisionReceipts whose `truthRefs` resolve to assertions with `source_id = 'zetaris'` and whose recorded model is the Nemotron-family underlying model (not a `route:` id); the `/demo` page showing `PROVIDER MODE: LIVE` with the underlying model proven. Mock output (`MOCK ::`, `MOCK:` ids) is never sponsor evidence.

## Current M5 engine implementation

M5 implements and exercises the documented local H-MEM spec engine with PostgreSQL persistence;
see `M5_HMEM_RECOVERY_MEMORY.md`. That later implementation does not change this document's
M1 LIVE status: Zetaris reads are proven; Nightshift/Nemotron and full LIVE acceptance remain mandatory.
