import { expect, test } from "@playwright/test";

// The M2 transition deliberately appends history to the same sandbox used by M1.
test.describe.configure({ mode: "serial" });

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

test("M2 sandbox revision reveals candidates and preserves the unrelated control", async ({
  page,
  request,
}) => {
  await page.goto("/demo");
  await page.getByTestId("run-success").click();
  await expect(page.getByTestId("control-message")).toContainText("HTTP 200");
  await page.getByTestId("inject-revision").click();
  await expect(page.getByTestId("control-message")).toContainText("CANDIDATES_READY");
  await expect(page.getByText("RETROACTIVE", { exact: true })).toBeVisible();
  await expect(page.getByTestId("candidate-count")).toHaveText("10");
  await expect(page.getByTestId("consequence-map")).toContainText("PO-827");
  await expect(page.getByTestId("consequence-map")).not.toContainText("PO-901");
  await expect(page.getByTestId("temporal-control")).toContainText(
    "Outside Atlas candidate blast radius",
  );
  await expect(
    page.getByText(
      "M2 identifies candidates for review. Materiality has not been evaluated. No recovery has run.",
    ),
  ).toBeVisible();
  const again = await request.post("/api/demo/revise-truth");
  expect(again.status()).toBe(200);
  const body = await again.json();
  expect(body.result.candidates).toHaveLength(10);
  expect(JSON.stringify(body)).not.toMatch(/api[_-]?key|secret|bearer|postgres:\/\//i);
});

test("M3 assesses materiality without recovering or touching the unrelated control", async ({
  page,
  request,
}) => {
  await page.goto("/demo");
  await page.getByTestId("assess-materiality").click();
  await expect(page.getByTestId("control-message")).toContainText("MATERIALITY_ASSESSED");
  await expect(page.getByTestId("materiality-counts")).toContainText(
    "3 examined · 1 SAME / PRESERVE · 2 CHANGED · 0 UNCERTAIN",
  );
  await expect(page.getByText("What would actually have differed?")).toBeVisible();
  const repeat = await request.post("/api/demo/assess-materiality");
  expect(repeat.status()).toBe(200);
  expect((await repeat.json()).result.examined).toBe(3);
});

test("M4 plans four bounded steps and executes without claiming recovery proof", async ({
  page,
  request,
}) => {
  await page.goto("/demo");
  await page.getByTestId("plan-recovery").click();
  await expect(page.getByTestId("recovery-state")).toHaveText("RECOVERY_PLANNED");
  await expect(page.getByTestId("recovery-step-count")).toHaveText("4 bounded steps");
  await page.getByTestId("execute-recovery").click();
  await expect(page.getByTestId("recovery-state")).toHaveText("VERIFYING");
  await expect(
    page.getByText(
      "Recovery executed. Independent verification is still required. Executor success is not recovery proof.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "RECOVERY PROVEN", exact: true })).toHaveCount(0);
  const retry = await request.post("/api/demo/execute-recovery");
  expect(retry.status()).toBe(200);
  const body = await retry.json();
  expect(
    body.result.evidence.filter((e: { kind: string }) =>
      ["EXECUTION", "REMEDIATION"].includes(e.kind),
    ),
  ).toHaveLength(4);
  expect(body.result.incident.closure).toBeNull();
});
