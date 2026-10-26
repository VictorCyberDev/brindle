import { ActionForm } from "../../../components/ui/action-form";
import { Card, PageHeader } from "../../../components/ui/layout";
import { ROLES, ROLE_LABEL, ROLE_SUMMARY, can } from "../../../product/permissions";
import { getProductDb } from "../../../server/db";
import { requireWorkspace } from "../../../server/session";
import { listMembers } from "../../../server/workspaces";
import { addMemberAction, changeRoleAction, removeMemberAction } from "../../actions";

export const metadata = { title: "Team" };

const inputCls = "h-10 w-full rounded-md border border-line-strong bg-surface px-3";

export default async function TeamPage() {
  const ctx = await requireWorkspace("/app/team");
  const { db } = await getProductDb();
  const members = await listMembers(db, ctx.active.workspaceId);
  const manage = can(ctx.active.role, "member.manage");
  return (
    <>
      <PageHeader title="Team" description="Who can see this workspace and what they can do." />
      <ul className="mb-10 grid gap-3 md:grid-cols-2">
        {ROLES.map((r) => (
          <Card as="li" key={r}>
            <h2 className="font-semibold">{ROLE_LABEL[r]}</h2>
            <p className="text-sm text-muted">{ROLE_SUMMARY[r]}</p>
          </Card>
        ))}
      </ul>
      <ul className="divide-y divide-line rounded-lg bg-surface shadow-raise" data-testid="members">
        {members.map((m) => (
          <li
            key={m.userId}
            className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between"
          >
            <span>
              <span className="block font-semibold">{m.name}</span>
              <span className="block text-sm text-muted">{m.email}</span>
            </span>
            {manage && m.userId !== ctx.user.id ? (
              <div className="flex flex-wrap items-start gap-3">
                <ActionForm
                  action={changeRoleAction}
                  submitLabel="Save role"
                  variant="secondary"
                  className="flex items-start gap-2"
                >
                  <input type="hidden" name="userId" value={m.userId} />
                  <label className="sr-only" htmlFor={`role-${m.userId}`}>
                    Role for {m.email}
                  </label>
                  <select
                    id={`role-${m.userId}`}
                    name="role"
                    defaultValue={m.role}
                    className={inputCls}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </ActionForm>
                <ActionForm action={removeMemberAction} submitLabel="Remove" variant="danger">
                  <input type="hidden" name="userId" value={m.userId} />
                </ActionForm>
              </div>
            ) : (
              <span className="text-sm">{ROLE_LABEL[m.role]}</span>
            )}
          </li>
        ))}
      </ul>
      {manage && ctx.active.kind === "STANDARD" ? (
        <Card className="mt-10">
          <h2 className="text-lg font-semibold">Add a member</h2>
          <p className="mt-1 text-sm text-muted">
            They need a Brindle account first. Invitations by email are not built yet.
          </p>
          <ActionForm
            action={addMemberAction}
            submitLabel="Add member"
            className="mt-4 grid max-w-md gap-3"
          >
            <label className="text-sm font-medium" htmlFor="email">
              Email
            </label>
            <input id="email" name="email" type="email" required className={inputCls} />
            <label className="text-sm font-medium" htmlFor="role">
              Role
            </label>
            <select id="role" name="role" defaultValue="OPERATOR" className={inputCls}>
              {ROLES.filter((r) => r !== "OWNER").map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </ActionForm>
        </Card>
      ) : null}
    </>
  );
}
