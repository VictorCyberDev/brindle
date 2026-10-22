import { z } from "zod";
import { isNemotronFamily } from "../../config/env";
import {
  type NemotronReasoner,
  parseReasoningOutput,
  type ReasoningRequest,
  type ReasoningResult,
  type UnderlyingModelSource,
} from "./index";

/**
 * LIVE reasoner over an OpenAI-compatible Chat Completions API. Two routes:
 *
 *  PRIMARY  "meterless": Brindle -> Meterless Nightshift Runtime -> NVIDIA provider configured
 *           inside Nightshift -> Nemotron-backed lane.
 *             GET  {base}/v1/models
 *             POST {base}/v1/chat/completions
 *             Authorization: Bearer <runtime token>, meterless-app: brindle, meterless-scope: user,
 *             Content-Type/Accept: application/json
 *  SECONDARY "nvidia": direct NVIDIA hosted API. Receives NO Meterless headers.
 *
 * No `tools`, `functions` or `tool_choice` are ever sent. The model returns
 * text; that text must parse as JSON and pass the caller's Zod schema before
 * any of it is used. Provider "reasoning" side-channels are discarded.
 *
 * ROUTE != MODEL. A Meterless routing identifier (e.g. "meterless/auto") says
 * which runtime lane was requested, not which model ran. `underlyingModel` is
 * only set when the runtime reports a non-route model for the request.
 */
export type ReasoningRoute =
  | {
      provider: "meterless";
      /** Origin of the Nightshift Runtime (endpoints are /v1/...). */
      baseUrl: string;
      runtimeToken: string;
      runtimeRoute: string;
    }
  | {
      provider: "nvidia";
      /** Includes the /v1 path. */
      baseUrl: string;
      apiKey: string;
      modelId: string;
    };

