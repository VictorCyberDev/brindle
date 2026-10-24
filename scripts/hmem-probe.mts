/** Actual local H-MEM engine + persisted PostgreSQL probe; sponsor truth/reasoning remain labelled MOCK. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/db/schema";
import { createMockWorld } from "../src/test-support/world";
import { runSuccessWorld } from "../src/demo/run";
import { injectAtlasRevision, ATLAS_REVISION_ID } from "../src/demo/temporal";
import { assessCandidates } from "../src/services/materiality";
import { planRecovery, executeRecovery, SANDBOX_RECOVERY_ACTOR } from "../src/services/recovery";
import { verifyRecovery } from "../src/services/verification";
import {
  HmemRecoveryMemory,
  HMEM_UPSTREAM_SHA,
  promoteVerifiedRecovery,
  readRecoveryMemory,
} from "../src/services/recovery-memory";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "brindle-hmem-real-engine-"));
let pg: PGlite | undefined;
try {
  pg = new PGlite(path.join(temp, "postgres"));
  let db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  const fixture = await createMockWorld();
  const deps = { ...fixture.deps, db };
  await runSuccessWorld(deps);
  await injectAtlasRevision(db);
  await assessCandidates(deps, ATLAS_REVISION_ID);
  await planRecovery(db, ATLAS_REVISION_ID, SANDBOX_RECOVERY_ACTOR);
  await executeRecovery(db, ATLAS_REVISION_ID, SANDBOX_RECOVERY_ACTOR);
  const proof = await verifyRecovery(db, ATLAS_REVISION_ID);
  if (proof.receipt?.verdict !== "RECOVERED")
    throw new Error("Probe did not produce verified recovery");
  const memoryRef = await promoteVerifiedRecovery(db, proof.recovery!.incident.incidentId);
  const query = {
    factKey: "certification.ISO-9001",
    correctedStatus: "REVOKED",
    targetTypes: [
      "purchase_order",
      "finance_approval",
      "receiving_allocation",
      "supplier_notification",
    ],
  };
  const before = await new HmemRecoveryMemory(db).lookup(query);
  if (before.matches.length !== 1)
    throw new Error("Real engine did not retrieve verified experience");
  await pg.close();
  pg = new PGlite(path.join(temp, "postgres"));
  db = drizzle(pg, { schema });
  const after = await new HmemRecoveryMemory(db).lookup(query);
  if (after.matches.length !== 1)
    throw new Error("Engine state did not survive PostgreSQL restart");
  const irrelevant = await new HmemRecoveryMemory(db).lookup({
    ...query,
    correctedStatus: "VALID",
  });
  if (irrelevant.matches.length) throw new Error("Irrelevant pattern accepted");
  const state = await readRecoveryMemory(db);
  const evidence = {
    gate: "PASS",
    engine: "ACTUAL_LOCAL_SPEC_ENGINE",
    upstreamSha: HMEM_UPSTREAM_SHA,
    engineTransport: "documented local class API; no remote HTTP service asserted",
    sponsorTruthAndReasoning: "MOCK; not LIVE proof",
    memoryRef,
    receiptId: proof.receipt.receiptId,
    verdict: proof.receipt.verdict,
    requiredInvariants: proof.receipt.invariantResults.length,
    relevantHits: before.matches.length,
    restartedDatabaseHits: after.matches.length,
    irrelevantHits: irrelevant.matches.length,
    relevance: after.matches[0]!.relevance,
    retrievalTrace: after.trace,
    storedRecords: state.recordCount,
    ledgerRecords: state.ledgerCount,
    authority: "ADVISORY_ONLY",
    probedAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(evidence, null, 2));
  if (process.argv.includes("--record")) {
    fs.mkdirSync("docs/evidence", { recursive: true });
    fs.writeFileSync(
      "docs/evidence/M5_HMEM_ACTUAL_ENGINE_PROBE.json",
      JSON.stringify(evidence, null, 2) + "\n",
    );
  }
  await fixture.handle.close();
} finally {
  await pg?.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
