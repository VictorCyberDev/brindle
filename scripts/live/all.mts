import { spawnSync } from "node:child_process";

/** Runs both live probes, then a full LIVE end-to-end run (after a sandbox-only reset). Never runs in CI. */
const steps: [string, string[]][] = [
  ["live:zetaris", ["scripts/live/zetaris.mts"]],
  ["live:nemotron", ["scripts/live/nemotron.mts"]],
  ["live end-to-end", ["scripts/demo-m1.mts", "--live", "--reset"]],
];
for (const [label, args] of steps) {
  console.log(`\n>>> ${label}`);
  const r = spawnSync("npx", ["tsx", "--env-file-if-exists=.env.local", ...args], {
    stdio: "inherit",
  });
  if (r.status !== 0) {
    console.error(`\n"${label}" did not succeed (exit ${r.status}). Stopping.`);
    process.exit(r.status ?? 1);
  }
}
console.log("\nALL LIVE CHECKS PASSED");
