import { z } from "zod";

/** Stable, opaque identifier. Identity is never derived from display text. */
export const idSchema = z.string().trim().min(1).max(200);

/** RFC 3339 / ISO 8601 instant with explicit offset. Contracts carry instants as strings. */
export const isoTimestampSchema = z.iso.datetime({ offset: true });

export const jsonValueSchema = z.json();
export const jsonObjectSchema = z.record(z.string(), z.json());

export const entityRefSchema = z.strictObject({
  entityType: idSchema,
  entityId: idSchema,
});

export type EntityRef = z.infer<typeof entityRefSchema>;

/** Milliseconds since epoch for an ISO timestamp (offset-aware, so safe to compare). */
export function toEpochMs(timestamp: string): number {
  return Date.parse(timestamp);
}
