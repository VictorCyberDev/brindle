import { z } from "zod";
import {
  parseReasoningOutput,
  type NemotronReasoner,
  type ReasoningRequest,
  type ReasoningResult,
} from "./index";

/**
 * LIVE Nemotron reasoner over an OpenAI-compatible Chat Completions API.
 * Two documented routes use the same wire protocol:
 *  - provider "nvidia":    NVIDIA hosted API (default https://integrate.api.nvidia.com/v1), key from build.nvidia.com
 *  - provider "meterless": a Meterless Nightshift hotspot ("one OpenAI-compatible base URL and key", https://meterless.ai)
 *
 * No `tools`, `functions` or `tool_choice` are ever sent. The model returns
 * text; that text must parse as JSON and pass the caller's Zod schema before
 * any of it is used. Provider "reasoning" side-channels are discarded, never stored.
 */
export interface OpenAiCompatibleConfig {
  provider: "nvidia" | "meterless";
  baseUrl: string;
  apiKey: string;
  modelId: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface ReasoningCallRecord {
  operation: "chat.completions" | "models";
  httpStatus: number;
  providerRequestId: string | null;
  servedModel: string | null;
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
  if (start === -1 || end <= start)
    throw new ReasoningProviderError("model response contained no JSON object", null);
  try {
    return JSON.parse(withoutThinking.slice(start, end + 1));
  } catch {
    throw new ReasoningProviderError("model response was not valid JSON", null);
  }
}

export class OpenAiCompatibleNemotronReasoner implements NemotronReasoner {
  readonly calls: ReasoningCallRecord[] = [];
  private readonly doFetch: typeof fetch;

  constructor(private readonly config: OpenAiCompatibleConfig) {
    this.doFetch = config.fetch ?? fetch;
  }

  get provider(): string {
    return this.config.provider;
  }

  /** Lists the model ids this account/route actually exposes. Used to discover, never guess, a model id. */
  async listModels(): Promise<string[]> {
    const res = await this.request("models", "GET", "/models");
    const parsed = modelsSchema.safeParse(await res.json());
    if (!parsed.success)
      throw new ReasoningProviderError(
        "models response did not match the OpenAI-compatible shape",
        res.status,
      );
    this.calls[this.calls.length - 1]!.servedModel = null;
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
      model: this.config.modelId,
      temperature: 0,
      max_tokens: 4096,
      stream: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(request.meta.input) },
      ],
    });
    const body = completionSchema.safeParse(await res.json());
    if (!body.success)
      throw new ReasoningProviderError(
        "completion response did not match the OpenAI-compatible shape",
        res.status,
      );
    const record = this.calls[this.calls.length - 1]!;
    record.servedModel = body.data.model ?? null;

    const output = parseReasoningOutput(
      request.outputSchema,
      extractJsonObject(body.data.choices[0]!.message.content ?? ""),
    );
    return {
      output,
      modelId: body.data.model ?? this.config.modelId,
      traceId: request.meta.traceId,
      provider: this.config.provider,
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
      res = await this.doFetch(`${this.config.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 120_000),
      });
    } catch (error) {
      throw new ReasoningProviderError(
        `${this.config.provider} is not reachable (${error instanceof Error ? error.name : "network error"})`,
        null,
      );
    }
    this.calls.push({
      operation,
      httpStatus: res.status,
      providerRequestId: res.headers.get("x-request-id") ?? res.headers.get("nvcf-reqid"),
      servedModel: null,
    });
    if (!res.ok)
      throw new ReasoningProviderError(
        `${this.config.provider} ${operation} failed with HTTP ${res.status}`,
        res.status,
      );
    return res;
  }
}
