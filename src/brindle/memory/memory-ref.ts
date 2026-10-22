import { z } from "zod";
import { idSchema } from "../common/schemas";

export const MEMORY_KINDS = ["DECISION_CONTEXT", "RECOVERY_PATTERN"] as const;

/** Reference to a persisted memory item (the store itself is a Meterless boundary, see integrations/meterless). */
export const memoryRefSchema = z.strictObject({
  memoryId: idSchema,
  kind: z.enum(MEMORY_KINDS),
  version: z.number().int().min(1),
});

export type MemoryRef = z.infer<typeof memoryRefSchema>;
