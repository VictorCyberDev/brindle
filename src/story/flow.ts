import { runSuccessWorld } from "../demo/run";
import {
  ATLAS_SCENARIO,
  CEDAR_SCENARIO,
  injectCertificationRevoked,
  type RevocationScenario,
} from "../demo/temporal";
import { SECOND_INCIDENT_TRANSACTION } from "../demo/transactions";
import { assessCandidates, readMateriality } from "../services/materiality";
import { HmemRecoveryMemory, promoteVerifiedRecovery } from "../services/recovery-memory";
import {
  executeRecovery,
  planRecovery,
  readRecovery,
  SANDBOX_RECOVERY_ACTOR,
} from "../services/recovery";
import { readProof, verifyRecovery } from "../services/verification";
import type { IsolatedWorld } from "./world";

export { ATLAS_SCENARIO, CEDAR_SCENARIO, SANDBOX_RECOVERY_ACTOR };

export const incidentIdOf = (revisionId: string) => `incident:${revisionId}:v1`;

/** The advisory question H-MEM is asked before any plan is made. */
export const memoryQueryFor = (incidentId: string) => ({
  factKey: "certification.ISO-9001",
  correctedStatus: "REVOKED",
  targetTypes: [
    "purchase_order",
    "finance_approval",
    "receiving_allocation",
    "supplier_notification",
  ],
  excludeIncidentId: incidentId,
});

/** Step 1: the healthy agent world (Atlas PO-827 + unrelated control PO-901). */
export const buildHealthyWorld = (world: IsolatedWorld) => runSuccessWorld(world.deps);

/** Step 1 (second world): a distinct supplier and PO, decided a day later. */
export async function buildSecondWorld(world: IsolatedWorld, clock: Date) {
  world.setClock(clock);
  return runSuccessWorld(world.deps, [SECOND_INCIDENT_TRANSACTION]);
}

/** Steps 2-4: truth changes, impact is traced, materiality is determined. */
export async function openIncident(world: IsolatedWorld, scenario: RevocationScenario) {
  const temporal = await injectCertificationRevoked(world.handle.db, scenario);
  const assessment = await assessCandidates(world.deps, scenario.revisionId);
  return {
    temporal,
    assessment,
    materiality: await readMateriality(world.handle.db, scenario.revisionId),
  };
}

/** H-MEM is asked BEFORE planning; the current incident is excluded; the answer is advisory only. */
export const consultMemory = (world: IsolatedWorld, scenario: RevocationScenario) =>
  new HmemRecoveryMemory(world.handle.db).lookup(memoryQueryFor(incidentIdOf(scenario.revisionId)));

/** Steps 5-7: plan, execute with registered capabilities, verify with fresh independent reads. */
export async function recoverIncident(world: IsolatedWorld, scenario: RevocationScenario) {
  const db = world.handle.db;
  const plan = await planRecovery(db, scenario.revisionId, SANDBOX_RECOVERY_ACTOR);
  const execution = await executeRecovery(db, scenario.revisionId, SANDBOX_RECOVERY_ACTOR);
  const proof = await verifyRecovery(db, scenario.revisionId);
  return { plan, execution, proof };
}

/** Step 8: only a verified, RECOVERED incident can become recovery memory. */
export const rememberRecovery = (world: IsolatedWorld, scenario: RevocationScenario) =>
  promoteVerifiedRecovery(world.handle.db, incidentIdOf(scenario.revisionId));

export const readIncident = async (world: IsolatedWorld, scenario: RevocationScenario) => ({
  recovery: await readRecovery(world.handle.db, scenario.revisionId),
  proof: await readProof(world.handle.db, scenario.revisionId),
});
