# M6 security review

Scope: the product layer added in M6 (authentication, workspaces, roles, API keys, evidence API,
beta requests, public pages). Reviewed by the implementing agent against the code and tests in this
branch. It is **not** an independent audit or a penetration test.

## Controls and where they are tested

| Area                | Control                                                                                                                                                                                                                       | Evidence                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Authentication      | Better Auth (email and password, salted hashing, DB-backed rate limit, HTTP-only same-site cookies). No hand-rolled cryptography.                                                                                             | `src/server/auth.ts`; E2E journey L                                                |
| Route protection    | `src/proxy.ts` redirects unauthenticated requests for `/app/*` and `/onboarding` to sign-in. Every page and action re-verifies the session and workspace membership server-side. The proxy is a convenience, not the control. | `src/server/session.ts`; E2E "unauthenticated visitors"                            |
| Authorization       | Role to permission map; every mutating server action calls `assertCan`. Auditors are read-only.                                                                                                                               | `src/product/permissions.test.ts`; E2E J                                           |
| Workspace isolation | Every query filters by `workspace_id`; the data facade is the only reader. API keys resolve to one workspace.                                                                                                                 | `src/server/product.test.ts` ("workspace isolation"), `src/app/api/v1/api.test.ts` |
| Recovery authority  | One pure rule: Shadow never executes; no registered capability means no execution; Approval needs an approval. Customer workspaces cannot select Bounded Autonomous.                                                          | `permissions.test.ts`; E2E G, H, I                                                 |
| API keys            | 256-bit random; only SHA-256 hash plus short prefix stored; plaintext returned once; never logged; revocation immediate; revoke is workspace-scoped.                                                                          | `product.test.ts` ("api keys"); E2E I                                              |
| Evidence API        | Strict Zod schemas (`strictObject`), 64 KiB body cap, content-type check, per-key rate limit, stable error envelope with no stack traces. No endpoint accepts an action or authority.                                         | `api.test.ts`; OpenAPI test lists only evidence endpoints                          |
| Injection           | Parameterized Drizzle queries only. No string-built SQL. Docs are repository-authored markdown rendered at build time. User-supplied text is rendered by React (escaped).                                                     | code review; grep for `sql\`` use                                                  |
| Beta requests       | Zod validation, honeypot, per-IP-hash hourly limit, per-email daily limit; raw IPs never stored.                                                                                                                              | `product.test.ts` ("beta requests")                                                |
| Secrets             | `.env*` ignored; `.env.example` has names only; production refuses to start the app without `BETTER_AUTH_SECRET` and `DATABASE_URL`. The health endpoint returns a secret-free summary.                                       | `src/config/env.test.ts`; E2E F                                                    |
| Public demo         | Recorded engine run; no shared mutable sandbox is exposed publicly; public proof pages exist only for the two DEMO incidents.                                                                                                 | `src/story/snapshot.test.ts`                                                       |
| Test-only switch    | `BRINDLE_E2E_EPHEMERAL_DB=1` lets the browser suite run without a database. It is not set in any deployment.                                                                                                                  | `src/server/db.ts`                                                                 |

## Secret scan

A pattern scan of all tracked files (provider key prefixes, private-key headers, URLs with embedded
passwords) found only placeholder fixtures on reserved example hosts (`db.example.com`,
`*.example.test`) in unit tests. No real credential is committed.

## npm audit classification

`npm audit` reports 4 **moderate** advisories, all one chain: `esbuild` (dev-server request exposure)
reached through `drizzle-kit` (a **devDependency**, used only by migration tooling) via the legacy
`@esbuild-kit/*` packages. Facts:

- None of it is bundled into or executed by the deployed app.
- The advisory concerns esbuild's _development server_, which no script here starts.
- The suggested "fix" is to downgrade `drizzle-kit` to 0.18.1, which would break migrations
  generated for the current schema. We did **not** run `npm audit fix --force`.
- Action: accept for now, track the upstream `drizzle-kit` release that drops `@esbuild-kit`.
- No high or critical advisories.

## Known limitations (stated, not hidden)

- Rate limits on `/api/v1` are in-memory per server instance: they blunt abuse, they are not quotas.
- Sign-in rate limiting and sessions rely on Better Auth defaults; there is no MFA, SSO or email
  verification yet.
- No email is sent, so there is no password reset flow in this beta.
- Self-serve data deletion is not built; deletion is by request.
- `dossier.ts` reads engine snapshot JSON through one `any`-typed boundary with an explicit
  ESLint exception, because that JSON is produced by the engine and validated by the snapshot test.
- No third-party penetration test, SOC 2, ISO 27001, HIPAA or GDPR attestation exists, and none is claimed.
