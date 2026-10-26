"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MODES, recoveryAuthority, type Mode, ROLES, type Role } from "../product/permissions";
import { guarded, type ActionResult } from "../server/actions-core";
import { issueApiKey, revokeApiKey } from "../server/api-keys";
import { getProductDb } from "../server/db";
import { track } from "../server/events";
import { updateIncidentState } from "../server/ingest";
import {
  assertCan,
  getWorkspaceContext,
  requireUser,
  requireWorkspace,
  WORKSPACE_COOKIE,
} from "../server/session";
import {
  addMemberByEmail,
  changeRole,
  createWorkspace,
  mergeSettings,
  removeMember,
  setMode,
} from "../server/workspaces";

const text = (f: FormData, k: string) => String(f.get(k) ?? "");
async function remember(workspaceId: string) {
  (await cookies()).set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
}

/* ------------------------------ onboarding ------------------------------ */

export async function createWorkspaceAction(
  _: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return guarded(async () => {
    const user = await requireUser("/onboarding");
    const { db } = await getProductDb();
    const w = await createWorkspace(db, {
      userId: user.id,
      name: text(form, "name"),
      mode: "SHADOW",
    });
    await track(db, "workspace_created", w.workspaceId);
    await remember(w.workspaceId);
    redirect("/onboarding?step=2");
  });
}

export async function chooseModeAction(
  _: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return guarded(async () => {
    const ctx = await requireWorkspace("/onboarding");
    assertCan(ctx, "mode.change");
    const mode = z.enum(MODES).parse(text(form, "mode"));
    const { db } = await getProductDb();
    await setMode(db, ctx.active.workspaceId, mode);
    redirect("/onboarding?step=3");
  });
}

export async function startDemoWorkspaceAction(): Promise<void> {
  const user = await requireUser("/onboarding");
  const { db } = await getProductDb();
  const ctx = await getWorkspaceContext();
  const existing = ctx?.memberships.find((m) => m.kind === "DEMO");
  const demo =
    existing ??
    (await createWorkspace(db, {
      userId: user.id,
      name: "Demo Workspace",
      kind: "DEMO",
      mode: "APPROVAL",
    }));
  if (!existing) await track(db, "workspace_created", demo.workspaceId);
  await remember(demo.workspaceId);
  redirect("/app");
}

export async function finishOnboardingAction(): Promise<void> {
  await requireWorkspace("/onboarding");
  redirect("/app");
}

/* --------------------------- workspace switching --------------------------- */

export async function switchWorkspaceAction(form: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const target = text(form, "workspaceId");
  if (ctx.memberships.some((m) => m.workspaceId === target)) await remember(target);
  redirect("/app");
}

/* ---------------------------- recovery mode & demo ---------------------------- */

export async function setModeAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ctx = await requireWorkspace();
    assertCan(ctx, "mode.change");
    const mode = z.enum(MODES).parse(text(form, "mode")) as Mode;
    const { db } = await getProductDb();
    await setMode(db, ctx.active.workspaceId, mode);
    revalidatePath("/app", "layout");
    return { ok: true, message: "Recovery mode updated." };
  });
}

/**
 * Approval Mode in the demo workspace: the person approves, the deterministic authority rule decides
 * whether anything may run, and the replay advances. Shadow Mode refuses; a missing capability refuses.
 */
export async function approveRecoveryAction(
  _: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return guarded(async () => {
    const ctx = await requireWorkspace();
    assertCan(ctx, "recovery.approve");
    const w = ctx.active;
    const decision = recoveryAuthority({
      mode: w.mode,
      capabilityRegistered: w.kind === "DEMO", // the registry exists only for the sandbox
      approved: true,
    });
    if (!decision.allowed) return { ok: false, message: decision.reason };
    if (text(form, "incidentId") !== "demo-cedar")
      return { ok: false, message: "That incident has no prepared recovery to approve." };
    const { db } = await getProductDb();
    await mergeSettings(db, w.workspaceId, { demoApprovedB: true });
    await track(db, "recovery_verified", w.workspaceId);
    revalidatePath("/app", "layout");
    return {
      ok: true,
      message: "Approved. Brindle ran the registered steps and verified the result.",
    };
  });
}

