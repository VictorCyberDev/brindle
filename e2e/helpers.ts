import { expect, type Page } from "@playwright/test";

export const PASSWORD = "correct-horse-battery-9";
export const uniqueEmail = (tag = "u") =>
  `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

export async function signUp(page: Page, email = uniqueEmail(), name = "Test Person") {
  await page.goto("/sign-up");
  await page.fill("#name", name);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click("[data-testid=auth-submit]");
  await page.waitForURL(/\/onboarding/, { timeout: 60_000 });
  return email;
}

export async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click("[data-testid=auth-submit]");
  await page.waitForURL(/\/app/, { timeout: 60_000 });
}

export async function openDemoWorkspace(page: Page) {
  await page.click("[data-testid=skip-to-demo]");
  await page.waitForURL(/\/app$/, { timeout: 60_000 });
  await expect(page.getByTestId("demo-banner")).toBeVisible();
}

export async function noHorizontalScroll(page: Page) {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over, "page scrolls horizontally").toBeLessThanOrEqual(1);
}
