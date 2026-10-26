import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { can, type Permission } from "../product/permissions";
import { getAuth } from "./auth";
import { getProductDb } from "./db";
import { listMemberships, type Membership } from "./workspaces";

export const WORKSPACE_COOKIE = "brindle_ws";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  // Read request headers first so every authenticated page is rendered per request, never at build.
  const requestHeaders = await headers();
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email };
}

export async function requireUser(next = "/app"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return user;
}

export interface WorkspaceContext {
  user: SessionUser;
  memberships: Membership[];
  active: Membership;
}

/** Signed-in user plus the active workspace (membership verified on every request). */
export async function getWorkspaceContext(): Promise<WorkspaceContext | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const { db } = await getProductDb();
  const memberships = await listMemberships(db, user.id);
  if (!memberships.length) return null;
  const wanted = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const active = memberships.find((m) => m.workspaceId === wanted) ?? memberships[0]!;
  return { user, memberships, active };
}

export async function requireWorkspace(next = "/app"): Promise<WorkspaceContext> {
  const user = await requireUser(next);
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/onboarding");
  void user;
  return ctx;
}

export class Forbidden extends Error {
  override name = "Forbidden";
  constructor(public readonly permission: Permission) {
    super(`Your role cannot do this (${permission}).`);
  }
}

/** Throws Forbidden unless the active role grants the permission. Used by every mutating action. */
export function assertCan(ctx: WorkspaceContext, permission: Permission) {
  if (!can(ctx.active.role, permission)) throw new Forbidden(permission);
}
