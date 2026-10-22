import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const forbid = (reason, ...groups) => ({
  "no-restricted-imports": [
    "error",
    { patterns: groups.map((group) => ({ group, message: reason })) },
  ],
});

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
    },
  },
  // Module boundaries (docs/ARCHITECTURE.md): deterministic domain code must not
  // depend on persistence, sponsor adapters or the web layer.
  {
    files: ["src/brindle/**/*.ts"],
    ignores: ["src/brindle/**/*.test.ts"],
    rules: forbid(
      "src/brindle is the deterministic domain core; it must not import db, integrations, config or app.",
      ["**/db", "**/db/*", "**/integrations", "**/integrations/*", "**/config", "**/config/*"],
      ["**/app", "**/app/*"],
    ),
  },
  // Sponsor adapters sit beside the core: no persistence, no recovery executors.
  {
    files: ["src/integrations/**/*.ts"],
    ignores: ["src/integrations/**/*.test.ts"],
    rules: forbid(
      "Sponsor adapters must not reach into db, app or recovery (mutation belongs to registered RecoveryCapabilities).",
      ["**/db", "**/db/*", "**/app", "**/app/*", "**/brindle/recovery", "**/brindle/recovery/*"],
    ),
  },
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "drizzle/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
  ]),
]);
