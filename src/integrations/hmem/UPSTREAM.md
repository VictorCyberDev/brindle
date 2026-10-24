# Official H-MEM engine provenance

Source: https://github.com/Meterless/Meterless/tree/1742dec56a66e58eef9dda2d2b865823758ca8cd/engines/hmem

License: Apache-2.0, copied in `LICENSE`. The ten `engine/*.ts` files are adapted from
`reference/src` at the exact commit above. The runtime is real local code, not an HTTP service and
not a protocol double. The official guide describes H-MEM as an implementation spec with a
runnable reference; it does not prescribe a hosted endpoint/token. No HTTP H-MEM API is invented.

Brindle adaptations:

- extensionless imports and repository formatting;
- strict indexed-access types where existing loop/regex bounds establish presence;
- incompatible embedding-dimension validation;
- a ledger hydration method for PostgreSQL persistence;
- equivalent snapshot field omission without an unused binding.

The documented canonical memory model, ranking formula, feedback deltas, conflict gate,
approval boundary and sleep guardrails remain intact. The reference's lightweight deterministic
hash embedder remains in use. This is not a neural semantic embedding provider and not a claim of
production-scale retrieval quality. Brindle's product does not expose generic memory editing,
dream approval, sleep or arbitrary mutations. Only verified recovery patterns are promoted.

`HmemRecoveryMemory` uses the documented HMEM.add/query/service APIs, hydrates canonical records
from PostgreSQL, and atomically saves state plus append-only ledger events. `persistDir` is not
used by the product. There is no second database or local JSON source of authority.

The official runner is preserved as `scripts/hmem-conformance/upstream-runner.ts.source` with
unchanged runtime assertions and the original vectors. Our typed launcher transpiles that fixture
with the existing TypeScript dependency into a temporary runner and supplies HMEM_IMPL pointing
at Brindle's engine. It adds no skips, altered expectations or TypeScript/lint suppressions.

Commands:

```bash
npm run hmem:conformance
npm run hmem:probe
```

The probe exercises the actual engine against a file-backed PostgreSQL/PGlite database, closes and
reopens that database, and verifies retrieval from persisted state. Sponsor truth/reasoning are
explicit MOCK fixtures in this probe. It is actual local H-MEM proof, not Zetaris/Nightshift LIVE
proof and not a claim of overall hackathon eligibility.
