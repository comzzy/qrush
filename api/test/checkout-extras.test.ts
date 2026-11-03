/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed JSON responses in a test */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestClient, createWalletClient, http, parseEther, parseUnits, type Address, type Hex, type WalletClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { createSiweMessage } from "viem/siwe";
import type { FileStore } from "../src/services/files.js";
import { PDFDocument } from "pdf-lib";
import { unlockMessage } from "../src/services/paymentProof.js";
import { BASE } from "./constants.js";
import { startHarness, type Harness } from "./harness.js";

type Tx = { to: Address; value: string; data: Hex };

/** Keeps uploaded bytes in memory so delivery can be tested without cloud storage. */
class MemoryFiles implements FileStore {
  blobs = new Map<string, { bytes: Uint8Array; contentType: string }>();
  async handleUpload(): Promise<unknown> {
    throw new Error("client uploads need Vercel Blob");
  }
  async head(pathname: string) {
    const b = this.blobs.get(pathname);
    return b ? { size: b.bytes.length, contentType: b.contentType } : null;
  }
  async open(pathname: string, _ttl: number, fileName: string, disposition = "attachment") {
    const b = this.blobs.get(pathname)!;
    const headers = { "content-type": b.contentType, "content-disposition": `${disposition}; filename="${fileName}"` };
    return { response: new Response(Buffer.from(b.bytes), { headers }) };
  }
  async remove(pathname: string) {
    this.blobs.delete(pathname);
  }
  async read(pathname: string) {
    return this.blobs.get(pathname)!.bytes;
  }
  async write(pathname: string, bytes: Uint8Array, contentType: string) {
    const p = pathname.replace(/(\.[a-z]+)$/, "-r4nd$1");
    this.blobs.set(p, { bytes, contentType });
    return p;
  }
}

let h: Harness;
const files = new MemoryFiles();
const sellerAccount = privateKeyToAccount(generatePrivateKey());
const buyerAccount = privateKeyToAccount(generatePrivateKey());
const strangerAccount = privateKeyToAccount(generatePrivateKey());
let seller: WalletClient;
let buyer: WalletClient;
let stranger: WalletClient;
let token = "";
let pdfBytes: Uint8Array;

