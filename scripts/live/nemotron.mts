import { z } from "zod";
import { OpenAiCompatibleNemotronReasoner } from "../../src/integrations/nemotron/openai-compatible";
import { banner, hostOf, loadConfigOrExit, refuse } from "../lib";

/** LIVE probe: lists the models this route exposes, then one real structured call. Never runs in CI. */
const config = loadConfigOrExit();
if (config.nemotron.status !== "configured") {
  refuse(
    "Nemotron is not configured (NEMOTRON_PROVIDER, NEMOTRON_MODEL_ID and that provider's credentials).",
  );
}
const n = config.nemotron;
banner("Nemotron structured-reasoning probe", "LIVE");
console.log(`provider    : ${n.provider}`);
console.log(`endpoint    : ${hostOf(n.baseUrl)}`);
console.log(`pinned model: ${n.modelId}`);

const reasoner = new OpenAiCompatibleNemotronReasoner({
  provider: n.provider,
  baseUrl: n.baseUrl,
  apiKey: n.apiKey,
  modelId: n.modelId,
});
let failed = false;
try {
  const models = await reasoner.listModels();
  const nemotron = models.filter((m) => /nemotron/i.test(m));
  console.log(`\nroute exposes ${models.length} model(s); Nemotron-family:`);
  for (const m of nemotron.slice(0, 40))
    console.log(`  ${m}${m === n.modelId ? "   <== pinned" : ""}`);
  if (!models.includes(n.modelId)) {
    failed = true;
    console.error(
      `\nPinned NEMOTRON_MODEL_ID is not exposed by this route. Choose one from the list above.`,
    );
  }

  const schema = z.strictObject({
    decision: z.enum(["PROCEED", "STOP"]),
    reason: z.string().min(1).max(200),
  });
  const result = await reasoner.reason({
    meta: {
      task: "DECISION",
      promptVersion: "probe-v1",
      schemaVersion: "probe-schema-v1",
      traceId: `probe:${Date.now()}`,
      input: {
        instruction:
          "A supplier certificate is VALID and the order is within policy. Choose PROCEED or STOP and give a one-sentence reason.",
      },
    },
    outputSchema: schema,
  });
  console.log(`\nserved model       : ${result.modelId}`);
  console.log(`provider request id: ${result.providerRequestId ?? "(none exposed)"}`);
  console.log(`structured output  : ${JSON.stringify(result.output)}`);
} catch (error) {
  failed = true;
  console.error(
    `\nNemotron probe FAILED: ${error instanceof Error ? `${error.name}: ${error.message}` : "unknown error"}`,
  );
}
console.log("\nHTTP calls (secret-free):");
for (const c of reasoner.calls) {
  console.log(
    `  ${c.operation.padEnd(16)} HTTP ${c.httpStatus}  request-id ${c.providerRequestId ?? "(none exposed)"}  served ${c.servedModel ?? "-"}`,
  );
}
console.log(
  failed ? "\nRESULT: FAILED" : "\nRESULT: OK (live Nemotron structured reasoning succeeded)",
);
process.exit(failed ? 1 : 0);
