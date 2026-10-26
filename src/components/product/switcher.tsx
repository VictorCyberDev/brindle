import { switchWorkspaceAction } from "../../app/actions";
import type { Membership } from "../../server/workspaces";
import { ChevronDown } from "../ui/icons";

/** Server-rendered dropdown (details/summary): keyboard accessible, no client JavaScript. */
export function WorkspaceSwitcher({ active, all }: { active: Membership; all: Membership[] }) {
  return (
    <details className="group relative">
      <summary
        className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-sm hover:bg-sunken"
        aria-label={`Workspace: ${active.name}. Change workspace`}
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold">{active.name}</span>
          <span className="block text-xs text-muted">
            {active.kind === "DEMO" ? "Demo workspace" : "Workspace"}
          </span>
        </span>
        <ChevronDown
          size={16}
          aria-hidden
          className="shrink-0 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="absolute inset-x-0 top-full z-30 mt-1 rounded-md border border-line bg-surface p-1 shadow-pop">
        {all.map((m) => (
          <form key={m.workspaceId} action={switchWorkspaceAction}>
            <input type="hidden" name="workspaceId" value={m.workspaceId} />
            <button
              type="submit"
              className="flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm hover:bg-sunken"
              aria-current={m.workspaceId === active.workspaceId ? "true" : undefined}
            >
              <span className="truncate">{m.name}</span>
              {m.kind === "DEMO" ? (
                <span className="text-xs font-semibold text-muted">DEMO</span>
              ) : null}
            </button>
          </form>
        ))}
        <a
          href="/onboarding"
          className="block rounded-sm px-3 py-2 text-sm text-muted hover:bg-sunken"
        >
          + New workspace
        </a>
      </div>
    </details>
  );
}
