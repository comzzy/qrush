import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestClient,
  createWalletClient,
  erc20Abi,
  http,
  parseEther,
  parseUnits,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { createSiweMessage } from "viem/siwe";
import { BASE } from "./constants.js";
import { startHarness, type Harness } from "./harness.js";

type Tx = { to: Address; value: string; data: Hex };

let h: Harness;
let seller: WalletClient;
let buyer: WalletClient;
// Fresh keys: well-known dev addresses carry live EIP-7702 delegations on Base mainnet.
const sellerAccount = privateKeyToAccount(generatePrivateKey());
const buyerAccount = privateKeyToAccount(generatePrivateKey());
const partner = privateKeyToAccount(generatePrivateKey()).address;
let token = "";

async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<{ status: number; body: T }> {
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  const res = await fetch(`${h.baseUrl}${path}`, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

async function send(wallet: WalletClient, tx: Tx) {
  const hash = await wallet.sendTransaction({
    account: wallet.account!,
    chain: wallet.chain,
    to: tx.to,
    data: tx.data,
    value: BigInt(tx.value),
  });
  const receipt = await h.client.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");
  return receipt;
}

function openFeed(query = "") {
  const events: unknown[] = [];
  const controller = new AbortController();
  const ready = (async () => {
    const res = await fetch(`${h.baseUrl}/feed/live${query}`, { signal: controller.signal });
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let resolveReady: () => void = () => undefined;
    const readyPromise = new Promise<void>((r) => (resolveReady = r));
    void (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          let idx;
          while ((idx = buffer.indexOf("\n\n")) >= 0) {
            const chunk = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const event = /^event: (.*)$/m.exec(chunk)?.[1];
            const data = /^data: (.*)$/m.exec(chunk)?.[1];
            if (event === "ready") resolveReady();
            if (event === "payment" && data) events.push(JSON.parse(data));
          }
        }
      } catch {
        /* aborted */
      }
    })();
    await readyPromise;
  })();
  return { events, ready, close: () => controller.abort() };
}

async function waitFor<T>(fn: () => T | undefined | Promise<T | undefined>, timeoutMs = 20_000): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const v = await fn();
    if (v !== undefined && v !== null && v !== false) return v as T;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("timed out");
}

async function signIn(wallet: WalletClient) {
  const { body: n } = await api<{ nonce: string; domain: string; uri: string; chainId: number }>("/auth/nonce");
  const message = createSiweMessage({
    address: wallet.account!.address,
    chainId: n.chainId,
    domain: n.domain,
    nonce: n.nonce,
    uri: n.uri,
    version: "1",
    statement: "Sign in to QRush",
  });
  const signature = await wallet.signMessage({ account: wallet.account!, message });
  return { message, signature, res: await api<{ token: string; address: string }>("/auth/verify", { method: "POST", json: { message, signature } }) };
}

