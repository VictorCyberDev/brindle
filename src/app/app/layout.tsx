import type { ReactNode } from "react";
import { AppShell } from "../../components/product/app-shell";
import { WorkspaceSwitcher } from "../../components/product/switcher";
import { MODE_LABEL } from "../../product/permissions";
import { loadIncidents } from "../../server/data";
import { requireWorkspace } from "../../server/session";

export const dynamic = "force-dynamic";

const NEEDS_ATTENTION = new Set([
  "NEEDS_REVIEW",
  "READY_TO_APPROVE",
  "PROPOSED_SHADOW",
  "NEEDS_PERSON",
  "RECOVERY_INCOMPLETE",
]);

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireWorkspace();
  const incidents = await loadIncidents(ctx.active);
  const attention = incidents.filter((i) => NEEDS_ATTENTION.has(i.status)).length;
  return (
    <AppShell
      workspaceName={ctx.active.name}
      isDemo={ctx.active.kind === "DEMO"}
      modeLabel={MODE_LABEL[ctx.active.mode]}
      userName={ctx.user.name}
      attention={attention}
      switcher={<WorkspaceSwitcher active={ctx.active} all={ctx.memberships} />}
    >
      {children}
    </AppShell>
  );
}