export interface OpenAiCompatibleConfig {
  route: ReasoningRoute;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface ReasoningCallRecord {
  operation: "chat.completions" | "models";
  httpStatus: number;
  providerRequestId: string | null;
  /** The `model` field the runtime/provider returned, verbatim. For Meterless this may be just a route id. */
  reportedModel: string | null;
}

export class ReasoningProviderError extends Error {
  override name = "ReasoningProviderError";
  constructor(
    message: string,
    public readonly httpStatus: number | null,
  ) {
    super(message);
  }
}

export interface ModelAttribution {
  runtimeRoute: string;
  underlyingModel: string | null;
  underlyingModelSource: UnderlyingModelSource;
}

/** True for identifiers that name a Meterless routing lane rather than a concrete model. */
export function isMeterlessRouteIdentifier(id: string, requestedRoute: string): boolean {
  return id === requestedRoute || /^meterless(\/|$)/i.test(id);
}

/** Pure attribution rule: what may be claimed about which model ran. */
export function attributeModel(
  route: ReasoningRoute,
  reportedModel: string | null,
): ModelAttribution {
  if (route.provider === "nvidia") {
    return {
      runtimeRoute: "nvidia-direct",
      underlyingModel: reportedModel ?? route.modelId,
      underlyingModelSource: reportedModel ? "PROVIDER_REPORTED" : "REQUESTED_DIRECT",
    };
  }
  if (reportedModel && !isMeterlessRouteIdentifier(reportedModel, route.runtimeRoute)) {
    return {
      runtimeRoute: route.runtimeRoute,
      underlyingModel: reportedModel,
      underlyingModelSource: "PROVIDER_REPORTED",
    };
  }
  return {
    runtimeRoute: route.runtimeRoute,
    underlyingModel: null,
    underlyingModelSource: "UNPROVEN",
  };
}

/** Acceptance rule: the underlying model must be demonstrated AND Nemotron-family. */
export function demonstratesNemotron(a: ModelAttribution): boolean {
  return (
    a.underlyingModel !== null &&
    a.underlyingModelSource !== "UNPROVEN" &&
    isNemotronFamily(a.underlyingModel)
  );
}

/** Headers for a request on a route. Meterless-specific headers are sent ONLY to Meterless. */
export function buildHeaders(route: ReasoningRoute): Record<string, string> {
  if (route.provider === "meterless") {
    return {
      Authorization: `Bearer ${route.runtimeToken}`,
      "meterless-app": "brindle",
      "meterless-scope": "user",
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }
  return {
    Authorization: `Bearer ${route.apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export const apiRootOf = (route: ReasoningRoute) =>
  route.provider === "meterless" ? `${route.baseUrl}/v1` : route.baseUrl;

const completionSchema = z.object({
  model: z.string().optional(),
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
});

const modelsSchema = z.object({ data: z.array(z.object({ id: z.string() })) });

/** Pulls the JSON object out of model text, tolerating <think> blocks and code fences. */
export function extractJsonObject(text: string): unknown {
  const withoutThinking = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const start = withoutThinking.indexOf("{");
  const end = withoutThinking.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new ReasoningProviderError("model response contained no JSON object", null);
  }
  try {
    return JSON.parse(withoutThinking.slice(start, end + 1));
  } catch {
    throw new ReasoningProviderError("model response was not valid JSON", null);
  }
}

export class OpenAiCompatibleNemotronReasoner implements NemotronReasoner {
  readonly calls: ReasoningCallRecord[] = [];
  /** Attribution of the most recent chat completion, for probes and evidence. */
  lastAttribution: ModelAttribution | null = null;
  private readonly doFetch: typeof fetch;

  constructor(private readonly config: OpenAiCompatibleConfig) {
    this.doFetch = config.fetch ?? fetch;
  }

  get provider(): "meterless" | "nvidia" {
    return this.config.route.provider;
  }

  get requestedIdentifier(): string {
    const r = this.config.route;
    return r.provider === "meterless" ? r.runtimeRoute : r.modelId;
  }

  /** Lists the ids this runtime/account exposes (GET /v1/models). Used to discover, never guess. */
  async listModels(): Promise<string[]> {
    const res = await this.request("models", "GET", "/models");
    const parsed = modelsSchema.safeParse(await res.json());
    if (!parsed.success) {
      throw new ReasoningProviderError(
        "models response did not match the OpenAI-compatible shape",
        res.status,
      );
    }
    return parsed.data.data.map((m) => m.id);
  }

  async reason<S extends z.ZodType>(
    request: ReasoningRequest<S>,
  ): Promise<ReasoningResult<z.output<S>>> {
    const jsonSchema = JSON.stringify(z.toJSONSchema(request.outputSchema));
    const system =
      `You are a structured reasoning component (task: ${request.meta.task}) inside a business-control system. ` +
      `You advise; deterministic code decides. You have no tools. ` +
      `Respond with ONLY one JSON object that conforms to this JSON Schema, with no prose and no markdown:\n${jsonSchema}`;
    const res = await this.request("chat.completions", "POST", "/chat/completions", {
      model: this.requestedIdentifier,
      temperature: 0,
      max_tokens: 4096,
      stream: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(request.meta.input) },
      ],
    });
    const body = completionSchema.safeParse(await res.json());
    if (!body.success) {
      throw new ReasoningProviderError(
        "completion response did not match the OpenAI-compatible shape",
        res.status,
      );
    }
    const record = this.calls[this.calls.length - 1]!;
    record.reportedModel = body.data.model ?? null;
    const attribution = attributeModel(this.config.route, record.reportedModel);
    this.lastAttribution = attribution;

    const output = parseReasoningOutput(
      request.outputSchema,
      extractJsonObject(body.data.choices[0]!.message.content ?? ""),
    );
    return {
      output,
      modelId: attribution.underlyingModel ?? `route:${attribution.runtimeRoute}`,
      traceId: request.meta.traceId,
      runtimeRoute: attribution.runtimeRoute,
      underlyingModel: attribution.underlyingModel,
      underlyingModelSource: attribution.underlyingModelSource,
      provider: this.config.route.provider,
      providerRequestId: record.providerRequestId,
    };
  }

  private async request(
    operation: ReasoningCallRecord["operation"],
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<Response> {
    let res: Response;
    try {
      res = await this.doFetch(`${apiRootOf(this.config.route)}${path}`, {
        method,
        headers: buildHeaders(this.config.route),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 120_000),
      });
    } catch (error) {
      throw new ReasoningProviderError(
        `${this.config.route.provider} is not reachable (${error instanceof Error ? error.name : "network error"})`,
        null,
      );
    }
    this.calls.push({
      operation,
      httpStatus: res.status,
      providerRequestId: res.headers.get("x-request-id") ?? res.headers.get("nvcf-reqid"),
      reportedModel: null,
    });
    if (!res.ok) {
      throw new ReasoningProviderError(
        `${this.config.route.provider} ${operation} failed with HTTP ${res.status}`,
        res.status,
      );
    }
    return res;
  }
}