async function api<T = any>(path: string, init: RequestInit & { json?: unknown; auth?: boolean } = {}) {
  const headers = new Headers(init.headers);
  if (token && init.auth !== false) headers.set("authorization", `Bearer ${token}`);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  const res = await fetch(`${h.baseUrl}${path}`, {
    ...init,
    redirect: "manual",
    headers,
    method: init.method ?? (init.json !== undefined ? "POST" : "GET"),
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  const text = await res.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* not json */
  }
  return { status: res.status, body: body as T, headers: res.headers };
}

async function send(wallet: WalletClient, tx: Tx) {
  const hash = await wallet.sendTransaction({ account: wallet.account!, chain: wallet.chain, to: tx.to, data: tx.data, value: BigInt(tx.value) });
  const receipt = await h.client.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");
  return hash;
}

async function signIn(wallet: WalletClient) {
  const { body: n } = await api("/auth/nonce");
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
  return (await api("/auth/verify", { json: { message, signature } })).body.token as string;
}

async function waitFor<T>(fn: () => Promise<T | undefined | null | false>, ms = 20_000): Promise<T> {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("timed out");
}

describe("buyer details and paid downloads", () => {
  let shopId = "";
  let ebook = "";
  let key: Hex;
  let orderId = "";
  let txHash: Hex;

  beforeAll(async () => {
    h = await startHarness({}, fetch, files);
    h.indexer.start();
    const rpc = h.config.rpcUrls[0]!;
    const chain = { ...base, rpcUrls: { default: { http: [rpc] } } };
    seller = createWalletClient({ account: sellerAccount, chain, transport: http(rpc) });
    buyer = createWalletClient({ account: buyerAccount, chain, transport: http(rpc) });
    stranger = createWalletClient({ account: strangerAccount, chain, transport: http(rpc) });
    const tc = createTestClient({ mode: "anvil", chain, transport: http(rpc) });
    for (const a of [sellerAccount, buyerAccount, strangerAccount]) await tc.setBalance({ address: a.address, value: parseEther("5") });
    await tc.request({ method: "anvil_dealERC20" as never, params: [buyerAccount.address, BASE.USDC, `0x${parseUnits("100", 6).toString(16)}`] as never });
    token = await signIn(seller);
    const reg = await api("/seller/onchain/register", { json: { name: "Ebook Store", splits: [{ recipient: sellerAccount.address, bps: 10000 }] } });
    await send(seller, reg.body.tx);
  });

  afterAll(async () => h.stop());

  it("lets the seller choose buyer fields per shop and per product", async () => {
    const shop = await api("/shops", { json: { name: "Ebook Store", buyerFields: { name: "required", email: "optional" } } });
    expect(shop.status).toBe(201);
    expect(shop.body.buyerFields).toEqual({ name: "required", email: "optional", phone: "off", address: "off", schedule: "off", note: "off" });
    shopId = shop.body.id;
    const p = await api(`/shops/${shopId}/products`, {
      json: { name: "Training guide", price: "2", buyerFields: { email: "required", phone: "optional", note: "optional" } },
    });
    ebook = p.body.id;
    expect((await api(`/shops/${shopId}`, { method: "PATCH", json: { buyerFields: { name: "bogus" } } })).status).toBe(400);
  });

  it("attaches a link or a private file to a product, visible only to the seller", async () => {
    const link = await api(`/shops/${shopId}/products/${ebook}/delivery`, { method: "PUT", json: { kind: "url", url: "https://example.com/guide" } });
    expect(link.body.kind).toBe("url");
    expect((await api(`/shops/${shopId}/products/${ebook}/delivery`, { method: "PUT", json: { kind: "url", url: "javascript:alert(1)" } })).status).toBe(400);

    const pathname = `deliveries/${shopId}/${ebook}/guide-x8Yq.pdf`;
    const src = await PDFDocument.create();
    src.addPage([420, 595]).drawText("Chapter one", { x: 40, y: 500 });
    pdfBytes = await src.save();
    files.blobs.set(pathname, { bytes: pdfBytes, contentType: "application/pdf" });
    const unticked = await api(`/shops/${shopId}/products/${ebook}/delivery`, { method: "PUT", json: { kind: "file", pathname, fileName: "guide.pdf" } });
    expect(unticked.status).toBe(400);
    const outside = await api(`/shops/${shopId}/products/${ebook}/delivery`, { method: "PUT", json: { kind: "file", pathname: "deliveries/other/x.pdf", fileName: "x.pdf", rightsConfirmed: true } });
    expect(outside.status).toBe(403);
    const file = await api(`/shops/${shopId}/products/${ebook}/delivery`, { method: "PUT", json: { kind: "file", pathname, fileName: "guide.pdf", rightsConfirmed: true } });
    expect(file.body).toMatchObject({ kind: "file", fileName: "guide.pdf", size: pdfBytes.length });
    expect(file.body.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(file.body.firstUploadedAt).toBeTruthy();
    const proof = await api(`/files/${file.body.sha256}`, { auth: false });
    expect(proof.body).toMatchObject({ shop: { name: "Ebook Store" }, firstUploadedAt: file.body.firstUploadedAt });

    const list = await api(`/shops/${shopId}/products`);
    expect(list.body[0].delivery).toMatchObject({ kind: "file", fileName: "guide.pdf" });
    const shop = await api(`/shops/${shopId}`);
    const pub = await api(`/shops/by-slug/${shop.body.slug}`, { auth: false });
    expect(JSON.stringify(pub.body)).not.toContain("deliveries/");
    expect(pub.body.products[0].delivery).toBeUndefined();

    const other = await signIn(stranger);
    expect((await api(`/shops/${shopId}/products/${ebook}/delivery`, { method: "PUT", json: { kind: "url", url: "https://x.y" }, headers: { authorization: `Bearer ${other}` }, auth: false })).status).toBe(403);
  });

  it("asks the buyer for the merged fields and validates them", async () => {
    const inv = await api("/invoices", { json: { shopId, items: [{ productId: ebook, quantity: 1 }], maxUses: 0 } });
    key = inv.body.invoice.invoiceKey;
    const m = inv.body.typedData.message;
    const signature = await seller.signTypedData({
      account: sellerAccount,
      domain: inv.body.typedData.domain,
      types: inv.body.typedData.types,
      primaryType: "Invoice",
      message: { ...m, amount: BigInt(m.amount), expiresAt: BigInt(m.expiresAt), items: m.items.map((i: any) => ({ ...i, unitPrice: BigInt(i.unitPrice) })) },
    } as never);
    expect((await api(`/invoices/${inv.body.invoice.id}/signature`, { json: { signature } })).status).toBe(200);

    const view = await api(`/pay/${key}`, { auth: false });
    expect(view.body.buyerFields).toEqual({ name: "required", email: "required", phone: "optional", address: "off", schedule: "off", note: "optional" });
    expect(view.body.hasDelivery).toBe(true);
    expect(JSON.stringify(view.body)).not.toContain("deliveries/");

    expect((await api(`/pay/${key}/orders`, { auth: false, json: { details: { email: "ada@example.com" } } })).status).toBe(400);
    expect((await api(`/pay/${key}/orders`, { auth: false, json: { details: { name: "Ada", email: "not-an-email" } } })).status).toBe(400);
    const ok = await api(`/pay/${key}/orders`, {
      auth: false,
      json: { details: { name: " Ada Obi ", email: "ada@example.com", phone: "+234 801 234 5678", note: "Send the PDF please", extra: "dropped" } },
    });
    expect(ok.status).toBe(201);
    orderId = ok.body.orderId;
    expect(orderId.length).toBeGreaterThan(20);
  });

  it("links the details to the real payment only after checking the receipt on chain", async () => {
    // A tx that did not pay this invoice is refused.
    const unrelated = await send(buyer, { to: buyerAccount.address, value: "0", data: "0x" });
    expect((await api(`/pay/${key}/orders/${orderId}/confirm`, { auth: false, json: { txHash: unrelated } })).status).toBe(400);
    // Unknown hashes stay pending.
    const fake = `0x${"ab".repeat(32)}` as Hex;
    expect((await api(`/pay/${key}/orders/${orderId}/confirm`, { auth: false, json: { txHash: fake } })).status).toBe(202);
    // Release the pending claim on a hash that never lands by binding the real payment through a new order.
    const fresh = await api(`/pay/${key}/orders`, { auth: false, json: { details: { name: "Ada Obi", email: "ada@example.com" } } });
    orderId = fresh.body.orderId;

    const quote = await api(`/pay/${key}/checkout?buyer=${buyerAccount.address}&token=usdc`, { auth: false });
    for (const tx of quote.body.transactions as Tx[]) txHash = await send(buyer, tx);
    const done = await api(`/pay/${key}/orders/${orderId}/confirm`, { auth: false, json: { txHash } });
    expect(done.status).toBe(200);
    expect(done.body.receiptId).toBeGreaterThan(0);

    // Someone else cannot claim the same payment with their own order.
    const thief = await api(`/pay/${key}/orders`, { auth: false, json: { details: { name: "Eve", email: "eve@example.com" } } });
    expect((await api(`/pay/${key}/orders/${thief.body.orderId}/confirm`, { auth: false, json: { txHash } })).status).toBe(409);
  });

  it("shows buyer details to the seller only", async () => {
    const mine = await waitFor(async () => {
      const r = await api(`/receipts/mine`);
      return r.body.length ? r.body : null;
    });
    expect(mine[0].buyerDetails).toEqual({ name: "Ada Obi", email: "ada@example.com", phone: null, address: null, schedule: null, note: null });
    const pub = await api(`/receipts/${mine[0].receiptId}`, { auth: false });
    expect(pub.body.hasDelivery).toBe(true);
    for (const path of [`/receipts/${mine[0].receiptId}`, `/pay/${key}/receipts`, `/feed/recent`, `/pay/${key}`]) {
      const text = JSON.stringify((await api(path, { auth: false })).body);
      expect(text).not.toContain("ada@example.com");
      expect(text).not.toContain("Ada Obi");
    }
  });

  it("unlocks the download for the paying order or the buyer's wallet, and nobody else", async () => {
    const res = await api(`/pay/${key}/delivery`, { auth: false, json: { txHash, orderId } });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    const item = res.body.items[0];
    expect(item).toMatchObject({ name: "Training guide", kind: "file", fileName: "guide.pdf" });
    const path = new URL(item.url).pathname;
    expect(item).toMatchObject({ readable: true, downloadsLeft: 5 });
    const dl = await fetch(`${h.baseUrl}${path}`);
    expect(dl.status).toBe(200);
    expect(dl.headers.get("cache-control")).toContain("no-store");
    // The buyer's copy carries a visible footer and metadata naming the order.
    const copy = await PDFDocument.load(new Uint8Array(await dl.arrayBuffer()));
    const code = (await api(`/orders/${orderId}`, { auth: false })).body.code;
    expect(copy.getKeywords()).toContain(`order:${code}`);
    expect(copy.getSubject()).toBe("Licensed copy for Ada Obi");
    expect(copy.getPageCount()).toBe(1);
    expect([...files.blobs.keys()].some((k) => k.startsWith(`stamped/${ebook}/`))).toBe(true);
    // Reading in the browser streams from the same origin and has its own allowance.
    const view = await fetch(`${h.baseUrl}${path}?view=1`);
    expect(view.headers.get("content-disposition")).toMatch(/^inline/);

    // Tampering with the token breaks it.
    // (Change a middle character: the last base64url character can carry only padding bits.)
    const mid = path.length - 10;
    const forged = path.slice(0, mid) + (path[mid] === "A" ? "B" : "A") + path.slice(mid + 1);
    expect((await api(forged, { auth: false })).status).toBe(403);

    // Wallet signature path, for buyers who come back later from another device.
    const sig = await buyer.signMessage({ account: buyerAccount, message: unlockMessage(txHash) });
    expect((await api(`/pay/${key}/delivery`, { auth: false, json: { txHash, signature: sig } })).status).toBe(200);
    const bad = await stranger.signMessage({ account: strangerAccount, message: unlockMessage(txHash) });
    expect((await api(`/pay/${key}/delivery`, { auth: false, json: { txHash, signature: bad } })).status).toBe(403);
    expect((await api(`/pay/${key}/delivery`, { auth: false, json: { txHash } })).status).toBe(403);

    // A different order on the same invoice cannot unlock this payment.
    const other = await api(`/pay/${key}/orders`, { auth: false, json: { details: { name: "Eve", email: "eve@example.com" } } });
    expect((await api(`/pay/${key}/delivery`, { auth: false, json: { txHash, orderId: other.body.orderId } })).status).toBe(403);
  });

  it("limits downloads per order, blocks resold files, and takes reports", async () => {
    const res = await api(`/pay/${key}/delivery`, { auth: false, json: { txHash, orderId } });
    const path = new URL(res.body.items[0].url).pathname;
    const left = res.body.items[0].downloadsLeft;
    for (let i = 0; i < left; i++) expect((await fetch(`${h.baseUrl}${path}`)).status).toBe(200);
    const over = await api(path, { auth: false });
    expect(over.status).toBe(429);
    expect(over.body.error).toContain("all 5 downloads");

    // Another shop cannot sell the same file.
    const other = await signIn(stranger);
    const as = { headers: { authorization: `Bearer ${other}` }, auth: false };
    await send(stranger, (await api("/seller/onchain/register", { ...as, json: { name: "Copycat", splits: [{ recipient: strangerAccount.address, bps: 10000 }] } })).body.tx);
    const shop2 = (await api("/shops", { ...as, json: { name: "Copycat Books" } })).body;
    const prod2 = (await api(`/shops/${shop2.id}/products`, { ...as, json: { name: "Same guide", price: "1", fulfilment: "digital" } })).body;
    const copyPath = `deliveries/${shop2.id}/${prod2.id}/guide-zz.pdf`;
    files.blobs.set(copyPath, { bytes: pdfBytes, contentType: "application/pdf" });
    const dup = await api(`/shops/${shop2.id}/products/${prod2.id}/delivery`, { ...as, method: "PUT", json: { kind: "file", pathname: copyPath, fileName: "mine.pdf", rightsConfirmed: true } });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("This file is already sold by another shop");
    expect(files.blobs.has(copyPath)).toBe(false);

    // Reports are saved for review and visible to the seller, not the public.
    expect((await api(`/pay/${key}/report`, { auth: false, json: { reason: "nonsense" } })).status).toBe(400);
    expect((await api(`/pay/${key}/report`, { auth: false, json: { reason: "stolen", details: "This is my book", contact: "author@example.com" } })).status).toBe(201);
    const reports = await api(`/orders/mine/reports`);
    expect(reports.body[0]).toMatchObject({ reason: "stolen", details: "This is my book", status: "open" });
    expect((await api(`/orders/mine/reports`, as)).body).toHaveLength(0);
  });

  it("redirects link deliveries and refuses expired links", async () => {
    await api(`/shops/${shopId}/products/${ebook}/delivery`, { method: "PUT", json: { kind: "url", url: "https://example.com/guide" } });
    expect([...files.blobs.keys()].some((k) => k.startsWith("deliveries/"))).toBe(false); // the replaced file was removed
    const res = await api(`/pay/${key}/delivery`, { auth: false, json: { txHash, orderId } });
    const dl = await api(new URL(res.body.items[0].url).pathname, { auth: false });
    expect(dl.status).toBe(302);
    expect(dl.headers.get("location")).toBe("https://example.com/guide");

    const { signDownload } = await import("../src/services/downloadToken.js");
    const expired = signDownload(h.config.JWT_SECRET, txHash, ebook, -10);
    expect((await api(`/downloads/${expired.token}`, { auth: false })).status).toBe(403);
  });

  it("runs the seller's order desk: lookup by code, status by fulfilment type, private to the seller", async () => {
    const mine = await api(`/orders/mine`);
    expect(mine.status).toBe(200);
    const order = mine.body.find((o: any) => o.txHash === txHash.toLowerCase());
    // Only digital products in this order, and the buyer already got the file.
    expect(order).toMatchObject({ fulfilment: "digital", status: "delivered", details: { name: "Ada Obi" } });
    expect(order.code).toMatch(/^[2-9A-Z]{7}$/);

    // The seller types or scans the code from the buyer's receipt.
    const found = await api(`/orders/mine/by-code/qrush-${order.code.toLowerCase()}`);
    expect(found.body.id).toBe(order.id);
    expect((await api(`/orders/mine/${order.id}`, { method: "PATCH", json: { status: "shipped" } })).status).toBe(400);
    expect((await api(`/orders/mine/${order.id}`, { method: "PATCH", json: { status: "collected" } })).status).toBe(400);
    const served = await api(`/orders/mine/${order.id}`, { method: "PATCH", json: { status: "delivered", sellerNote: "Enjoy the book" } });
    expect(served.body).toMatchObject({ status: "delivered", sellerNote: "Enjoy the book" });
    expect((await api(`/orders/mine?status=delivered&fulfilment=digital`)).body).toHaveLength(1);
    expect((await api(`/orders/mine?fulfilment=pickup`)).body.some((o: any) => o.id === order.id)).toBe(false);
    expect((await api(`/orders/mine?status=paid`)).body).toHaveLength(0);

    // The buyer's private order link shows progress, never contact details.
    const pub = await api(`/orders/${orderId}`, { auth: false });
    expect(pub.body).toMatchObject({ code: order.code, status: "delivered", sellerNote: "Enjoy the book", receiptId: order.receiptId });
    expect(JSON.stringify(pub.body)).not.toContain("ada@example.com");
    expect((await api(`/receipts/${order.receiptId}`, { auth: false })).body.orderStatus.status).toBe("delivered");

    // Nobody else can see or move the order.
    const other = await signIn(stranger);
    const as = { headers: { authorization: `Bearer ${other}` }, auth: false };
    expect((await api(`/orders/mine`, as)).body).toHaveLength(0);
    expect((await api(`/orders/mine/by-code/${order.code}`, as)).status).toBe(404);
    expect((await api(`/orders/mine/${order.id}`, { ...as, method: "PATCH", json: { status: "paid" } })).status).toBe(404);
    expect((await api(`/orders/mine`, { auth: false })).status).toBe(401);
  });

  it("ships a delivery order with default address fields and tracking", async () => {
    const p = await api(`/shops/${shopId}/products`, { json: { name: "Ankara tote", price: "3", fulfilment: "shipping" } });
    expect(p.body.fulfilment).toBe("shipping");
    const inv = await api("/invoices", { json: { shopId, items: [{ productId: p.body.id, quantity: 1 }], maxUses: 0 } });
    const k = inv.body.invoice.invoiceKey;
    const m = inv.body.typedData.message;
    const signature = await seller.signTypedData({
      account: sellerAccount,
      domain: inv.body.typedData.domain,
      types: inv.body.typedData.types,
      primaryType: "Invoice",
      message: { ...m, amount: BigInt(m.amount), expiresAt: BigInt(m.expiresAt), items: m.items.map((i: any) => ({ ...i, unitPrice: BigInt(i.unitPrice) })) },
    } as never);
    await api(`/invoices/${inv.body.invoice.id}/signature`, { json: { signature } });

    const view = await api(`/pay/${k}`, { auth: false });
    expect(view.body.fulfilment).toBe("shipping");
    expect(view.body.buyerFields).toMatchObject({ name: "required", phone: "required", address: "required" });
    expect((await api(`/pay/${k}/orders`, { auth: false, json: { details: { name: "Tolu", phone: "+2348012345678" } } })).status).toBe(400);
    const o = await api(`/pay/${k}/orders`, { auth: false, json: { details: { name: "Tolu", phone: "+2348012345678", address: "12 Allen Avenue, Ikeja, Lagos" } } });
    expect(o.status).toBe(201);
    const quote = await api(`/pay/${k}/checkout?buyer=${buyerAccount.address}&token=usdc`, { auth: false });
    let hash: Hex = "0x";
    for (const tx of quote.body.transactions as Tx[]) hash = await send(buyer, tx);
    expect((await api(`/pay/${k}/orders/${o.body.orderId}/confirm`, { auth: false, json: { txHash: hash } })).status).toBe(200);

    const desk = await api(`/orders/mine?fulfilment=shipping`);
    expect(desk.body).toHaveLength(1);
    expect(desk.body[0].details.address).toBe("12 Allen Avenue, Ikeja, Lagos");
    const id = desk.body[0].id;
    await api(`/orders/mine/${id}`, { method: "PATCH", json: { status: "shipped", tracking: "GIG 4471923" } });
    expect((await api(`/orders/${o.body.orderId}`, { auth: false })).body).toMatchObject({ status: "shipped", tracking: "GIG 4471923" });
    expect((await api(`/orders/mine/${id}`, { method: "PATCH", json: { status: "delivered" } })).body.status).toBe("delivered");
    expect(JSON.stringify((await api(`/orders/${o.body.orderId}`, { auth: false })).body)).not.toContain("Allen");
  });
});
