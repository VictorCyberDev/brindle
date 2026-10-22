import { providerModeOf } from "../src/config/env";
import { PartialSandboxStateError, runSuccessWorld } from "../src/demo/run";
import { createWorldRuntime } from "../src/demo/runtime";
import { readDemoState, resetSandbox } from "../src/demo/store";
import { banner, loadConfigOrExit } from "./lib";

/**
 * Runs the M1 successful world in the mode selected by BRINDLE_RUNTIME_MODE
 * (local = MOCK, live = LIVE). `--reset` first clears SANDBOX state only.
 * `--live` forces live mode. MOCK output is never sponsor evidence.
 */
const forceLive = process.argv.includes("--live");
const config = loadConfigOrExit(forceLive ? { BRINDLE_RUNTIME_MODE: "live" } : {});
const mode = providerModeOf(config);
banner("Brindle M1 successful agent world (SANDBOX BUSINESS SYSTEM)", mode);
if (mode === "MOCK")
  console.log(
    "No sponsor is contacted. Truth is a local fixture; reasoning is a deterministic stand-in.\n",
  );

const runtime = await createWorldRuntime(config);
let code = 0;
try {
  if (process.argv.includes("--reset")) {
    await resetSandbox(runtime.deps.db);
    console.log("sandbox reset (Brindle tables only; Zetaris untouched)");
  }
  const result = await runSuccessWorld(runtime.deps);
  console.log(`\nresult: ${result.status}`);
  if (result.status === "BLOCKED") {
    console.log(
      `blocked by deterministic gate: ${result.actor} on ${result.poId}: ${result.code} ${result.reasons.join(",")}`,
    );
    code = 1;
  }
  for (const s of result.steps) {
    console.log(
      `  ${s.actor.padEnd(11)} ${s.poId}  ${s.decisionId}  model=${s.servedModelId}  provider-request-id=${s.providerRequestId ?? "-"}`,
    );
  }
  const state = await readDemoState(runtime.deps.db);
  console.log("\nsandbox state:");
  for (const p of state.purchaseOrders) {
    console.log(
      `  ${p.po.poId} ${p.po.status}  supplier=${p.po.supplierName}  receipts=${p.decisionReceiptCount}  notification=${p.notification ? "RECORDED — SANDBOX" : "-"}`,
    );
  }
  console.log(`decision receipts: ${state.decisionReceiptCount}`);
  console.log(
    `zetaris http calls: ${runtime.zetarisCalls().length}   reasoning http calls: ${runtime.reasoningCalls().length}`,
  );
} catch (error) {
  code = error instanceof PartialSandboxStateError ? 4 : 1;
  console.error(
    `\nFAILED: ${error instanceof Error ? `${error.name}: ${error.message}` : "unknown error"}`,
  );
} finally {
  await runtime.handle.close();
}
process.exit(code);
