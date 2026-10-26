import { describe, expect, it } from "vitest";
import { runAblation } from "./ablation";
import {
  canonicalRetroactiveRecovery,
  duplicateReplaySafety,
  futureOnlyTruthChange,
  hmemCrossIncidentTransfer,
  irreversibleConsequence,
  preconditionFailure,
  samePreservation,
  uncertainEscalation,
  type ScenarioResult,
} from "./scenarios";

const expectPass = (result: ScenarioResult) => {
  const failed = result.claims.filter((c) => !c.pass);
  expect(failed, JSON.stringify(failed)).toEqual([]);
  expect(result.claims.length).toBeGreaterThan(2);
};
const LONG = 180_000;

describe("M6 evaluation: eight scenarios against the real engine", () => {
  it(
    "1. canonical retroactive recovery",
    async () => expectPass(await canonicalRetroactiveRecovery()),
    LONG,
  );
  it("2. future-only truth change", async () => expectPass(await futureOnlyTruthChange()), LONG);
  it("3. SAME decisions are preserved", async () => expectPass(await samePreservation()), LONG);
  it("4. UNCERTAIN escalates safely", async () => expectPass(await uncertainEscalation()), LONG);
  it(
    "5. irreversible consequence handled honestly",
    async () => expectPass(await irreversibleConsequence()),
    LONG,
  );
  it(
    "6. precondition / compensator failure",
    async () => expectPass(await preconditionFailure()),
    LONG,
  );
  it("7. duplicate / replay safety", async () => expectPass(await duplicateReplaySafety()), LONG);
  it(
    "8. H-MEM cross-incident transfer (Incident A -> distinct Incident B)",
    async () => expectPass(await hmemCrossIncidentTransfer()),
    LONG,
  );
});

describe("M6 ablation: each safeguard prevents measurable harm", () => {
  it(
    "removing any one safeguard is measurably worse",
    async () => {
      const rows = await runAblation();
      expect(rows.map((r) => r.component)).toEqual([
        "Temporal filtering",
        "Materiality",
        "Fresh verification",
        "H-MEM",
      ]);
      const by = Object.fromEntries(rows.map((r) => [r.component, r]));
      expect(by["Temporal filtering"]!.withSafeguard).toBe(0);
      expect(by["Temporal filtering"]!.withoutSafeguard).toBeGreaterThan(0);
      expect(by["Materiality"]!.withSafeguard).toBe(0);
      expect(by["Materiality"]!.withoutSafeguard).toBeGreaterThan(0);
      expect(by["Fresh verification"]!.withSafeguard).toBe(0);
      expect(by["Fresh verification"]!.withoutSafeguard).toBeGreaterThan(0);
      expect(by["H-MEM"]!.withSafeguard).toBeGreaterThan(by["H-MEM"]!.withoutSafeguard);
    },
    LONG,
  );
});
