/** Run the pinned, unmodified upstream runtime assertions. Source fixture is compiled as test data. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "brindle-hmem-conformance-"));
try {
  const source = fs.readFileSync("scripts/hmem-conformance/upstream-runner.ts.source", "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  fs.mkdirSync(path.join(temp, "vectors"));
  fs.copyFileSync(
    "scripts/hmem-conformance/vectors/vectors.json",
    path.join(temp, "vectors/vectors.json"),
  );
  fs.writeFileSync(path.join(temp, "runner.mjs"), compiled);
  const run = spawnSync(process.execPath, ["--import", "tsx", path.join(temp, "runner.mjs")], {
    env: { ...process.env, HMEM_IMPL: path.resolve("src/integrations/hmem/engine/index.ts") },
    stdio: "inherit",
  });
  process.exitCode = run.status ?? 2;
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
