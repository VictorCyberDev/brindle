import { defineConfig } from "@playwright/test";

const port = 3100;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: `npm run build && npm run start -- --port ${port} --hostname 127.0.0.1`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      BRINDLE_RUNTIME_MODE: "local",
      BRINDLE_E2E_EPHEMERAL_DB: "1",
      BETTER_AUTH_SECRET: "e2e-only-secret-e2e-only-secret-e2e-only-0000",
      BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
      BRINDLE_IP_SALT: "e2e-salt",
    },
  },
});
