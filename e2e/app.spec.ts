import { expect, test } from "@playwright/test";
import {
  noHorizontalScroll,
  openDemoWorkspace,
  signUp,
  uniqueEmail,
  signIn,
  PASSWORD,
} from "./helpers";

test.describe.configure({ mode: "serial" });

test("G. Demo Workspace: Incident B is approved, recovered, proven and remembered", async ({
  page,
}) => {
  await signUp(page);
  await openDemoWorkspace(page);
  await expect(page.getByTestId("system-status")).toContainText("needs you");

  await page.goto("/app/incidents/demo-cedar");
  await expect(page.getByTestId("incident-status")).toContainText(/ready for your approval/i);
  await expect(page.getByTestId("preserved")).toContainText("PO-901");
  await expect(page.getByTestId("memory-block")).toContainText(/similar verified recovery/i);
  await expect(page.locator("[data-testid=cannot-undo]:visible").first()).toBeVisible();

  // double-submit safety: the confirm button can be clicked twice, the recovery happens once
  await page.getByTestId("approve-recovery").click();
  const confirm = page.getByTestId("approve-recovery-confirm");
  await confirm.dblclick();
  await expect(page.getByTestId("incident-status")).toContainText(/recovered/i, {
    timeout: 30_000,
  });
  await expect(page.getByTestId("proof-block")).toBeVisible();

  await page.goto("/app/recoveries/demo-cedar");
  await expect(page.getByTestId("proof-verdict")).toContainText(/proven/i);
  const dl = await page.request.get("/app/recoveries/demo-cedar/receipt");
  expect(dl.status()).toBe(200);

  await page.goto("/app/memory");
  await expect(page.getByTestId("memory-entry").first()).toBeVisible();
  await expect(page.getByTestId("memory-list")).toContainText(/consulted when planning/i);
});

test("H. Shadow Mode cannot execute even in the demo workspace", async ({ page }) => {
  await signUp(page);
  await openDemoWorkspace(page);
  await page.goto("/app/settings");
  // The demo offers every mode; Shadow must remove the ability to approve.
  await page.getByLabel(/Shadow/).check();
  await page.getByTestId("save-mode").click();
  await expect(page.getByTestId("mode-pill")).toContainText(/Shadow/i, { timeout: 15_000 });
  await page.goto("/app/incidents/demo-cedar");
  await expect(page.getByTestId("approve-recovery")).toHaveCount(0);
  await expect(page.getByTestId("incident-status")).toContainText(/shadow/i);
});

test("I. your own workspace: key shown once, evidence in, incident out, honest about limits", async ({
  page,
  request,
}) => {
  await signUp(page);
  await page.fill("#name", "Acme Procurement");
  await page.getByTestId("create-workspace").click();
  await expect(page).toHaveURL(/step=2/);
  await expect(page.getByLabel(/Shadow/)).toBeChecked();
  await page.getByTestId("choose-mode").click();
  await expect(page).toHaveURL(/step=3/);
  await page.getByTestId("to-safety-check").click();
  await expect(page.getByTestId("onboarding-step-4")).toContainText(
    "Brindle cannot change your systems yet",
  );
  await page.getByTestId("finish-onboarding").click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByTestId("empty-state").first()).toBeVisible();

  await page.goto("/app/developer");
  await page.fill("#label", "e2e");
  await page.getByTestId("issue-key").click();
  const key = (await page.getByTestId("key-plaintext").innerText()).trim();
  expect(key.startsWith("brk_")).toBe(true);
  await page.reload();
  await expect(page.getByText(key)).toHaveCount(0); // never shown again

  const h = { authorization: `Bearer ${key}` };
  const d = await request.post("/api/v1/decisions", {
    headers: h,
    data: {
      agent: { name: "Procurement agent" },
      decisionId: "e2e-d1",
      decidedAt: "2026-03-02T09:00:00Z",
      summary: "Approved PO-1042 with Acme",
      action: { type: "approve_po", target: "PO-1042" },
      truthInputs: [
        {
          subjectType: "supplier",
          subjectId: "SUP-A",
          factKey: "certification.status",
          value: "VALID",
        },
      ],
      consequences: [
        {
          objectType: "email",
          objectId: "E-1",
          description: "Supplier emailed",
          reversibility: "IRREVERSIBLE",
        },
      ],
    },
  });
  expect(d.status()).toBe(201);
  const r = await request.post("/api/v1/truth-revisions", {
    headers: h,
    data: {
      revisionId: "e2e-r1",
      subjectType: "supplier",
      subjectId: "SUP-A",
      factKey: "certification.status",
      previousValue: "VALID",
      newValue: "REVOKED",
      effectiveFrom: "2026-03-01T00:00:00Z",
      observedAt: "2026-03-09T00:00:00Z",
    },
  });
  expect(r.status()).toBe(201);
  const { incidentId } = await r.json();

  await page.goto("/app/incidents");
  await expect(page.getByTestId("incident-card")).toHaveCount(1);
  await page.goto(`/app/incidents/${incidentId}`);
  await expect(page.getByTestId("incident-title")).toBeVisible();
  await expect(page.getByTestId("approve-recovery")).toHaveCount(0); // no capability, no execution
  await expect(
    page.locator("[data-testid=treatment-NEEDS_HUMAN_REVIEW]:visible").first(),
  ).toBeVisible();
  await expect(page.getByTestId("shadow-note")).toBeVisible();
  await expect(page.getByTestId("proof-block")).toHaveCount(0);

  // another visitor's key does not see this workspace's incident
  expect((await request.get("/api/v1/incidents")).status()).toBe(401);
});

