# Naming risk: "Brindle"

The repository, package and many identifiers are named `brindle`. The product's display name in
this milestone is **Brindle Recovery**.

## Risk

"Brindle" is a common English word (a coat pattern) and is likely used by other companies and
trademarks, possibly in software. We have **not** run a trademark search, and nothing here is legal
advice. Do not assume the name is clear.

## What we did

- Display name is "Brindle Recovery" in the UI, titles and docs, which narrows the claim.
- The footer states that Brindle Recovery is a working name.
- We did **not** do a repository-wide rename. Identifiers (`brindle`, `BRINDLE_*`, `brk_` key prefix)
  stay stable so a later rename is a deliberate, reviewable change.
- No domain was bought. The beta is served from a Vercel URL.

## If the name has to change

1. Search a registry (USPTO, EUIPO, WIPO) and software directories before choosing.
2. Change the display name from one constant set: `Wordmark` in
   `src/components/brand/seam.tsx`, `metadata` in `src/app/layout.tsx`, and the docs under `content/`.
3. Keep `brk_` keys working. They are opaque and must not be invalidated by a rename.
4. Rename package identifiers last, in one mechanical commit.
