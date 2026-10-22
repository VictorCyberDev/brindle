import { mkdirSync, writeFileSync } from "node:fs";
import { seedToCsv, ZETARIS_SEED } from "../src/demo/seed-data";

/** Regenerates data/zetaris-seed/*.csv, the files to upload into Zetaris. */
mkdirSync("data/zetaris-seed", { recursive: true });
for (const table of Object.keys(ZETARIS_SEED) as (keyof typeof ZETARIS_SEED)[]) {
  writeFileSync(`data/zetaris-seed/${table}.csv`, seedToCsv(table));
  console.log(`wrote data/zetaris-seed/${table}.csv`);
}