describe("QRush API end to end on a Base mainnet fork", () => {
  let shopId = "";
  let productIds: string[] = [];
  let invoice: { id: string; invoiceKey: Hex; payUrl: string };
  const feed = { current: undefined as ReturnType<typeof openFeed> | undefined };

  beforeAll(async () => {
    h = await startHarness();
    h.indexer.start();
    const chain = { ...base, rpcUrls: { default: { http: [h.config.rpcUrls[0]!] } } };
    seller = createWalletClient({ account: sellerAccount, chain, transport: http(h.config.rpcUrls[0]!) });
    buyer = createWalletClient({ account: buyerAccount, chain, transport: http(h.config.rpcUrls[0]!) });
    const testClient = createTestClient({ mode: "anvil", chain, transport: http(h.config.rpcUrls[0]!) });
    await testClient.setBalance({ address: buyerAccount.address, value: parseEther("50") });
    await testClient.setBalance({ address: sellerAccount.address, value: parseEther("1") });
    await testClient.request({
      method: "anvil_dealERC20" as never,
      params: [buyerAccount.address, BASE.USDC, `0x${parseUnits("1000", 6).toString(16)}`] as never,
    });
    await testClient.request({
      method: "anvil_dealERC20" as never,
      params: [buyerAccount.address, BASE.CBBTC, `0x${parseUnits("0.5", 8).toString(16)}`] as never,
    });
  });

  afterAll(async () => {
    feed.current?.close();
    await h.stop();
  });

  it("rejects protected routes without a session", async () => {
    expect((await api("/shops")).status).toBe(401);
  });

  it("signs in with SIWE and rejects nonce replay", async () => {
    const { message, signature, res } = await signIn(seller);
    expect(res.status).toBe(200);
    expect(res.body.address).toBe(sellerAccount.address);
    token = res.body.token;
    const replay = await api("/auth/verify", { method: "POST", json: { message, signature } });
    expect(replay.status).toBe(401);
    const me = await api<{ address: string }>("/auth/me");
    expect(me.body.address).toBe(sellerAccount.address);
  });

  it("registers the seller onchain with an 80/20 split and loyalty", async () => {
    const reg = await api<{ tx: Tx }>("/seller/onchain/register", {
      method: "POST",
      json: { name: "Mama Put", splits: [{ recipient: sellerAccount.address, bps: 8000 }, { recipient: partner, bps: 2000 }] },
    });
    expect(reg.status).toBe(200);
    await send(seller, reg.body.tx);
    const loyalty = await api<{ tx: Tx }>("/seller/loyalty", { method: "PUT", json: { threshold: 1, discountBps: 1000 } });
    await send(seller, loyalty.body.tx);

    const splits = await api<{ splits: { recipient: string; bps: number }[] }>("/seller/splits");
    expect(splits.body.splits).toEqual([
      { recipient: sellerAccount.address, bps: 8000 },
      { recipient: partner, bps: 2000 },
    ]);
    expect((await api("/seller/loyalty")).body).toEqual({ threshold: 1, discountBps: 1000 });
    const bad = await api("/seller/splits", { method: "PUT", json: { splits: [{ recipient: partner, bps: 9000 }] } });
    expect(bad.status).toBe(400);
    await waitFor(async () => (await api<{ onchainRegistered: boolean }>("/auth/me")).body.onchainRegistered);
  });

  it("creates a shop and products", async () => {
    const shop = await api<{ id: string; slug: string }>("/shops", {
      method: "POST",
      json: { name: "Mama Put Kitchen", slug: "mama-put", latitude: 6.5244, longitude: 3.3792, city: "Lagos", country: "NG" },
    });
    expect(shop.status).toBe(201);
    shopId = shop.body.id;
    const created = await api<{ id: string; price: string }[]>(`/shops/${shopId}/products`, {
      method: "POST",
      json: [
        { name: "Jollof rice", price: "4.50" },
        { name: "Suya", price: 3 },
      ],
    });
    expect(created.status).toBe(201);
    expect(created.body.map((p) => p.price)).toEqual(["4.5", "3"]);
    productIds = created.body.map((p) => p.id);

    const patched = await api<{ price: string }>(`/shops/${shopId}/products/${productIds[1]}`, {
      method: "PATCH",
      json: { price: "3.25" },
    });
    expect(patched.body.price).toBe("3.25");
    const publicShop = await fetch(`${h.baseUrl}/shops/by-slug/mama-put`).then((r) => r.json());
    expect(publicShop.products).toHaveLength(2);
    expect((await api("/shops", { method: "POST", json: { name: "Dup", slug: "mama-put" } })).status).toBe(409);
  });

  it("creates a signed reusable pay link with QR codes", async () => {
    const res = await api<{
      invoice: { id: string; invoiceKey: Hex; payUrl: string; amount: string; status: string; qr: { png: string; svg: string } };
      typedData: { domain: Record<string, unknown>; message: Record<string, unknown> };
      qrSvg: string;
    }>("/invoices", {
      method: "POST",
      json: {
        shopId,
        items: [
          { productId: productIds[0], quantity: 2 },
          { productId: productIds[1], quantity: 1 },
        ],
        maxUses: 0,
        memo: "Table 4",
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.invoice.amount).toBe("12.25");
    expect(res.body.invoice.status).toBe("awaiting_signature");
    expect(res.body.qrSvg).toContain("<svg");
    invoice = res.body.invoice;

    const pending = await api(`/pay/${invoice.invoiceKey}/checkout?buyer=${buyerAccount.address}`);
    expect(pending.status).toBe(409);

    const m = res.body.typedData.message as {
      id: Hex;
      seller: Address;
      amount: string;
      expiresAt: string;
      maxUses: number;
      items: { name: string; quantity: number; unitPrice: string }[];
    };
    const signature = await seller.signTypedData({
      account: sellerAccount,
      domain: res.body.typedData.domain as never,
      types: {
        Invoice: [
          { name: "id", type: "bytes32" },
          { name: "seller", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "expiresAt", type: "uint64" },
          { name: "maxUses", type: "uint32" },
          { name: "items", type: "Item[]" },
        ],
        Item: [
          { name: "name", type: "string" },
          { name: "quantity", type: "uint32" },
          { name: "unitPrice", type: "uint256" },
        ],
      },
      primaryType: "Invoice",
      message: {
        ...m,
        amount: BigInt(m.amount),
        expiresAt: BigInt(m.expiresAt),
        items: m.items.map((i) => ({ ...i, unitPrice: BigInt(i.unitPrice) })),
      },
    });
    const forged = await buyer.signMessage({ account: buyerAccount, message: "nope" });
    expect((await api(`/invoices/${invoice.id}/signature`, { method: "POST", json: { signature: forged } })).status).toBe(400);
    const signed = await api<{ status: string }>(`/invoices/${invoice.id}/signature`, { method: "POST", json: { signature } });
    expect(signed.status).toBe(200);
    expect(signed.body.status).toBe("signed");

    const png = await fetch(res.body.invoice.qr.png);
    expect(png.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await png.arrayBuffer());
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const svg = await fetch(res.body.invoice.qr.svg).then((r) => r.text());
    expect(svg).toContain("<svg");

    const view = await fetch(invoice.payUrl, { headers: { "x-vercel-ip-latitude": "6.45", "x-vercel-ip-longitude": "3.39" } }).then((r) =>
      r.json(),
    );
    expect(view.payable).toBe(true);
    expect(view.onchain.status).toBe("none");
    expect(view.shop.name).toBe("Mama Put Kitchen");
  });

  it("pays in USDC (publish + pay in one multicall), indexes it, and streams it live", async () => {
    feed.current = openFeed(`?seller=${sellerAccount.address}`);
    await feed.current.ready;

    const sellerBefore = await h.client.readContract({ address: BASE.USDC, abi: erc20Abi, functionName: "balanceOf", args: [sellerAccount.address] });
    const quote = await api<{ amountDue: string; discount: string; transactions: Tx[]; calls: Tx[] }>(
      `/pay/${invoice.invoiceKey}/checkout?buyer=${buyerAccount.address}&token=usdc`,
    );
    expect(quote.status).toBe(200);
    expect(quote.body.amountDue).toBe("12.25");
    expect(quote.body.discount).toBe("0");
    expect(quote.body.calls).toHaveLength(3);
    expect(quote.body.transactions).toHaveLength(2);
    for (const tx of quote.body.transactions) await send(buyer, tx);

    const event = await waitFor(() => feed.current!.events[0] as { receiptId: number; netAmount: string; payouts: unknown[]; geo: { source: string; city: string } });
    expect(event.netAmount).toBe("12250000");
    expect(event.payouts).toEqual([
      { recipient: sellerAccount.address, amount: "9800000" },
      { recipient: partner, amount: "2450000" },
    ]);
    expect(event.geo.source).toBe("shop");
    expect(event.geo.city).toBe("Lagos");

    const receipt = await api<{ total: string; items: unknown[]; paidWith: string; purchaseNumber: number; memo: string }>(`/receipts/${event.receiptId}`);
    expect(receipt.body.total).toBe("12.25");
    expect(receipt.body.paidWith).toBe(BASE.USDC);
    expect(receipt.body.items).toHaveLength(2);
    expect(receipt.body.memo).toBe("Table 4");
    expect(receipt.body.purchaseNumber).toBe(1);

    const sellerAfter = await h.client.readContract({ address: BASE.USDC, abi: erc20Abi, functionName: "balanceOf", args: [sellerAccount.address] });
    expect(sellerAfter - sellerBefore).toBe(9_800_000n);
  });

  it("applies the loyalty discount and pays via ETH -> USDC swap on Uniswap v3", async () => {
    const loyalty = await api<{ purchases: number; eligible: boolean }>(`/loyalty/${sellerAccount.address}/${buyerAccount.address}`);
    expect(loyalty.body).toMatchObject({ purchases: 1, eligible: true });

    const quote = await api<{ amountDue: string; discount: string; swap: { path: Hex; maxAmountIn: string }; transactions: Tx[] }>(
      `/pay/${invoice.invoiceKey}/checkout?buyer=${buyerAccount.address}&token=eth&slippageBps=100`,
    );
    expect(quote.status).toBe(200);
    expect(quote.body.discount).toBe("1.225");
    expect(quote.body.amountDue).toBe("11.025");
    expect(quote.body.transactions).toHaveLength(1);
    const ethBefore = await h.client.getBalance({ address: buyerAccount.address });
    const r = await send(buyer, quote.body.transactions[0]!);
    const ethAfter = await h.client.getBalance({ address: buyerAccount.address });
    expect(ethBefore - ethAfter - r.gasUsed * r.effectiveGasPrice).toBeLessThanOrEqual(BigInt(quote.body.swap.maxAmountIn));

    const event = await waitFor(() => feed.current!.events[1] as { receiptId: number; netAmount: string; discount: string; tokenIn: string });
    expect(event.netAmount).toBe("11025000");
    expect(event.discount).toBe("1225000");
    expect(event.tokenIn).toBe("0x0000000000000000000000000000000000000000");
    const receipt = await api<{ paidWith: string; purchaseNumber: number }>(`/receipts/${event.receiptId}`);
    expect(receipt.body.paidWith).toBe("ETH");
    expect(receipt.body.purchaseNumber).toBe(2);
  });

  it("pays with an arbitrary ERC20 (cbBTC) via a routed swap", async () => {
    const quote = await api<{ amountDue: string; swap: { hops: number }; transactions: Tx[] }>(
      `/pay/${invoice.invoiceKey}/checkout?buyer=${buyerAccount.address}&token=${BASE.CBBTC}`,
    );
    expect(quote.status).toBe(200);
    expect(quote.body.transactions).toHaveLength(2);
    for (const tx of quote.body.transactions) await send(buyer, tx);
    const event = await waitFor(() => feed.current!.events[2] as { tokenIn: string; netAmount: string; purchaseNumber: number });
    expect(event.tokenIn).toBe(BASE.CBBTC);
    expect(event.netAmount).toBe("11025000");
    expect(event.purchaseNumber).toBe(3);

    const cbbtcLeft = await h.client.readContract({ address: BASE.CBBTC, abi: erc20Abi, functionName: "balanceOf", args: [h.config.CHECKOUT_ADDRESS] });
    expect(cbbtcLeft).toBe(0n);
  });

  it("reports receipts, invoice usage, loyalty, and map feed", async () => {
    const mine = await api<{ receiptId: number }[]>("/receipts/mine");
    expect(mine.body).toHaveLength(3);
    const inv = await api<{ uses: number; status: string }>(`/invoices/${invoice.id}`);
    expect(inv.body).toMatchObject({ uses: 3, status: "open" });
    const loyalty = await api<{ purchases: number }>(`/loyalty/${sellerAccount.address}/${buyerAccount.address}`);
    expect(loyalty.body.purchases).toBe(3);
    const map = await api<{ latitude: number; longitude: number }[]>("/feed/recent");
    expect(map.body).toHaveLength(3);
    expect(map.body[0]).toMatchObject({ latitude: 6.5244, longitude: 3.3792 });
    const partnerBal = await h.client.readContract({ address: BASE.USDC, abi: erc20Abi, functionName: "balanceOf", args: [partner] });
    expect(partnerBal).toBe(2_450_000n + 2_205_000n * 2n);
  });

  it("cancels a single-use invoice onchain and the indexer marks it cancelled", async () => {
    const created = await api<{ invoice: { id: string; invoiceKey: Hex }; createInvoiceTx: Tx }>("/invoices", {
      method: "POST",
      json: { shopId, amount: "5", maxUses: 1, expiresInSeconds: 3600 },
    });
    await send(seller, created.body.createInvoiceTx);
    await waitFor(async () => (await api<{ status: string }>(`/invoices/${created.body.invoice.id}`)).body.status === "open");
    const cancel = await api<{ tx: Tx }>(`/invoices/${created.body.invoice.id}/cancel`, { method: "POST" });
    await send(seller, cancel.body.tx);
    await waitFor(async () => (await api<{ status: string }>(`/invoices/${created.body.invoice.id}`)).body.status === "cancelled");
    expect((await api(`/pay/${created.body.invoice.invoiceKey}/checkout?buyer=${buyerAccount.address}`)).status).toBe(409);
  });

  it("isolates sellers from each other's shops", async () => {
    const other = await signIn(buyer);
    const sellerToken = token;
    token = other.res.body.token;
    expect((await api(`/shops/${shopId}`)).status).toBe(403);
    expect((await api("/invoices", { method: "POST", json: { shopId, amount: "1" } })).status).toBe(403);
    token = sellerToken;
  });

  it("resolves Basenames forward and reverse from Base state", async () => {
    const fwd = await api<{ name: string; address: string }>("/basenames/resolve/jesse");
    expect(fwd.status).toBe(200);
    expect(fwd.body.name).toBe("jesse.base.eth");
    const rev = await api<{ name: string }>(`/basenames/reverse/${fwd.body.address}`);
    expect(rev.body.name).toBe("jesse.base.eth");
    expect((await api("/basenames/resolve/jesse.eth")).status).toBe(400);
  });
});
