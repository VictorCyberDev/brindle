import { createWorldRuntime } from "../src/demo/runtime";
import { resetSandbox } from "../src/demo/store";
import { loadConfigOrExit } from "./lib";

/** Clears Brindle's SANDBOX tables. It has no Zetaris access and cannot alter enterprise truth. */
const runtime = await createWorldRuntime(loadConfigOrExit());
try {
  await resetSandbox(runtime.deps.db);
  console.log("sandbox reset (Brindle tables only)");
} finally {
  await runtime.handle.close();
}