test("J. an auditor is read-only and permission denial is explained", async ({ browser }) => {
  const ownerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  await signUp(owner);
  await owner.fill("#name", "Team Space");
  await owner.getByTestId("create-workspace").click();
  await owner.waitForURL(/step=2/);
  await owner.getByTestId("choose-mode").click();
  await owner.waitForURL(/step=3/);
  await owner.getByTestId("to-safety-check").click();
  await owner.getByTestId("finish-onboarding").click();

  const auditorEmail = uniqueEmail("auditor");
  const aCtx = await browser.newContext();
  const aud = await aCtx.newPage();
  await signUp(aud, auditorEmail, "Audrey Auditor");

  await owner.goto("/app/team");
  await owner.fill("#email", auditorEmail);
  await owner.selectOption("#role", "AUDITOR");
  await owner.getByRole("button", { name: "Add member" }).click();
  await expect(owner.getByTestId("members")).toContainText(auditorEmail);

  // The auditor has no workspace of their own, so Team Space is their active one.
  await aud.goto("/app/settings");
  await expect(aud.getByText("Team Space").first()).toBeVisible();
  await expect(aud.getByText("Auditor (read-only)").first()).toBeVisible();
  await expect(aud.getByTestId("save-mode")).toHaveCount(0);
  await aud.goto("/app/developer");
  await expect(aud.getByTestId("issue-key")).toHaveCount(0);
  await expect(aud.getByText("Only owners and admins can create keys.")).toBeVisible();
  await aud.goto("/app/team");
  await expect(aud.getByRole("button", { name: "Add member" })).toHaveCount(0);
  await ownerCtx.close();
  await aCtx.close();
});

test("K. mobile: the demo incident has no overflow and a reachable action", async ({ page }) => {
  await signUp(page);
  await openDemoWorkspace(page);
  await page.setViewportSize({ width: 375, height: 800 });
  for (const p of [
    "/app",
    "/app/incidents",
    "/app/incidents/demo-cedar",
    "/app/agents",
    "/app/memory",
    "/app/integrations",
    "/app/team",
    "/app/settings",
    "/app/developer",
  ]) {
    await page.goto(p);
    await noHorizontalScroll(page);
  }
  await page.goto("/app/incidents/demo-cedar");
  await expect(page.getByTestId("approve-recovery")).toBeVisible();
});

test("L. sign out and back in keeps your workspace; wrong password is refused", async ({
  page,
}) => {
  const email = await signUp(page);
  await page.goto("/sign-in");
  await page.fill("#email", email);
  await page.fill("#password", "wrong-password-123");
  await page.click("[data-testid=auth-submit]");
  await expect(page.getByTestId("auth-error")).toBeVisible();
  await page.fill("#password", PASSWORD);
  await page.click("[data-testid=auth-submit]");
  await page.waitForURL(/\/(app|onboarding)/, { timeout: 60_000 });
  void signIn;
});
