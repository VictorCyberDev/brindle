import { FACT_KEYS } from "../../src/brindle/business/eligibility";
import { POLICY_ID } from "../../src/demo/seed-data";
import { RowBackedTruthReader } from "../../src/integrations/zetaris/reader";
import { ZetarisSqlRowSource } from "../../src/integrations/zetaris/http";
import { banner, hostOf, loadConfigOrExit, refuse } from "../lib";

/** LIVE probe: one real read-only round trip to Zetaris. Never runs in CI. */
const config = loadConfigOrExit();
if (config.zetaris.status !== "configured") {
  refuse(
    "Zetaris is not configured (ZETARIS_REST_URL, ZETARIS_API_KEY, ZETARIS_ORG_ID, ZETARIS_SCHEMA).",
  );
}
const z = config.zetaris;
banner("Zetaris read-only truth probe", "LIVE");
console.log(`REST host   : ${hostOf(z.restUrl)}`);
console.log(`org id      : ${z.orgId}`);
console.log(`schema      : ${z.schema}`);

const source = new ZetarisSqlRowSource({
  restUrl: z.restUrl,
  apiKey: z.apiKey,
  orgId: z.orgId,
  schema: z.schema,
});
const reader = new RowBackedTruthReader(source, {
  sourceId: "zetaris",
  schema: z.schema,
  now: () => new Date(),
});

let failed = false;
try {
  for (const subject of [
    { entityType: "supplier", entityId: "SUP-ATLAS" },
    { entityType: "supplier", entityId: "SUP-BOREAL" },
    { entityType: "policy", entityId: POLICY_ID },
  ]) {
    const assertions = await reader.readAssertions({ subject });
    console.log(
      `\n${subject.entityType} ${subject.entityId}: ${assertions.length} normalized assertion(s)`,
    );
    for (const a of assertions) {
      console.log(
        `  ${a.factKey} = ${JSON.stringify(a.value)}  valid ${a.validFrom} → ${a.validTo ?? "open"}`,
      );
    }
    if (assertions.length === 0) {
      failed = true;
      console.log(
        "  NO ROWS. Provision the seed data first: see docs/M1_SPONSOR_INTEGRATION.md (Zetaris provisioning).",
      );
    }
    if (
      subject.entityId === "SUP-ATLAS" &&
      !assertions.some((a) => a.factKey === FACT_KEYS.supplierEnabled)
    )
      failed = true;
  }
} catch (error) {
  failed = true;
  console.error(
    `\nZetaris probe FAILED: ${error instanceof Error ? `${error.name}: ${error.message}` : "unknown error"}`,
  );
}

console.log("\nHTTP calls (secret-free):");
for (const c of source.calls) {
  console.log(
    `  POST /sql-editor/sqls/run HTTP ${c.httpStatus}  X-Request-ID ${c.requestId}  queryId ${c.queryId}  server-id ${c.serverRequestId ?? "(none exposed)"}`,
  );
}
console.log(failed ? "\nRESULT: FAILED" : "\nRESULT: OK (live Zetaris read succeeded)");
process.exit(failed ? 1 : 0);
