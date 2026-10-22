import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // In-process PostgreSQL (MOCK/local only) ships a WASM binary that must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
