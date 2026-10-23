# M2 — Temporal Consequence Graph

Status: implementation under verification; GUIDE acceptance pending. This is stacked on
`m1-successful-agent-world` at `2368da68a161f61c19018e391b514facd6f84e37`.
M1 code gate passed; sponsor LIVE acceptance remains deferred and mandatory before submission.
M2 does not satisfy sponsor LIVE or Meterless Engine requirements.

## Two clocks, immutable evidence

Valid time is `[validFrom, validTo)`: when a fact applies in the world. Observed time is
`observedAt`: when Brindle learned that version. `created_at` is only the database write clock.
`truthAsKnownAt(db, assertionId, worldAt, knownAt)` reconstructs the fact applicable at
worldAt using versions observed by knownAt and revisions known by that instant. It excludes
superseded versions only inside a known revision's effective interval. Outside a partial
correction's interval the original version remains available. Nothing updates the previous row.

`ingestRevision` validates the existing strict contracts, derives retroactivity with a strict
`effectiveFrom < observedAt` comparison (equality is not retroactive), checks identity, source,
fact key, clocks and replacement interval, locks the previous row, and atomically appends the
replacement, revision and graph evidence. The replacement node SUPERSEDES the previous node.
Duplicate revision IDs must match the entire normalized immutable payload, including provenance.
Conflicting deliveries fail without partial writes. A previously revised predecessor cannot fork;
further corrections must revise its replacement. The service never invokes a business executor.

No migration is necessary: existing primary keys, unique version/pair/edge constraints, foreign
keys, bitemporal checks and traversal indexes provide the required persistence invariants.
Application APIs are append-only; privileged SQL administrators can still mutate tables, as in M1.

## Evidence-driven graph

`buildConsequenceGraph` reads committed decision receipts, truth versions and the four sandbox
business tables in one transaction. It never builds graph facts from a React fixture.

| Stored edge                     | Evidence / direction                                            |
| ------------------------------- | --------------------------------------------------------------- |
| truth INFORMED decision         | Receipt's exact persisted truth version refs                    |
| decision CAUSED action          | Receipt with a matching committed executor business effect      |
| action MUTATED business object  | Business record's creator/decision foreign key                  |
| decision DEPENDS_ON object      | Explicit DOCUMENT evidence matching a persisted business object |
| replacement SUPERSEDES previous | Persisted truth revision                                        |

Actions identify the executed chosen action by decision ID: M1 has no separate action table.
No unsupported memory relationship is invented. Document IDs that do not resolve to persisted
business objects are not turned into edges. Node IDs are kind/ref identities and edge IDs are
serialized endpoint/type triples. Rebuilding uses existing unique constraints and is idempotent.
Shared global policy truth can inform both branches, but traversal cannot go upstream from a
decision to that truth and then enter another supplier's branch.

## Deterministic candidate traversal

`blastRadius` executes a PostgreSQL recursive CTE, rooted at the revision's previous version.
INFORMED, CAUSED and MUTATED are followed forward. DEPENDS_ON and DERIVED_FROM are followed
from prerequisite to dependent (reverse stored direction). SUPERSEDES is never traversed.
A visited-ID array rejects cyclic paths. A window selects one shortest path per reached node,
with a lexical path tie-break; results sort by depth and ID with explicit C collation.
Only DECISION, ACTION and BUSINESS_OBJECT nodes are candidates. Paths retain node IDs for
inspection without model prompts, credentials or hidden reasoning.

Every decision boundary must fall inside both the correction's effective interval and the
previous version's valid interval. The upper bound is exclusive. This applies to directly
informed and downstream decisions alike. A future-only correction therefore cannot select a
historical decision before its valid time. There is no artificial observed-time upper cutoff:
a persisted decision that continued to use the superseded version can remain a candidate.
No decision is replayed against today's world. Downstream business effects inherit reachability
through their eligible decision; this is consequence discovery, not a timestamp filter on when
a later business effect was recorded.

The CTE enumerates simple paths before deduplication; it terminates on finite cyclic data but
can grow combinatorially on very dense graphs. This bounded sandbox uses a small persisted graph.
M2 returns CANDIDATE only. Reachability cannot establish whether an outcome would differ.
There are no SAME / CHANGED / UNCERTAIN verdicts, recovery plans or recovery executions here.

## Sandbox demonstration

1. Open `/demo` in MOCK mode and run Successful Agent World.
2. Inject truth revision. This explicitly labelled sandbox endpoint refuses LIVE mode.
3. Atlas certification changes from VALID to REVOKED, effective three days before PO-827's
   persisted procurement decision and observed two days after it (or after the original
   observation, whichever is later). These relative clocks keep repeated sandbox runs meaningful.
4. Read the temporal revision, graph evidence and candidate paths. PO-827 contributes 10
   candidates: 3 decisions, 3 actions, 4 business objects. PO-901's 10 corresponding nodes remain
   outside. Shared policy does not create an Atlas-to-Borealis consequence path.
5. Business state remains successfully completed. No materiality verdict or recovery occurs.

The existing M1 reset deliberately refuses after a revision; historical evidence is not silently
deleted. Use a fresh local ephemeral runtime for a clean demonstration. Re-injection is idempotent.

## Visual foundation

The bounded M2 panel uses named CSS tokens: Obsidian, Bone, Copper, Mint, Gold, Vermilion and Muted.
Copper's interrupted/rejoined recovery seam marks revised truth; dashed gold paths carry explicit
CANDIDATE labels; a solid muted seam identifies the unrelated control. Color never carries state
alone. Mint and Vermilion are reserved tokens, not invented M3/M4 states. Intended typography is
IBM Plex Sans / Sans Condensed / Mono; safe system fallbacks avoid font downloads and new build
dependencies. The rest of M1's surface is retained.

## Gates

Run `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
`npm run db:check`, `npm run db:generate`, `npm run build`, and `npm run test:e2e`.
Database tests apply all committed migrations to PGlite's PostgreSQL engine; the recursive CTE,
constraints, transactions, temporal endpoints, cycles and deduplication run against that engine.
CI remains the repository's full Verify and E2E workflows. GUIDE must independently accept the
exact published HEAD before M2 can PASS. M3/M4/M5 behavior is not implemented.
