import { z } from "zod";
import { idSchema, isoTimestampSchema } from "../common/schemas";

/**
 * The initial, closed set of edge types. Adding a type is an architectural
 * change (ADR + milestone), not a runtime option.
 */
export const CONSEQUENCE_EDGE_TYPES = [
  "INFORMED",
  "DERIVED_FROM",
  "CAUSED",
  "MUTATED",
  "DEPENDS_ON",
  "SUPERSEDES",
] as const;

export const consequenceEdgeTypeSchema = z.enum(CONSEQUENCE_EDGE_TYPES);
export type ConsequenceEdgeType = z.infer<typeof consequenceEdgeTypeSchema>;

export const consequenceEdgeSchema = z
  .strictObject({
    edgeId: idSchema,
    fromNodeId: idSchema,
    toNodeId: idSchema,
    type: consequenceEdgeTypeSchema,
    createdAt: isoTimestampSchema,
  })
  .refine((e) => e.fromNodeId !== e.toNodeId, {
    message: "self-referential edges are not allowed",
    path: ["toNodeId"],
  });

export type ConsequenceEdge = z.infer<typeof consequenceEdgeSchema>;
