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

test.describe("M1 demo shell (MOCK mode, in-process PostgreSQL)", () => {
  test.describe.configure({ mode: "serial" });

  test("makes MOCK and SANDBOX unmistakable, then shows the successful world", async ({ page }) => {
    await page.goto("/demo");
    await expect(page.getByRole("heading", { name: "Successful Agent World" })).toBeVisible();
    await expect(page.getByTestId("provider-banner")).toHaveAttribute("data-mode", "MOCK");
    await expect(page.getByTestId("provider-banner")).toContainText("no sponsor was contacted");
    await expect(page.getByTestId("sandbox-banner")).toContainText("SANDBOX BUSINESS SYSTEM");

    await page.getByTestId("reset-sandbox").click();
    await expect(page.getByTestId("control-message")).toContainText("HTTP 200");
    await expect(page.getByTestId("po-created")).toHaveText("—");

    await page.getByTestId("run-success").click();
    await expect(page.getByTestId("control-message")).toContainText("COMPLETED");
    await expect(page.getByTestId("truth-supplier")).toHaveText("Atlas Components");
    await expect(page.getByTestId("truth-cert")).toHaveText("VALID");
    await expect(page.getByTestId("procurement")).toHaveText("SELECTED");
    await expect(page.getByTestId("po-created")).toHaveText("CREATED");
    await expect(page.getByTestId("finance")).toHaveText("APPROVED");
    await expect(page.getByTestId("operations")).toHaveText("RECEIVING SCHEDULED");
    await expect(page.getByTestId("notification")).toHaveText("RECORDED — SANDBOX");
    await expect(page.getByTestId("receipts-827")).toHaveText("3");
    await expect(page.getByTestId("control")).toContainText("CONTROL / UNRELATED");
    await expect(page.getByTestId("provider-mode")).toHaveText("MOCK");
    await expect(page.getByTestId("model-id")).toHaveText(/^MOCK:/);
    await expect(page.getByTestId("runtime-route")).toHaveText("MOCK");
    await expect(page.getByTestId("underlying-model")).toHaveText("n/a (MOCK)");
  });

  test("running again is idempotent and the API exposes no secrets", async ({ request }) => {
    const again = await request.post("/api/demo/run-success");
    expect(again.status()).toBe(200);
    expect((await again.json()).result.status).toBe("ALREADY_COMPLETE");
    const state = await (await request.get("/api/demo/state")).json();
    expect(state.sandbox).toBe("SANDBOX BUSINESS SYSTEM");
    expect(state.providerMode).toBe("MOCK");
    expect(state.state.purchaseOrders).toHaveLength(2);
    expect(JSON.stringify(state)).not.toMatch(/api[_-]?key|secret|bearer|postgres:\/\//i);
  });
});
