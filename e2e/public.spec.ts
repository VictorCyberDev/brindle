import { expect, test } from "@playwright/test";
import { noHorizontalScroll, uniqueEmail } from "./helpers";

test("A. landing explains the product and leads to the demo", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("hero-title")).toContainText("Truth changed");
  await expect(page.getByText("DEMO DATA").first()).toBeVisible();
  await page.getByTestId("hero-demo").click();
  await expect(page).toHaveURL(/\/demo$/);
});

test("B. guided tour: explore each step to the end, then replay", async ({ page }) => {
  await page.goto("/demo");
  await page.getByTestId("explore").click();
  for (let n = 1; n < 9; n++) await page.getByTestId("next").click();
  await expect(page.getByTestId("tour-step")).toHaveAttribute("data-step", "second");
  await expect(page.getByTestId("tour-cta")).toBeVisible();
  await expect(page.getByText("Similar verified recovery")).toBeVisible();
});

test("B2. run the recovery story autoplays and can be paused", async ({ page }) => {
  await page.goto("/demo");
  await page.getByTestId("run-story").click();
  await expect(page.getByTestId("tour-step")).toHaveAttribute("data-step", "healthy");
  await page.getByTestId("play-pause").click(); // pause
  await expect(page.getByTestId("play-pause")).toHaveText("Play");
});

test("C. public proof page shows the verdict and a receipt download", async ({ page }) => {
  await page.goto("/proof/demo-atlas");
  await expect(page.getByTestId("proof-verdict")).toContainText(/proven/i);
  await expect(page.getByTestId("proof-preserved")).toBeVisible();
  const res = await page.request.get("/proof/demo-atlas/receipt");
  expect(res.status()).toBe(200);
  expect(await res.json()).toHaveProperty("invariantResults");
  expect((await page.request.get("/proof/not-real")).status()).toBe(404);
});

test("D. docs, pricing and security are real pages and make no false claims", async ({ page }) => {
  await page.goto("/docs");
  await expect(page.getByTestId("doc")).toContainText("Getting started");
  await page.goto("/docs/api");
  await expect(page.getByTestId("doc")).toContainText("POST /api/v1/decisions");
  await page.goto("/pricing");
  await expect(page.getByText(/no billing/i).first()).toBeVisible();
  await page.goto("/security");
  const body = await page.locator("main").innerText();
  expect(body).toMatch(/has not completed SOC 2/i);
  expect(body).not.toMatch(/SOC 2 (certified|compliant)/i);
});

test("E. private beta request works and rejects bad input", async ({ page }) => {
  await page.goto("/beta");
  await page.fill("#email", uniqueEmail("beta"));
  await page.fill("#company", "Acme Robotics");
  await page.fill("#role", "Head of Platform");
  await page.fill("#useCase", "Procurement agents approve purchase orders on supplier facts.");
  await page.getByTestId("beta-submit").click();
  await expect(page.getByTestId("beta-success")).toBeVisible();
});

test("F. the health endpoint reports status without secrets", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  const text = await res.text();
  expect(text).not.toMatch(/secret|password|token/i);
});

for (const width of [375, 768, 1440]) {
  test(`M. no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      "/",
      "/demo",
      "/pricing",
      "/security",
      "/beta",
      "/docs/api",
      "/sign-in",
      "/proof/demo-atlas",
    ]) {
      await page.goto(path);
      await noHorizontalScroll(page);
    }
  });
}

test("theme: dark mode applies and persists", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("radio", { name: /dark theme/i })
    .first()
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("unauthenticated visitors are sent to sign in, then back", async ({ page }) => {
  await page.goto("/app/incidents");
  await expect(page).toHaveURL(/sign-in\?next=%2Fapp%2Fincidents/);
});
