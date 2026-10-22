import { z } from "zod";
import { idSchema, isoTimestampSchema, jsonObjectSchema } from "../common/schemas";

export const CONSEQUENCE_NODE_KINDS = [
  "TRUTH_VERSION",
  "MEMORY",
  "DECISION",
  "ACTION",
  "BUSINESS_OBJECT",
] as const;

export const consequenceNodeKindSchema = z.enum(CONSEQUENCE_NODE_KINDS);
export type ConsequenceNodeKind = z.infer<typeof consequenceNodeKindSchema>;

export const consequenceNodeSchema = z.strictObject({
  nodeId: idSchema,
  kind: consequenceNodeKindSchema,
  /** Identity of the underlying thing (truth version id, decision id, ...). Unique per kind. */
  refId: idSchema,
  label: z.string().trim().min(1).max(300).optional(),
  attributes: jsonObjectSchema.default({}),
  createdAt: isoTimestampSchema,
});

export type ConsequenceNode = z.infer<typeof consequenceNodeSchema>;
