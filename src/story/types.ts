import type { RevocationScenario } from "../demo/temporal";

/** Pure types and the recording version. Importing this never pulls the engine into the app bundle. */
export const STORY_VERSION = 1;

export type Json = ReturnType<typeof JSON.parse>;

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
