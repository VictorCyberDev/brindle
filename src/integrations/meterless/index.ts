import { z } from "zod";
import { jsonObjectSchema } from "../../brindle/common/schemas";
import type { MemoryRef } from "../../brindle/memory/memory-ref";
import { IntegrationNotAvailableError } from "../errors";

/**
 * Meterless boundary: (1) model/runtime invocation and (2) Brindle's own
 * persistent recovery memory. Neither is a business-mutation channel.
 */
export const modelInvocationSchema = z.strictObject({
  modelId: z.string().min(1),
  traceId: z.string().min(1),
  messages: z
    .array(z.strictObject({ role: z.enum(["system", "user"]), content: z.string() }))
    .min(1),
  /** JSON Schema the response must conform to. No tools parameter exists by design. */
  responseJsonSchema: jsonObjectSchema,
});

export type ModelInvocation = z.infer<typeof modelInvocationSchema>;

export interface RawModelResponse {
  modelId: string;
  traceId: string;
  /** Unvalidated: must pass through parseReasoningOutput before use. */
  content: unknown;
}

export interface RecoveryMemoryEntry {
  kind: MemoryRef["kind"];
  key: string;
  payload: Record<string, unknown>;
}

export interface MeterlessRuntime {
  invokeModel(invocation: ModelInvocation): Promise<RawModelResponse>;
}

export interface MeterlessRecoveryMemory {
  remember(entry: RecoveryMemoryEntry): Promise<MemoryRef>;
  recall(query: { kind: MemoryRef["kind"]; key: string }): Promise<RecoveryMemoryEntry[]>;
}

export type MeterlessClient = MeterlessRuntime & MeterlessRecoveryMemory;

/** Exhaustive list of operations the Meterless boundary may expose. */
export const METERLESS_OPERATIONS = [
  "invokeModel",
  "remember",
  "recall",
] as const satisfies readonly (keyof MeterlessClient)[];

export function createUnavailableMeterlessClient(reason: string): MeterlessClient {
  const fail = (operation: string) => () =>
    Promise.reject(new IntegrationNotAvailableError("meterless", operation, reason));
  return {
    invokeModel: fail("invokeModel"),
    remember: fail("remember"),
    recall: fail("recall"),
  };
}
