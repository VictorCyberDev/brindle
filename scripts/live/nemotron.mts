import { z } from "zod";
import { isNemotronFamily } from "../../src/config/env";
import {
  apiRootOf,
  demonstratesNemotron,
  OpenAiCompatibleNemotronReasoner,
  type ReasoningRoute,
} from "../../src/integrations/nemotron/openai-compatible";
import { banner, hostOf, loadConfigOrExit, refuse } from "../lib";

/**
 * LIVE probe of the reasoning runtime. Never runs in CI.
 * PRIMARY: Meterless Nightshift Runtime (GET /v1/models, POST /v1/chat/completions).
 * SECONDARY: direct NVIDIA, only when NEMOTRON_PROVIDER=nvidia.
 * A reachable route is NOT enough: the probe passes only if the request is shown to have been
 * executed by a Nemotron-family model.
 */
const config = loadConfigOrExit();
const n = config.nemotron;
if (n.status !== "configured") {
  refuse(
    "No reasoning runtime configured. Primary: METERLESS_BASE_URL, METERLESS_RUNTIME_TOKEN, METERLESS_MODEL. " +
      "Secondary (direct NVIDIA): NEMOTRON_PROVIDER=nvidia, NVIDIA_API_KEY, NEMOTRON_MODEL_ID.",
  );
}
const route: ReasoningRoute =
  n.provider === "meterless"
    ? {
        provider: "meterless",
        baseUrl: n.baseUrl,
        runtimeToken: n.runtimeToken,
        runtimeRoute: n.runtimeRoute,
      }
    : { provider: "nvidia", baseUrl: n.baseUrl, apiKey: n.apiKey, modelId: n.modelId };

banner(
  `Reasoning runtime probe (${n.provider === "meterless" ? "PRIMARY: Meterless Nightshift" : "SECONDARY: direct NVIDIA"})`,
  "LIVE",
);
console.log(`provider       : ${n.provider}`);
console.log(
  `endpoint       : ${hostOf(n.baseUrl)}  (${apiRootOf(route).replace(/^https?:\/\/[^/]+/, "")})`,
);
console.log(
  `requested      : ${n.provider === "meterless" ? `route ${n.runtimeRoute}` : `model ${n.modelId}`}`,
);

const reasoner = new OpenAiCompatibleNemotronReasoner({ route });
let failed = false;
try {
  const ids = await reasoner.listModels();
  const nemotron = ids.filter((m) => isNemotronFamily(m));
  console.log(
    `\n${apiRootOf(route).includes("/v1") ? "GET /v1/models" : "models"}: ${ids.length} id(s) exposed; Nemotron-family ids:`,
  );
  for (const m of nemotron.slice(0, 40)) console.log(`  ${m}`);
  if (nemotron.length === 0)
    console.log(
      "  (none listed by name; a route id may still be backed by Nemotron, which only the chat attribution below can show)",
    );
  if (!ids.includes(reasoner.requestedIdentifier)) {
    failed = true;
    console.error(
      `\nRequested identifier "${reasoner.requestedIdentifier}" is not exposed by this runtime. Choose one from /models.`,
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
  const a = reasoner.lastAttribution!;
  console.log(`\nruntime route        : ${a.runtimeRoute}`);
  console.log(
    `underlying model     : ${a.underlyingModel ?? "NOT DEMONSTRATED"}  [${a.underlyingModelSource}]`,
  );
  console.log(`provider request id  : ${result.providerRequestId ?? "(none exposed)"}`);
  console.log(`structured output    : ${JSON.stringify(result.output)}`);
  if (!demonstratesNemotron(a)) {
    failed = true;
    console.error(
      a.underlyingModel === null
        ? "\nUNPROVEN: the runtime answered, but only a routing identifier was reported. A reachable Meterless route is not evidence that Nemotron executed."
        : `\nNOT NEMOTRON: the reported underlying model "${a.underlyingModel}" is not Nemotron-family.`,
    );
  }
} catch (error) {
  failed = true;
  console.error(
    `\nReasoning probe FAILED: ${error instanceof Error ? `${error.name}: ${error.message}` : "unknown error"}`,
  );
}
console.log("\nHTTP calls (secret-free):");
for (const c of reasoner.calls) {
  console.log(
    `  ${c.operation.padEnd(16)} HTTP ${c.httpStatus}  request-id ${c.providerRequestId ?? "(none exposed)"}  reported-model ${c.reportedModel ?? "-"}`,
  );
}
console.log(
  failed
    ? "\nRESULT: FAILED (Nemotron-backed execution not demonstrated)"
    : "\nRESULT: OK (a Nemotron-family model demonstrably executed a real structured request)",
);
process.exit(failed ? 1 : 0);
