import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encodeFunctionData, erc20Abi, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { toCoinbaseSmartAccount, entryPoint07Address } from "viem/account-abstraction";
import { createSiweMessage } from "viem/siwe";
import { qrushCheckoutAbi } from "../src/contracts/artifact.js";
import { isSponsorable } from "../src/aa/policy.js";
import { BASE } from "./constants.js";
import { startHarness, type Harness } from "./harness.js";
import { startMockServer, type Recorded } from "./mockServer.js";

const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function signIn(h: Harness) {
  const account = privateKeyToAccount(generatePrivateKey());
  const n = await fetch(`${h.baseUrl}/auth/nonce`).then((r) => r.json());
  const message = createSiweMessage({ address: account.address, chainId: n.chainId, domain: n.domain, nonce: n.nonce, uri: n.uri, version: "1" });
  const signature = await account.signMessage({ message });
  const res = await fetch(`${h.baseUrl}/auth/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, signature }),
  }).then((r) => r.json());
  return { account, token: res.token as string };
}

function call(h: Harness, token: string, path: string, init: RequestInit & { json?: unknown } = {}) {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  return fetch(`${h.baseUrl}${path}`, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
}

describe("AI price-list extraction", () => {
  let h: Harness;
  let ai: Awaited<ReturnType<typeof startMockServer>>;
  let reply: { currency: string | null; products: { name: string; description: string | null; price: number; category: string | null }[] };

  beforeAll(async () => {
    ai = await startMockServer((req: Recorded) => {
      if (req.headers.authorization !== "Bearer sk-test") return { status: 401, body: { error: "bad key" } };
      return { body: { model: "vision-test", choices: [{ message: { content: JSON.stringify(reply) } }] } };
    });
    h = await startHarness({ AI_API_KEY: "sk-test", AI_BASE_URL: `${ai.url}/v1`, AI_MODEL: "vision-test" });
  });
  afterAll(async () => {
    await h.stop();
    await ai.close();
  });

  it("extracts products from an uploaded photo and saves them to the shop", async () => {
    reply = {
      currency: "USD",
      products: [
        { name: "Espresso", description: null, price: 2.5, category: "Coffee" },
        { name: "Croissant", description: "Butter", price: 3.75, category: "Bakery" },
        { name: "Water", description: null, price: 0, category: null },
      ],
    };
    const { token } = await signIn(h);
    const shop = await call(h, token, "/shops", { method: "POST", json: { name: "Corner Cafe" } }).then((r) => r.json());
    const form = new FormData();
    form.set("image", new Blob([Buffer.from(PNG_1PX, "base64")], { type: "image/png" }), "menu.png");
    form.set("shopId", shop.id);
    const res = await call(h, token, "/ai/shop-setup", { method: "POST", body: form });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.products.map((p: { priceUsdc: string }) => p.priceUsdc)).toEqual(["2500000", "3750000", "0"]);
    expect(body.created.map((p: { name: string; price: string }) => [p.name, p.price])).toEqual([
      ["Espresso", "2.5"],
      ["Croissant", "3.75"],
    ]);

    const sent = ai.requests.at(-1)!;
    expect(sent.url).toBe("/v1/chat/completions");
    const payload = sent.body as { model: string; response_format: { type: string }; messages: { content: unknown }[] };
    expect(payload.model).toBe("vision-test");
    expect(payload.response_format.type).toBe("json_schema");
    expect(JSON.stringify(payload.messages[1]!.content)).toContain(`data:image/png;base64,${PNG_1PX}`);

    const products = await call(h, token, `/shops/${shop.id}/products`).then((r) => r.json());
    expect(products).toHaveLength(2);
  });

  it("flags non-USD price lists instead of saving wrong prices", async () => {
    reply = { currency: "NGN", products: [{ name: "Suya", description: null, price: 1500, category: null }] };
    const { token } = await signIn(h);
    const shop = await call(h, token, "/shops", { method: "POST", json: { name: "Grill" } }).then((r) => r.json());
    const res = await call(h, token, "/ai/shop-setup", { method: "POST", json: { imageBase64: PNG_1PX, mimeType: "image/png", shopId: shop.id } });
    const body = await res.json();
    expect(body.requiresCurrencyConversion).toBe(true);
    expect(body.created).toEqual([]);
  });

  it("validates input and surfaces upstream failures", async () => {
    const { token } = await signIn(h);
    expect((await call(h, token, "/ai/shop-setup", { method: "POST", json: {} })).status).toBe(400);
    expect((await call(h, token, "/ai/shop-setup", { method: "POST", json: { imageBase64: PNG_1PX, mimeType: "text/plain" } })).status).toBe(400);
    reply = { currency: null, products: "oops" as never };
    expect((await call(h, token, "/ai/shop-setup", { method: "POST", json: { imageUrl: "https://example.com/menu.jpg" } })).status).toBe(502);
  });

  it("returns 503 when no vision provider is configured", async () => {
    const bare = await startHarness();
    try {
      const { token } = await signIn(bare);
      const res = await call(bare, token, "/ai/shop-setup", { method: "POST", json: { imageUrl: "https://example.com/menu.jpg" } });
      expect(res.status).toBe(503);
    } finally {
      await bare.stop();
    }
  });
});

describe("ERC-4337 smart wallet sponsorship", () => {
  let h: Harness;
  let upstream: Awaited<ReturnType<typeof startMockServer>>;
  let checkout: Address;

  beforeAll(async () => {
    upstream = await startMockServer((req) => {
      const body = req.body as { id: number; method: string };
      if (body.method === "eth_chainId") return { body: { jsonrpc: "2.0", id: body.id, result: "0x2105" } };
      return { body: { jsonrpc: "2.0", id: body.id, result: { paymaster: "0x00000000000000000000000000000000000000aa", paymasterData: "0x01", sponsor: { name: "QRush" } } } };
    });
    h = await startHarness({
      PAYMASTER_URL: `${upstream.url}/paymaster`,
      BUNDLER_URL: `${upstream.url}/bundler`,
      PAYMASTER_CONTEXT: JSON.stringify({ policyId: "pol_123" }),
    });
    checkout = h.config.CHECKOUT_ADDRESS;
  });
  afterAll(async () => {
    await h.stop();
    await upstream.close();
  });

  async function passkeyLikeAccount() {
    const owner = privateKeyToAccount(generatePrivateKey());
    return toCoinbaseSmartAccount({ client: h.client, owners: [owner], version: "1.1" });
  }

  function rpc(path: string, method: string, params: unknown[]) {
    return fetch(`${h.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 7, method, params }),
    }).then((r) => r.json());
  }

  it("publishes smart wallet config", async () => {
    const cfg = await fetch(`${h.baseUrl}/aa/config`).then((r) => r.json());
    expect(cfg).toMatchObject({
      chainId: 8453,
      entryPoint: entryPoint07Address,
      checkout,
      paymasterUrl: `${h.baseUrl}/aa/paymaster`,
      bundlerUrl: `${h.baseUrl}/aa/bundler`,
    });
  });

  it("sponsors a Coinbase Smart Wallet batch of approve + checkout payment", async () => {
    const account = await passkeyLikeAccount();
    const callData = await account.encodeCalls([
      { to: BASE.USDC, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [checkout, 5_000_000n] }) },
      { to: checkout, data: encodeFunctionData({ abi: qrushCheckoutAbi, functionName: "payWithUSDC", args: [`0x${"11".repeat(32)}` as Hex] }) },
    ]);
    expect(isSponsorable(callData, checkout)).toEqual({ ok: true });
    const res = await rpc("/aa/paymaster", "pm_getPaymasterStubData", [{ sender: account.address, callData }, entryPoint07Address, "0x2105", {}]);
    expect(res.result.paymaster).toBe("0x00000000000000000000000000000000000000aa");
    const forwarded = upstream.requests.at(-1)!.body as { params: unknown[] };
    expect(forwarded.params[3]).toEqual({ policyId: "pol_123" });
  });

  it("refuses to sponsor calls outside QRush checkout", async () => {
    const account = await passkeyLikeAccount();
    const drain = await account.encodeCalls([
      { to: BASE.USDC, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [account.address, 1n] }) },
    ]);
    const before = upstream.requests.length;
    const res = await rpc("/aa/paymaster", "pm_getPaymasterData", [{ sender: account.address, callData: drain }, entryPoint07Address, "0x2105", {}]);
    expect(res.error.code).toBe(-32001);
    const approveOther = await account.encodeCalls([
      { to: BASE.USDC, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [account.address, 1n] }) },
    ]);
    expect((await rpc("/aa/paymaster", "pm_getPaymasterData", [{ sender: account.address, callData: approveOther }, entryPoint07Address, "0x2105", {}])).error.code).toBe(-32001);
    const withValue = await account.encodeCalls([{ to: checkout, value: 1n, data: "0x" }]);
    expect(isSponsorable(withValue, checkout).ok).toBe(false);
    expect((await rpc("/aa/paymaster", "pm_getPaymasterData", [{ callData: drain }, "0x0000000071727De22E5E9d8BAf0edAc6f37da032", "0x1", {}])).error.code).toBe(-32602);
    expect(upstream.requests.length).toBe(before);
  });

  it("proxies only bundler methods", async () => {
    expect((await rpc("/aa/bundler", "eth_chainId", [])).result).toBe("0x2105");
    expect((await rpc("/aa/bundler", "debug_bundler_clearState", [])).error.code).toBe(-32601);
  });
});
