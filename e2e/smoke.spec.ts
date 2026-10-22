import { expect, test } from "@playwright/test";

test("health endpoint reports ok in local mode", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ service: "brindle", status: "ok" });
  expect(body.environment.runtimeMode).toBe("local");
  expect(JSON.stringify(body)).not.toMatch(/api[_-]?key|secret|postgres:\/\//i);
});

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Brindle" })).toBeVisible();
});
