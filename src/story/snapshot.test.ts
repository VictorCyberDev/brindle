import { describe, expect, it } from "vitest";
import { buildDemoIncident, buildDemoMemory } from "../product/dossier";
import { getStory } from "./get";
import { computeStory, storyDigest } from "./snapshot";

describe("recorded story", () => {
  it("matches a fresh run of the real engine", async () => {
    const fresh = await computeStory();
    expect(storyDigest(getStory())).toEqual(storyDigest(fresh));
  }, 180_000);

  it("labels demo incidents and respects the workspace mode", () => {
    const story = getStory();
    const shadowB = buildDemoIncident(story, "B", { mode: "APPROVAL", approvedB: false });
    expect(shadowB.source).toBe("DEMO");
    expect(shadowB.status).toBe("READY_TO_APPROVE");
    expect(shadowB.proof).toBeNull();
    const approved = buildDemoIncident(story, "B", { mode: "APPROVAL", approvedB: true });
    expect(approved.status).toBe("RECOVERED");
    expect(approved.proof?.checks.every((c) => c.status === "PASS")).toBe(true);
    const bounded = buildDemoIncident(story, "B", { mode: "BOUNDED_AUTONOMOUS", approvedB: false });
    expect(bounded.status).toBe("RECOVERED");
  });

  it("incident B consulted memory from incident A, and A was not shown its own memory", () => {
    const story = getStory();
    const a = buildDemoIncident(story, "A", { mode: "APPROVAL", approvedB: false });
    const b = buildDemoIncident(story, "B", { mode: "APPROVAL", approvedB: false });
    expect(a.memory?.hits ?? []).toHaveLength(0);
    expect(b.memory?.hits.length).toBeGreaterThan(0);
    expect(b.memory?.hits.every((h) => !h.title.includes("Cedarline"))).toBe(true);
    const mem = buildDemoMemory(story, { mode: "APPROVAL", approvedB: false });
    expect(mem.length).toBeGreaterThan(0);
  });

  it("never touches the unrelated control order", () => {
    const control = getStory().controlAtEnd as { po: { poId: string; status: string } };
    expect(control.po.poId).toBe("PO-901");
  });
});
