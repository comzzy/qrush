import { describe, expect, it } from "vitest";
import { geoFromHeaders } from "../src/lib/geo.js";
import { formatUsdc, parseUsdc } from "../src/lib/money.js";
import { normalizeBasename } from "../src/services/basenames.js";
import { encodeExactOutputPath } from "../src/services/swapQuote.js";
import { loadConfig } from "../src/config.js";
import { BASE } from "./constants.js";

describe("money", () => {
  it("parses and formats USDC amounts", () => {
    expect(parseUsdc("12.25")).toBe(12_250_000n);
    expect(parseUsdc(3)).toBe(3_000_000n);
    expect(formatUsdc(1_225_000n)).toBe("1.225");
    expect(() => parseUsdc("-1")).toThrow();
    expect(() => parseUsdc("1.1234567")).toThrow();
    expect(() => parseUsdc("abc")).toThrow();
  });
});

describe("geo headers", () => {
  it("reads Vercel and Cloudflare style headers", () => {
    const v: Record<string, string> = { "x-vercel-ip-latitude": "6.5", "x-vercel-ip-longitude": "3.4", "x-vercel-ip-city": "Lagos%20Island", "x-vercel-ip-country": "NG" };
    expect(geoFromHeaders((n) => v[n])).toEqual({ latitude: 6.5, longitude: 3.4, city: "Lagos Island", country: "NG" });
    const cf: Record<string, string> = { "cf-iplatitude": "nope", "cf-ipcountry": "KE" };
    expect(geoFromHeaders((n) => cf[n])).toEqual({ latitude: null, longitude: null, city: null, country: "KE" });
  });
});

describe("basename normalization", () => {
  it("accepts labels and base.eth names only", () => {
    expect(normalizeBasename("Jesse")).toBe("jesse.base.eth");
    expect(normalizeBasename("jesse.base.eth")).toBe("jesse.base.eth");
    expect(() => normalizeBasename("vitalik.eth")).toThrow();
  });
});

describe("swap path encoding", () => {
  it("encodes exact-output paths USDC first", () => {
    const path = encodeExactOutputPath([BASE.USDC, BASE.WETH], [500]);
    expect(path.toLowerCase()).toBe(`${BASE.USDC}0001f4${BASE.WETH.slice(2)}`.toLowerCase());
    expect(() => encodeExactOutputPath([BASE.USDC], [500])).toThrow();
  });
});

describe("config", () => {
  it("requires a checkout address and strong JWT secret", () => {
    expect(() => loadConfig({ RPC_URL: "http://x", JWT_SECRET: "short" })).toThrow();
    const cfg = loadConfig({ RPC_URL: "http://x", JWT_SECRET: "x".repeat(32), CHECKOUT_ADDRESS: BASE.WETH });
    expect(cfg.CHAIN_ID).toBe(8453);
    expect(cfg.USDC_ADDRESS).toBe(BASE.USDC);
  });
});

describe("config blanks", () => {
  it("treats empty optional values as unset", () => {
    const cfg = loadConfig({ JWT_SECRET: "x".repeat(32), CHECKOUT_ADDRESS: BASE.WETH, PAYMASTER_URL: "", AI_API_KEY: " " });
    expect(cfg.PAYMASTER_URL).toBeUndefined();
    expect(cfg.AI_API_KEY).toBeUndefined();
  });
});
