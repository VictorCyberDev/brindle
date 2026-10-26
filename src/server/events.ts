import { randomUUID } from "node:crypto";
import type { Db } from "../db/client";
import * as t from "../db/schema";

/**
 * First-party, privacy-conscious product events. Only a fixed set of event NAMES is recorded, with
 * the workspace id and a timestamp. No payload, no content, no personal data, no third-party tools.
 */
export const EVENT_NAMES = [
  "workspace_created",
  "agent_connected",
  "incident_opened",
  "recovery_planned",
  "recovery_verified",
  "demo_completed",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

export async function track(db: Db, name: EventName, workspaceId: string | null) {
  if (!EVENT_NAMES.includes(name)) return;
  try {
    await db.insert(t.productEvents).values({ id: `evt_${randomUUID()}`, workspaceId, name });
  } catch {
    // Analytics must never break a user flow.
  }
}
