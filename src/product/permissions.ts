/**
 * Roles, permissions and the recovery-authority rule. Pure and deterministic: these decide what a
 * person or a mode may do, and they are tested directly. Nothing here consults a model.
 */
export const ROLES = ["OWNER", "ADMIN", "OPERATOR", "AUDITOR"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "workspace.read",
  "incident.review",
  "recovery.approve",
  "agent.manage",
  "integration.manage",
  "apikey.manage",
  "member.manage",
  "mode.change",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  ADMIN: PERMISSIONS,
  OPERATOR: ["workspace.read", "incident.review", "recovery.approve"],
  AUDITOR: ["workspace.read"],
};

export const can = (role: Role, permission: Permission): boolean =>
  ROLE_PERMISSIONS[role].includes(permission);

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  OPERATOR: "Operator",
  AUDITOR: "Auditor (read-only)",
};

export const ROLE_SUMMARY: Record<Role, string> = {
  OWNER: "Everything, including members and recovery mode.",
  ADMIN: "Manage agents, integrations, API keys, members and mode.",
  OPERATOR: "Review incidents and approve recovery within the current mode.",
  AUDITOR: "Read incidents, proof and memory. Cannot change anything.",
};

/* --------------------------- recovery modes --------------------------- */

export const MODES = ["SHADOW", "APPROVAL", "BOUNDED_AUTONOMOUS"] as const;
export type Mode = (typeof MODES)[number];

export const MODE_LABEL: Record<Mode, string> = {
  SHADOW: "Shadow Mode",
  APPROVAL: "Approval Mode",
  BOUNDED_AUTONOMOUS: "Bounded Autonomous Mode",
};

export const MODE_SUMMARY: Record<Mode, string> = {
  SHADOW:
    "Brindle observes, finds incidents, proposes recovery and produces evidence. It never changes your systems.",
  APPROVAL:
    "Brindle prepares a bounded recovery. A person approves it before any supported capability runs.",
  BOUNDED_AUTONOMOUS:
    "Only registered capabilities run automatically, inside their bounds. Anything else waits for a person.",
};

/**
 * Which modes a workspace may choose. Bounded Autonomous exists only where registered recovery
 * capabilities exist, which today means the sandbox in the demo workspace. A real workspace cannot
 * pick it, so the product never implies connectors that do not exist.
 */
export function availableModes(kind: "STANDARD" | "DEMO"): readonly Mode[] {
  return kind === "DEMO" ? MODES : ["SHADOW", "APPROVAL"];
}

export interface AuthorityInput {
  mode: Mode;
  /** Is the capability needed for this step in the registry? Only the registry grants authority. */
  capabilityRegistered: boolean;
  /** Has a person with recovery.approve approved this recovery? */
  approved: boolean;
}
export type AuthorityDecision = { allowed: true } | { allowed: false; reason: string };

/** The single rule that decides whether Brindle may change an external system. */
export function recoveryAuthority(input: AuthorityInput): AuthorityDecision {
  if (input.mode === "SHADOW") {
    return {
      allowed: false,
      reason: "Shadow Mode observes only. It never changes external systems.",
    };
  }
  if (!input.capabilityRegistered) {
    return {
      allowed: false,
      reason: "No registered recovery capability covers this step, so Brindle cannot act on it.",
    };
  }
  if (input.mode === "APPROVAL" && !input.approved) {
    return {
      allowed: false,
      reason: "Approval Mode needs a person to approve this recovery first.",
    };
  }
  return { allowed: true };
}
