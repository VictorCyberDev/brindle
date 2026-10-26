import { and, asc, eq, sql } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";
import type { Db } from "../db/client";
import * as t from "../db/schema";
import { availableModes, type Mode, type Role } from "../product/permissions";

export interface Membership {
  workspaceId: string;
  name: string;
  slug: string;
  kind: "STANDARD" | "DEMO";
  mode: Mode;
  role: Role;
  settings: Record<string, unknown>;
}

export class WorkspaceRuleViolation extends Error {
  override name = "WorkspaceRuleViolation";
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "workspace";

export async function createWorkspace(
  db: Db,
  input: { userId: string; name: string; kind?: "STANDARD" | "DEMO"; mode?: Mode },
): Promise<Membership> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80)
    throw new WorkspaceRuleViolation("Workspace name must be 2-80 characters.");
  const kind = input.kind ?? "STANDARD";
  const mode = input.mode ?? "SHADOW";
  if (!availableModes(kind).includes(mode)) {
    throw new WorkspaceRuleViolation("That recovery mode is not available for this workspace.");
  }
  const id = `ws_${randomUUID()}`;
  const slug = `${slugify(name)}-${randomBytes(3).toString("hex")}`;
  await db.transaction(async (tx) => {
    await tx
      .insert(t.workspaces)
      .values({ id, name, slug, kind, recoveryMode: mode, createdBy: input.userId });
    await tx
      .insert(t.workspaceMembers)
      .values({ workspaceId: id, userId: input.userId, role: "OWNER" });
  });
  return { workspaceId: id, name, slug, kind, mode, role: "OWNER", settings: {} };
}

export async function listMemberships(db: Db, userId: string): Promise<Membership[]> {
  const rows = await db
    .select({ w: t.workspaces, role: t.workspaceMembers.role })
    .from(t.workspaceMembers)
    .innerJoin(t.workspaces, eq(t.workspaces.id, t.workspaceMembers.workspaceId))
    .where(eq(t.workspaceMembers.userId, userId))
    .orderBy(asc(t.workspaces.createdAt));
  return rows.map(({ w, role }) => ({
    workspaceId: w.id,
    name: w.name,
    slug: w.slug,
    kind: w.kind,
    mode: w.recoveryMode,
    role,
    settings: (w.settings ?? {}) as Record<string, unknown>,
  }));
}

/** The only way to reach a workspace: membership is checked on every call. */
export async function getMembership(db: Db, userId: string, workspaceId: string) {
  return (await listMemberships(db, userId)).find((m) => m.workspaceId === workspaceId) ?? null;
}

export async function setMode(db: Db, workspaceId: string, mode: Mode) {
  const [w] = await db.select().from(t.workspaces).where(eq(t.workspaces.id, workspaceId));
  if (!w) throw new WorkspaceRuleViolation("Workspace not found.");
  if (!availableModes(w.kind).includes(mode)) {
    throw new WorkspaceRuleViolation(
      "Bounded Autonomous Mode needs registered recovery capabilities for your systems. None exist yet outside the demo sandbox.",
    );
  }
  await db.update(t.workspaces).set({ recoveryMode: mode }).where(eq(t.workspaces.id, workspaceId));
}

export async function mergeSettings(db: Db, workspaceId: string, patch: Record<string, unknown>) {
  await db
    .update(t.workspaces)
    .set({ settings: sql`${t.workspaces.settings} || ${JSON.stringify(patch)}::jsonb` })
    .where(eq(t.workspaces.id, workspaceId));
}

export async function listMembers(db: Db, workspaceId: string) {
  return db
    .select({
      userId: t.user.id,
      name: t.user.name,
      email: t.user.email,
      role: t.workspaceMembers.role,
    })
    .from(t.workspaceMembers)
    .innerJoin(t.user, eq(t.user.id, t.workspaceMembers.userId))
    .where(eq(t.workspaceMembers.workspaceId, workspaceId))
    .orderBy(asc(t.user.email));
}

export async function addMemberByEmail(db: Db, workspaceId: string, email: string, role: Role) {
  const [u] = await db.select().from(t.user).where(eq(t.user.email, email.trim().toLowerCase()));
  if (!u) {
    throw new WorkspaceRuleViolation(
      "No account exists for that email yet. Ask them to create an account first, then add them.",
    );
  }
  const existing = await db
    .select()
    .from(t.workspaceMembers)
    .where(
      and(eq(t.workspaceMembers.workspaceId, workspaceId), eq(t.workspaceMembers.userId, u.id)),
    );
  if (existing.length) throw new WorkspaceRuleViolation("That person is already a member.");
  await db.insert(t.workspaceMembers).values({ workspaceId, userId: u.id, role });
}

async function ownerCount(db: Db, workspaceId: string) {
  const rows = await db
    .select()
    .from(t.workspaceMembers)
    .where(
      and(eq(t.workspaceMembers.workspaceId, workspaceId), eq(t.workspaceMembers.role, "OWNER")),
    );
  return rows.length;
}

export async function changeRole(db: Db, workspaceId: string, userId: string, role: Role) {
  const [m] = await db
    .select()
    .from(t.workspaceMembers)
    .where(
      and(eq(t.workspaceMembers.workspaceId, workspaceId), eq(t.workspaceMembers.userId, userId)),
    );
  if (!m) throw new WorkspaceRuleViolation("Member not found.");
  if (m.role === "OWNER" && role !== "OWNER" && (await ownerCount(db, workspaceId)) <= 1) {
    throw new WorkspaceRuleViolation("A workspace must keep at least one owner.");
  }
  await db
    .update(t.workspaceMembers)
    .set({ role })
    .where(
      and(eq(t.workspaceMembers.workspaceId, workspaceId), eq(t.workspaceMembers.userId, userId)),
    );
}

export async function removeMember(db: Db, workspaceId: string, userId: string) {
  const [m] = await db
    .select()
    .from(t.workspaceMembers)
    .where(
      and(eq(t.workspaceMembers.workspaceId, workspaceId), eq(t.workspaceMembers.userId, userId)),
    );
  if (!m) return;
  if (m.role === "OWNER" && (await ownerCount(db, workspaceId)) <= 1) {
    throw new WorkspaceRuleViolation("A workspace must keep at least one owner.");
  }
  await db
    .delete(t.workspaceMembers)
    .where(
      and(eq(t.workspaceMembers.workspaceId, workspaceId), eq(t.workspaceMembers.userId, userId)),
    );
}
