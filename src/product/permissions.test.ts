import { describe, expect, it } from "vitest";
import { MODES, PERMISSIONS, ROLES, availableModes, can, recoveryAuthority } from "./permissions";

describe("roles", () => {
  it("auditors can only read", () => {
    expect(PERMISSIONS.filter((p) => can("AUDITOR", p))).toEqual(["workspace.read"]);
  });
  it("operators review and approve but cannot manage members, keys or mode", () => {
    expect(can("OPERATOR", "recovery.approve")).toBe(true);
    for (const p of [
      "member.manage",
      "apikey.manage",
      "mode.change",
      "integration.manage",
    ] as const)
      expect(can("OPERATOR", p)).toBe(false);
  });
  it("owners and admins can do everything", () => {
    for (const r of ["OWNER", "ADMIN"] as const)
      for (const p of PERMISSIONS) expect(can(r, p)).toBe(true);
    expect(ROLES).toHaveLength(4);
  });
});

describe("recovery authority", () => {
  it("Shadow Mode never executes, even with a capability and an approval", () => {
    const d = recoveryAuthority({ mode: "SHADOW", capabilityRegistered: true, approved: true });
    expect(d.allowed).toBe(false);
  });
  it("Approval Mode needs an approval", () => {
    expect(
      recoveryAuthority({ mode: "APPROVAL", capabilityRegistered: true, approved: false }).allowed,
    ).toBe(false);
    expect(
      recoveryAuthority({ mode: "APPROVAL", capabilityRegistered: true, approved: true }).allowed,
    ).toBe(true);
  });
  it("Bounded Autonomous still needs a registered capability", () => {
    const d = recoveryAuthority({
      mode: "BOUNDED_AUTONOMOUS",
      capabilityRegistered: false,
      approved: false,
    });
    expect(d.allowed).toBe(false);
    expect(
      recoveryAuthority({
        mode: "BOUNDED_AUTONOMOUS",
        capabilityRegistered: true,
        approved: false,
      }).allowed,
    ).toBe(true);
  });
  it("customer workspaces cannot choose Bounded Autonomous", () => {
    expect(availableModes("STANDARD")).toEqual(["SHADOW", "APPROVAL"]);
    expect(availableModes("DEMO")).toEqual(MODES);
  });
});
