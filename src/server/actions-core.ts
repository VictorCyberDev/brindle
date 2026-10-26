import { Forbidden } from "./session";
import { WorkspaceRuleViolation } from "./workspaces";
import { IngestConflict } from "./ingest";

export type ActionResult<T = undefined> =
  { ok: true; message?: string; data?: T } | { ok: false; message: string };

/** Maps expected failures to plain messages; anything else becomes a generic, secret-free message. */
export async function guarded<T = undefined>(
  fn: () => Promise<ActionResult<T> | void>,
): Promise<ActionResult<T>> {
  try {
    const out = await fn();
    return out ?? { ok: true };
  } catch (error) {
    if (error instanceof Forbidden) {
      return {
        ok: false,
        message: "Your role does not allow that. Ask a workspace owner or admin.",
      };
    }
    if (error instanceof WorkspaceRuleViolation || error instanceof IngestConflict) {
      return { ok: false, message: error.message };
    }
    // Next.js redirects are thrown as errors; let them through.
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    console.error("action failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, message: "Something went wrong and nothing was changed. Try again." };
  }
}
