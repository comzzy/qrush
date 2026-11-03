import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const dev = process.env.NODE_ENV !== "production";
// The e2e build talks to a local Base fork over plain http, so its origin is allowed only when set.
const testRpc = process.env.NEXT_PUBLIC_TEST_RPC_URL ? new URL(process.env.NEXT_PUBLIC_TEST_RPC_URL).origin : "";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https: wss:${testRpc ? ` ${testRpc}` : ""}${dev ? " ws:" : ""}`,
  "frame-src 'self' https://verify.walletconnect.org https://verify.walletconnect.com https://keys.coinbase.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const config: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
