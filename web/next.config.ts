import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const config: NextConfig = {
  reactStrictMode: true,
  // The API runs in-process; keep it and its native SQLite binding out of the bundle.
  serverExternalPackages: ["qrush-api", "better-sqlite3"],
  outputFileTracingRoot: root,
  outputFileTracingIncludes: {
    "/api/[[...path]]": ["./drizzle/**/*"],
  },
  outputFileTracingExcludes: {
    "*": ["./design-reference/**/*", "../api/qrush.db*", "../contracts/**/*"],
  },
  turbopack: { root },
  poweredByHeader: false,
};

export default config;
