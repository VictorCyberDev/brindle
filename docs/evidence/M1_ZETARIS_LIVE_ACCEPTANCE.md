# Zetaris LIVE acceptance — 2026-10-27

Zetaris truth reads are LIVE PROVEN. Overall M1 LIVE remains BLOCKED on Meterless Nightshift and Nemotron execution proof.

Tested commit: e08896e8ed5bd9002fdb2bfd803b9eb578fbb695. Timestamp: 2026-10-27T22:50:44Z.

Official participant package obtained from the authenticated Zetaris portal for the hackathon account. Fresh registry authentication succeeded. Package and OpenAPI hashes, actual request/query IDs, and response metadata are in [the structured evidence](M1_ZETARIS_LIVE_ACCEPTANCE.json).

The official Docker runtime ran inside the existing GitHub Codespace. All nine official verify.sh checks passed, including login and a query through UI → API → driver → Spark. A legacy Docker forwarding conflict was repaired with rules limited to the sponsor bridge and required DNS/HTTPS traffic; the FORWARD policy remains DROP.

The exact committed CSVs were copied into the official driver and registered as FILESTORE tables in brindle_truth. supplier_master has 3 rows, supplier_certifications 3, procurement_policy 1. SUP-ATLAS, SUP-BOREAL and POL-PROC-001 were queried. [Provisioning requests](M1_ZETARIS_TABLE_PROVISIONING.json) preserve actual IDs and results.

A fresh API key authenticated five real read-only POST /api/v1.0/sql-editor/sqls/run calls. All returned HTTP 200 with documented HeaderRows headers:string[] and positional data. The minimal adapter patch maps only validated, unique headers and matching row widths; unsupported metadata still fails closed. The probe produced 4 SUP-ATLAS, 4 SUP-BOREAL and 1 POL-PROC-001 normalized assertions, source zetaris. [Unmodified probe output](M1_ZETARIS_LIVE_PROBE.txt) is retained; its generic positional-row advisory is stale text, while HEADERS classification and successful normalization are actual execution results.

Commands: npm ci; npm run db:migrate (isolated local brindle_m1 database, 5 migrations); npm run live:zetaris; official bash verify.sh. Regression gates on the tested code passed: format:check, lint, typecheck, npm test (255), db:check, build, CI E2E smoke, H-MEM conformance/restart retrieval, and eval:m6 (8/8). GitHub Actions run 40596826409 passed Verify and E2E smoke.

## Remaining reasoning blocker

No Meterless runtime base URL, runtime token or configured model route is available. The official Nightshift CLI setup inspected at https://meterless.ai/cli.html and its DGX installer support designated GPU hosts; the DGX installer requires ARM64, while this Codespace is x86_64. The browser edition provides no application hotspot endpoint. No sponsor cloud runtime entitlement or supported remote host was found in the available participant resources.

npm run live:nemotron refused with exit 3; BRINDLE_RUNTIME_MODE=live npm run live refused with exit 2 at configuration validation. [Actual refusal output](M1_NIGHTSHIFT_BLOCKER.txt) is retained. No model discovery, Nemotron execution, full LIVE recovery or sponsor-backed receipts are claimed. No mock or direct-NVIDIA replacement was used.

Owner action required: obtain an accessible, supported Nightshift runtime with NVIDIA/Nemotron configured and supply its runtime access through a secure environment. Then resume model discovery, strict underlying-model proof, full LIVE recovery and receipt verification. Do not merge PR #7 or submit the hackathon entry.
