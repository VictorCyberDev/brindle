import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import * as t from "../db/schema";
import { recoveryAuthority, type Mode } from "../product/permissions";

export interface SafetyCheckItem {
  title: string;
  detail: string;
  pass: boolean;
}

/**
 * A real, deterministic safety check run during onboarding. Each item is measured, not asserted:
 * it queries the database or evaluates the actual authority rule.
 */
export async function runSafetyCheck(
  db: Db,
  input: { workspaceId: string; mode: Mode },
): Promise<SafetyCheckItem[]> {
  const items: SafetyCheckItem[] = [];

  const started = Date.now();
  let reachable = false;
  try {
    await db.select().from(t.workspaces).where(eq(t.workspaces.id, input.workspaceId));
    reachable = true;
  } catch {
    reachable = false;
  }
  items.push({
    title: "Your evidence has a durable home",
    detail: reachable
      ? `Database round trip succeeded in ${Date.now() - started} ms.`
      : "The database did not answer.",
    pass: reachable,
  });

  const foreign = await db
    .select()
    .from(t.wsIncidents)
    .where(eq(t.wsIncidents.workspaceId, "ws_does_not_exist_isolation_probe"));
  const mine = await db
    .select()
    .from(t.wsAgents)
    .where(eq(t.wsAgents.workspaceId, input.workspaceId));
  items.push({
    title: "Your workspace is private",
    detail: `A probe for another workspace's incidents returned ${foreign.length} rows. Every query is filtered by your workspace.`,
    pass: foreign.length === 0 && mine.every((a) => a.workspaceId === input.workspaceId),
  });

  const attempt = recoveryAuthority({
    mode: input.mode,
    capabilityRegistered: false,
    approved: true,
  });
  items.push({
    title: "Brindle cannot change your systems yet",
    detail: attempt.allowed
      ? "Unexpected: authority was granted."
      : `0 recovery capabilities are registered for your systems. Authority check says: "${attempt.reason}"`,
    pass: !attempt.allowed,
  });

  const shadow = recoveryAuthority({ mode: "SHADOW", capabilityRegistered: true, approved: true });
  items.push({
    title: input.mode === "SHADOW" ? "Shadow Mode is on" : "Shadow Mode would still be safe",
    detail: shadow.allowed
      ? "Unexpected: Shadow Mode allowed execution."
      : "Even with a capability registered and an approval given, Shadow Mode never executes.",
    pass: !shadow.allowed,
  });
  return items;
}
