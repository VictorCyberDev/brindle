import { writeFileSync } from "node:fs";
import { runAblation } from "../src/story/ablation";
import { runAllScenarios } from "../src/story/scenarios";

/** Executes the eight M6 scenarios against the real engine. Exit 1 if any claim fails. */
const record = process.argv.includes("--record");
const started = Date.now();
const results = await runAllScenarios();
for (const r of results) {
  console.log(`${r.passed ? "PASS" : "FAIL"}  ${r.id}. ${r.name}`);
  for (const c of r.claims)
    console.log(
      `   ${c.pass ? "✓" : "✗"} ${c.claim}${c.pass ? "" : `  ${JSON.stringify(c.evidence)}`}`,
    );
}
const ablation = await runAblation();
console.log("\nABLATION");
for (const a of ablation)
  console.log(
    `  ${a.component.padEnd(20)} ${a.measure}: with=${a.withSafeguard} without=${a.withoutSafeguard}`,
  );
const passed = results.filter((r) => r.passed).length;
console.log(
  `\n${passed}/${results.length} scenarios passed in ${((Date.now() - started) / 1000).toFixed(1)}s`,
);
if (record) {
  writeFileSync(
    "docs/evidence/M6_EVAL_RESULTS.json",
    JSON.stringify(
      { engine: "ACTUAL_BRINDLE_ENGINE_MOCK_TRUTH_AND_REASONER", results, ablation },
      null,
      2,
    ) + "\n",
  );
  console.log("recorded docs/evidence/M6_EVAL_RESULTS.json");
}
process.exit(passed === results.length ? 0 : 1);
