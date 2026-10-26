import { readDemoState } from "../demo/store";
import {
  readTemporalDemo,
  ATLAS_SCENARIO,
  CEDAR_SCENARIO,
  type RevocationScenario,
} from "../demo/temporal";
import { readMateriality } from "../services/materiality";
import { readProof } from "../services/verification";
import { readRecovery } from "../services/recovery";
import {
  buildHealthyWorld,
  buildSecondWorld,
  consultMemory,
  openIncident,
  recoverIncident,
  rememberRecovery,
  readIncident,
} from "./flow";
import { createIsolatedWorld, EVAL_CLOCK, type IsolatedWorld } from "./world";
import { planRecovery, executeRecovery, SANDBOX_RECOVERY_ACTOR } from "../services/recovery";
import { verifyRecovery } from "../services/verification";

/*
 * One real run of the Brindle engine, captured phase by phase as plain JSON. It is the data behind
 * the public demo tour and the Demo Workspace. Truth and reasoning are labelled MOCK; the engine
 * (temporal graph, materiality, recovery, fresh verification, H-MEM) is the real implementation.
 */
export const STORY_VERSION = 1;

type Json = ReturnType<typeof JSON.parse>;
const plain = <T>(value: T): Json => JSON.parse(JSON.stringify(value));

export interface IncidentPhases {
  key: "A" | "B";
  scenario: RevocationScenario;
  incidentId: string;
  supplierName: string;
  /** Impact + materiality, before any plan exists. */
  opened: { temporal: Json; materiality: Json };
  /** What H-MEM returned BEFORE planning. */
  memoryBeforePlanning: Json;
  /** The recovery plan, before execution. */
  planned: { recovery: Json };
  /** After execution and independent verification. */
  recovered: { recovery: Json; proof: Json };
  /** The pattern H-MEM stored after verification. */
  remembered: Json;
}

export interface StorySnapshot {
  version: number;
  engine: "ACTUAL_BRINDLE_ENGINE";
  truthAndReasoning: "MOCK";
  computedAt: string;
  healthyWorld: Json;
  incidents: [IncidentPhases, IncidentPhases];
  /** Control PO-901 state at the end, to prove it was never touched. */
  controlAtEnd: Json;
}

async function captureIncident(
  world: IsolatedWorld,
  key: "A" | "B",
  scenario: RevocationScenario,
  supplierName: string,
): Promise<IncidentPhases> {
  const db = world.handle.db;
  const opened = await openIncident(world, scenario);
  const memory = await consultMemory(world, scenario);
  await planRecovery(db, scenario.revisionId, SANDBOX_RECOVERY_ACTOR);
  const planned = await readRecovery(db, scenario.revisionId);
  await executeRecovery(db, scenario.revisionId, SANDBOX_RECOVERY_ACTOR);
  await verifyRecovery(db, scenario.revisionId);
  const after = await readIncident(world, scenario);
  const remembered = await rememberRecovery(world, scenario);
  return {
    key,
    scenario,
    incidentId: `incident:${scenario.revisionId}:v1`,
    supplierName,
    opened: {
      temporal: plain(await readTemporalDemo(db, scenario.revisionId)),
      materiality: plain(opened.materiality),
    },
    memoryBeforePlanning: plain(memory),
    planned: { recovery: plain(planned) },
    recovered: { recovery: plain(after.recovery), proof: plain(after.proof) },
    remembered: plain(remembered),
  };
}

export async function computeStory(): Promise<StorySnapshot> {
  const world = await createIsolatedWorld({ clock: EVAL_CLOCK });
  try {
    await buildHealthyWorld(world);
    const healthyWorld = plain(await readDemoState(world.handle.db));
    const a = await captureIncident(world, "A", ATLAS_SCENARIO, "Atlas Components");
    await buildSecondWorld(world, new Date(EVAL_CLOCK.getTime() + 86_400_000));
    const b = await captureIncident(world, "B", CEDAR_SCENARIO, "Cedarline Bearings");
    return {
      version: STORY_VERSION,
      engine: "ACTUAL_BRINDLE_ENGINE",
      truthAndReasoning: "MOCK",
      computedAt: new Date().toISOString(),
      healthyWorld,
      incidents: [a, b],
      controlAtEnd: plain(
        (await readDemoState(world.handle.db)).purchaseOrders.find((p) => p.po.poId === "PO-901"),
      ),
    };
  } finally {
    await world.close();
  }
}

/** Single-flight so concurrent visitors never start two engine runs at once. */
let inflight: Promise<StorySnapshot> | null = null;
export function recomputeStory(): Promise<StorySnapshot> {
  inflight ??= computeStory().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Facts that must stay true whenever the committed snapshot is regenerated. Excludes clocks. */
export function storyDigest(s: StorySnapshot) {
  return s.incidents.map((i) => ({
    key: i.key,
    verdicts: (i.opened.materiality.assessments as { assessment: { result: string } }[])
      .map((a) => a.assessment.result)
      .sort(),
    steps: (i.planned.recovery.steps as { capabilityId: string }[]).map((x) => x.capabilityId),
    status: i.recovered.recovery.incident.status,
    invariants: (
      i.recovered.proof.receipt.invariantResults as { invariantId: string; status: string }[]
    ).map((r) => `${r.invariantId}:${r.status}`),
    memoryMatches: (i.memoryBeforePlanning.matches as unknown[]).length,
  }));
}
export { readMateriality, readProof, recoverIncident };
