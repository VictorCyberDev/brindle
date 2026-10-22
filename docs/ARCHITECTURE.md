# Architecture (M0)

Brindle separates **truth**, **reasoning** and **recovery**. Each is its own module with a
different trust level. The separation is enforced by types, lint rules and tests, not convention.

## Planes

| Plane              | Module                                      | Trust                                                        |
| ------------------ | ------------------------------------------- | ------------------------------------------------------------ |
| Truth              | `src/integrations/zetaris`, `brindle/truth` | Authoritative, read-only observation                         |
| Reasoning          | `src/integrations/nemotron`, `meterless`    | Advisory. Structured, schema-validated output only           |
| Deterministic core | `src/brindle/*`                             | Owns safety: graph, effects, authority, idempotency, closure |
| Recovery execution | `brindle/recovery` (capabilities in M4)     | Only registered, bounded `RecoveryCapability`s mutate        |
| Persistence        | `src/db`                                    | PostgreSQL via Drizzle                                       |

Dependency direction: `app → db, config, integrations, brindle`; `db → brindle`;
`integrations → brindle (types)`; `brindle → nothing outside itself`. ESLint
`no-restricted-imports` fails the build if the domain core imports db, config, integrations or
app, or if an integration imports db, app or `brindle/recovery`.

## Bitemporal truth

- **Valid time** (`valid_from`, `valid_to`): when a fact was true in the world.
- **Observed time** (`observed_at`): when Brindle learned that version.
- **Row time** (`created_at`): when the row was physically written.

Facts are immutable versions `(assertion_id, version)`. A correction is a new version plus a
`TruthRevision`. A revision is **retroactive** iff `effective_from < observed_at` (equality is not
retroactive). The flag is derived: the Zod contract recomputes it and a PostgreSQL `CHECK` enforces it.

## Consequence graph

Plain PostgreSQL `consequence_nodes` / `consequence_edges`. Node kinds: `TRUTH_VERSION`, `MEMORY`,
`DECISION`, `ACTION`, `BUSINESS_OBJECT`. Edge types (closed set): `INFORMED`, `DERIVED_FROM`,
`CAUSED`, `MUTATED`, `DEPENDS_ON`, `SUPERSEDES`. Both directions are indexed. Traversal is
deterministic (M2). No graph database.

## Effects and recovery honesty

`REVERSIBLE → REVERSE`, `COMPENSABLE → COMPENSATE`, `IRREVERSIBLE → REMEDIATE`. This mapping is the
only one permitted, checked in the Zod `RecoveryStep`, in the `RecoveryReceipt` outcome vocabulary,
and by a PostgreSQL `CHECK`. An irreversible effect can never be described as reversed or rolled back.
Idempotency keys are derived (`sha256` of incident, effect, capability) and validated.

## Counterfactuals

`SAME | CHANGED | UNCERTAIN`; `UNCERTAIN` requires a reason and is never coerced. The assessment
records `originalContextRefs + correctedFactRef`: replay reconstructs the original context with the
corrected fact, not the present-day world.

## Incident lifecycle

`OPEN → ANALYZING → RECOVERY_PLANNED → RECOVERING → VERIFYING → RECOVERED`, with
`RECOVERY_INCOMPLETE` (replan loop) and `ESCALATED` as explicit non-success states.
`ANALYZING → VERIFYING` exists for "nothing to change", which still needs verification.
`RECOVERED` is reachable only from `VERIFYING`, only via `closeIncident`, which requires a
`RecoveryReceipt` whose invariants all pass on **fresh independent reads**
(`FRESH_INDEPENDENT_READ` is the only observation kind representable). The Zod contract and a
database `CHECK` both refuse a `RECOVERED` incident without closure proof.

## Sponsor boundaries (interfaces only in M0)

- **Zetaris** `ZetarisTruthReader.readAssertions` — read-only, bitemporal query. No write surface.
- **Nemotron** `NemotronReasoner.reason` — structured request → output validated against a Zod
  schema (`parseReasoningOutput`). No tools parameter exists.
- **Meterless** — `invokeModel` (runtime) and `remember` / `recall` (Brindle's own recovery memory).

No live calls exist in M0. Unconfigured adapters throw `IntegrationNotAvailableError`; nothing is
faked and presented as real. Tests assert the exact operation lists.

## Decisions and known open points

- IDs are opaque strings (not branded) in M0; branding can be added without schema changes.
- Edge endpoint-kind rules (e.g. which kinds `MUTATED` may connect) are deferred to M2 with the builder.
- Persisting contracts to rows (mappers/repositories) is deferred to the milestone that first needs them.
