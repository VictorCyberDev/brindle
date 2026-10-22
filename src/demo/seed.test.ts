import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEMO_TRANSACTIONS } from "./transactions";
import { seedToCsv, ZETARIS_SEED } from "./seed-data";

describe("Zetaris provisioning seed", () => {
  it("committed CSVs match the typed seed exactly (run `npm run zetaris:seed-csv` after changing the seed)", () => {
    for (const table of Object.keys(ZETARIS_SEED) as (keyof typeof ZETARIS_SEED)[]) {
      expect(readFileSync(`data/zetaris-seed/${table}.csv`, "utf8")).toBe(seedToCsv(table));
    }
  });

  it("has exactly three tables and a control supplier distinct from Atlas", () => {
    expect(Object.keys(ZETARIS_SEED).sort()).toEqual([
      "procurement_policy",
      "supplier_certifications",
      "supplier_master",
    ]);
    const [primary, control] = DEMO_TRANSACTIONS;
    expect(primary!.request).toMatchObject({ poId: "PO-827", supplierId: "SUP-ATLAS" });
    expect(control!.request).toMatchObject({ poId: "PO-901" });
    expect(control!.request.supplierId).not.toBe(primary!.request.supplierId);
  });
});