export async function resetDemoAction(): Promise<ActionResult> {
  return guarded(async () => {
    const ctx = await requireWorkspace();
    assertCan(ctx, "mode.change");
    if (ctx.active.kind !== "DEMO")
      return { ok: false, message: "Only the demo workspace can be reset." };
    const { db } = await getProductDb();
    await mergeSettings(db, ctx.active.workspaceId, { demoApprovedB: false });
    revalidatePath("/app", "layout");
    return { ok: true, message: "Demo reset." };
  });
}

/* ---------------------------- incident handling ---------------------------- */

export async function incidentStateAction(
  _: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return guarded(async () => {
    const ctx = await requireWorkspace();
    assertCan(ctx, "incident.review");
    if (ctx.active.kind === "DEMO")
      return {
        ok: false,
        message: "Demo incidents are read-only. Connect a real workspace to review your own.",
      };
    const to = z.enum(["IN_REVIEW", "RESOLVED_BY_HUMAN"]).parse(text(form, "to"));
    const { db } = await getProductDb();
    try {
      await updateIncidentState(db, {
        workspaceId: ctx.active.workspaceId,
        incidentId: text(form, "incidentId"),
        userId: ctx.user.id,
        to,
        note: text(form, "note"),
      });
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Could not update." };
    }
    revalidatePath("/app", "layout");
    return {
      ok: true,
      message:
        to === "IN_REVIEW"
          ? "Marked as being reviewed."
          : "Resolved. Note that Brindle did not verify this resolution.",
    };
  });
}

/* --------------------------------- API keys --------------------------------- */

export async function issueKeyAction(
  _: ActionResult<{ plaintext: string; prefix: string }> | null,
  form: FormData,
): Promise<ActionResult<{ plaintext: string; prefix: string }>> {
  return guarded(async () => {
    const ctx = await requireWorkspace();
    assertCan(ctx, "apikey.manage");
    if (ctx.active.kind === "DEMO")
      return {
        ok: false,
        message: "The demo workspace has no API keys. Create a real workspace to connect agents.",
      };
    const { db } = await getProductDb();
    const issued = await issueApiKey(db, {
      workspaceId: ctx.active.workspaceId,
      label: text(form, "label"),
      createdBy: ctx.user.id,
    });
    revalidatePath("/app/developer");
    return { ok: true, data: { plaintext: issued.plaintext, prefix: issued.prefix } };
  });
}

export async function revokeKeyAction(
  _: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return guarded(async () => {
    const ctx = await requireWorkspace();
    assertCan(ctx, "apikey.manage");
    const { db } = await getProductDb();
    await revokeApiKey(db, ctx.active.workspaceId, text(form, "keyId"));
    revalidatePath("/app/developer");
    return { ok: true, message: "Key revoked. It stops working immediately." };
  });
}

/* ---------------------------------- team ---------------------------------- */

export async function addMemberAction(
  _: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return guarded(async () => {
    const ctx = await requireWorkspace();
    assertCan(ctx, "member.manage");
    const role = z.enum(ROLES).parse(text(form, "role")) as Role;
    const { db } = await getProductDb();
    await addMemberByEmail(db, ctx.active.workspaceId, text(form, "email"), role);
    revalidatePath("/app/team");
    return { ok: true, message: "Member added." };
  });
}

export async function changeRoleAction(
  _: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return guarded(async () => {
    const ctx = await requireWorkspace();
    assertCan(ctx, "member.manage");
    const role = z.enum(ROLES).parse(text(form, "role")) as Role;
    const { db } = await getProductDb();
    await changeRole(db, ctx.active.workspaceId, text(form, "userId"), role);
    revalidatePath("/app/team");
    return { ok: true, message: "Role updated." };
  });
}

export async function removeMemberAction(
  _: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return guarded(async () => {
    const ctx = await requireWorkspace();
    assertCan(ctx, "member.manage");
    const { db } = await getProductDb();
    await removeMember(db, ctx.active.workspaceId, text(form, "userId"));
    revalidatePath("/app/team");
    return { ok: true, message: "Member removed." };
  });
}
