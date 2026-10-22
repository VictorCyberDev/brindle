import { z } from "zod";
import { jsonObjectSchema } from "../../brindle/common/schemas";
import { IntegrationNotAvailableError } from "../errors";

/**
 * Nemotron reasons about materiality, planning and evaluation (and, from M1,
 * decisions). It returns STRUCTURED, SCHEMA-VALIDATED output only. It has no
 * tool-calling surface: it cannot invent or execute mutations. Anything it
 * proposes is re-validated by deterministic code before it can matter.
 */
export const REASONING_TASKS = ["DECISION", "MATERIALITY", "PLANNING", "EVALUATION"] as const;
export type ReasoningTask = (typeof REASONING_TASKS)[number];

export const reasoningRequestMetaSchema = z.strictObject({
  task: z.enum(REASONING_TASKS),
  promptVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  traceId: z.string().min(1),
  input: jsonObjectSchema,
});

export interface ReasoningRequest<S extends z.ZodType> {
  meta: z.infer<typeof reasoningRequestMetaSchema>;
  /** The contract the model output must satisfy. */
  outputSchema: S;
}

export type UnderlyingModelSource =
  /** The runtime itself reported a non-route model identifier for this very request. */
  | "PROVIDER_REPORTED"
  /** Direct provider call: the requested model is the model. */
  | "REQUESTED_DIRECT"
  /** Only a routing identifier is known. Does NOT prove which model executed. */
  | "UNPROVEN";

export interface ReasoningResult<T> {
  output: T;
  /**
   * The id recorded on DecisionReceipts: the underlying model when known,
   * otherwise `route:<runtimeRoute>` so a route can never pass as a model.
   */
  modelId: string;
  traceId: string;
  /** Which runtime path served the request (e.g. "meterless/auto", "nvidia-direct"). A route is not a model. */
  runtimeRoute?: string;
  /** The model that actually executed, or null if not demonstrated. */
  underlyingModel?: string | null;
  underlyingModelSource?: UnderlyingModelSource;
  /** Reasoning provider kind: "meterless" | "nvidia". Absent for test doubles. */
  provider?: string;
  /** Provider-side correlation id, if the provider exposes one. */
  providerRequestId?: string | null;
}

export interface NemotronReasoner {
  reason<S extends z.ZodType>(request: ReasoningRequest<S>): Promise<ReasoningResult<z.output<S>>>;
}

export const NEMOTRON_OPERATIONS = [
  "reason",
] as const satisfies readonly (keyof NemotronReasoner)[];

export class ReasoningOutputInvalidError extends Error {
  override name = "ReasoningOutputInvalidError";
  constructor(public readonly issues: readonly string[]) {
    super(`Model output violated its schema: ${issues.join("; ")}`);
  }
}

/** The gate every raw model output must pass through. */
export function parseReasoningOutput<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ReasoningOutputInvalidError(
      parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    );
  }
  return parsed.data;
}

export function createUnavailableNemotronReasoner(reason: string): NemotronReasoner {
  return {
    reason() {
      return Promise.reject(new IntegrationNotAvailableError("nemotron", "reason", reason));
    },
  };
}
