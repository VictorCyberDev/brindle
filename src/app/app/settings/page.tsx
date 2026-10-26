import { ActionForm } from "../../../components/ui/action-form";
import { Callout, Card, DataList, PageHeader } from "../../../components/ui/layout";
import {
  MODE_LABEL,
  MODE_SUMMARY,
  ROLE_LABEL,
  availableModes,
  can,
} from "../../../product/permissions";
import { requireWorkspace } from "../../../server/session";
import { resetDemoAction, setModeAction } from "../../actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireWorkspace("/app/settings");
  const w = ctx.active;
  const mayChange = can(w.role, "mode.change");
  return (
    <>
      <PageHeader
        title="Settings"
        description="Your workspace and how much Brindle may do in it."
      />
      <Card className="mb-8">
        <DataList
          items={[
            { label: "Workspace", value: w.name },
            { label: "Type", value: w.kind === "DEMO" ? "Demo (sample data)" : "Your workspace" },
            { label: "Your role", value: ROLE_LABEL[w.role] },
          ]}
        />
      </Card>

      <section aria-labelledby="mode" className="mb-8">
        <h2 id="mode" className="mb-3 text-xl font-semibold">
          Recovery mode
        </h2>
        {mayChange ? (
          <Card>
            <ActionForm action={setModeAction} submitLabel="Save mode" testId="save-mode">
              <fieldset className="space-y-3">
                <legend className="sr-only">Recovery mode</legend>
                {availableModes(w.kind).map((m) => (
                  <label key={m} className="flex cursor-pointer gap-3">
                    <input
                      type="radio"
                      name="mode"
                      value={m}
                      defaultChecked={m === w.mode}
                      className="mt-1.5"
                    />
                    <span>
                      <span className="block font-semibold">{MODE_LABEL[m]}</span>
                      <span className="block text-sm text-muted">{MODE_SUMMARY[m]}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            </ActionForm>
          </Card>
        ) : (
          <Callout tone="neutral" title={`Current mode: ${MODE_LABEL[w.mode]}`}>
            Only owners and admins can change the mode. {MODE_SUMMARY[w.mode]}
          </Callout>
        )}
      </section>

      {w.kind === "DEMO" ? (
        <section aria-labelledby="reset">
          <h2 id="reset" className="mb-3 text-xl font-semibold">
            Demo data
          </h2>
          <Card>
            <p className="mb-3 text-muted">
              Put the demo workspace back to its starting point. This affects only demo data.
            </p>
            <ActionForm
              action={resetDemoAction}
              submitLabel="Reset demo"
              variant="secondary"
              testId="reset-demo"
            />
          </Card>
        </section>
      ) : null}
    </>
  );
}
