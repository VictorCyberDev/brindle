import type { AppConfig } from "../config/env";
import { providerModeOf } from "../config/env";
import { openDb, type DbHandle } from "../db/client";
import {
  OpenAiCompatibleNemotronReasoner,
  type ReasoningRoute,
} from "../integrations/nemotron/openai-compatible";
import { RowBackedTruthReader } from "../integrations/zetaris/reader";
import { ZetarisSqlRowSource } from "../integrations/zetaris/http";
import { MockFixtureTruthRowSource, MOCK_TRUTH_SOURCE_ID } from "./mock/mock-fixture-truth";
import { MOCK_MODEL_ID, MockDeterministicReasoner } from "./mock/mock-reasoner";
import type { WorldDeps } from "./run";

export class LiveNotConfiguredError extends Error {
  override name = "LiveNotConfiguredError";
}

export interface WorldRuntime {
  deps: WorldDeps;
  handle: DbHandle;
  /** Secret-free diagnostics for probes: every sponsor HTTP call made so far. */
  zetarisCalls: () => readonly unknown[];
  reasoningCalls: () => readonly unknown[];
}

/**
 * Chooses the provider set from configuration alone:
 *   BRINDLE_RUNTIME_MODE=live  -> real Zetaris + real Nemotron route, or a loud failure. Never a mock fallback.
 *   BRINDLE_RUNTIME_MODE=local -> labelled MOCK doubles. Credentials, if present, are ignored.
 */
export async function createWorldRuntime(config: AppConfig): Promise<WorldRuntime> {
  const handle = await openDb(config);
  const now = () => new Date();

  if (providerModeOf(config) === "LIVE") {
    if (config.zetaris.status !== "configured" || config.nemotron.status !== "configured") {
      await handle.close();
      throw new LiveNotConfiguredError(
        "LIVE mode requires configured Zetaris and a configured reasoning runtime (Meterless Nightshift is primary); refusing to fall back to mocks.",
      );
    }
    const source = new ZetarisSqlRowSource({
      restUrl: config.zetaris.restUrl,
      apiKey: config.zetaris.apiKey,
      orgId: config.zetaris.orgId,
      schema: config.zetaris.schema,
    });
    const n = config.nemotron;
    const route: ReasoningRoute =
      n.provider === "meterless"
        ? {
            provider: "meterless",
            baseUrl: n.baseUrl,
            runtimeToken: n.runtimeToken,
            runtimeRoute: n.runtimeRoute,
          }
        : { provider: "nvidia", baseUrl: n.baseUrl, apiKey: n.apiKey, modelId: n.modelId };
    const reasoner = new OpenAiCompatibleNemotronReasoner({ route });
    return {
      handle,
      zetarisCalls: () => source.calls,
      reasoningCalls: () => reasoner.calls,
      deps: {
        db: handle.db,
        truth: new RowBackedTruthReader(source, {
          sourceId: "zetaris",
          schema: config.zetaris.schema,
          now,
        }),
        reasoner,
        mode: "LIVE",
        truthSourceId: "zetaris",
        reasoningProvider: n.provider,
        configuredModelId: n.provider === "meterless" ? `route:${n.runtimeRoute}` : n.modelId,
      },
    };
  }

  return {
    handle,
    zetarisCalls: () => [],
    reasoningCalls: () => [],
    deps: {
      db: handle.db,
      truth: new RowBackedTruthReader(new MockFixtureTruthRowSource(), {
        sourceId: MOCK_TRUTH_SOURCE_ID,
        schema: "MOCK_SCHEMA",
        now,
      }),
      reasoner: new MockDeterministicReasoner(),
      mode: "MOCK",
      truthSourceId: MOCK_TRUTH_SOURCE_ID,
      reasoningProvider: "MOCK",
      configuredModelId: MOCK_MODEL_ID,
    },
  };
}

/** Process-wide runtime for the web app (survives Next dev reloads). */
const globalKey = Symbol.for("brindle.worldRuntime");
type Holder = { [globalKey]?: Promise<WorldRuntime> };

export function getSharedRuntime(config: AppConfig): Promise<WorldRuntime> {
  const holder = globalThis as Holder;
  holder[globalKey] ??= createWorldRuntime(config).catch((error) => {
    holder[globalKey] = undefined;
    throw error;
  });
  return holder[globalKey];
}
