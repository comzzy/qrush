import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import type { Hex } from "viem";
import type { AppEnv, Deps } from "../context.js";
import { downloads, fileFingerprints, invoices, shops, orders, productDeliveries, productReports } from "../db/schema.js";
import { isPdf, stampPdf } from "../services/stamp.js";
import { badRequest, conflict, forbidden, notFound, unavailable } from "../lib/errors.js";
import { requireSeller } from "../auth.js";
import { FLOWS, validateDetails } from "../services/buyerFields.js";
import { checkoutExtras, publicOrderStatus, serializeOrder } from "../services/checkoutExtras.js";
import { z } from "zod";
import { desc } from "drizzle-orm";
import { readDownload, signDownload } from "../services/downloadToken.js";
import { checkPayment, isTxHash, unlockMessage, verifyPayment } from "../services/paymentProof.js";

const LINK_TTL_SECONDS = 15 * 60;
const FILE_URL_TTL_MS = 5 * 60_000;
/** Each paid order can download a file this many times, and open it in the reader this many times. */
export const MAX_DOWNLOADS = 5;
export const MAX_VIEWS = 30;

function usage(deps: Deps, txHash: string, productId: string) {
  return deps.db.select().from(downloads).where(and(eq(downloads.txHash, txHash), eq(downloads.productId, productId))).get();
}

function loadInvoice(deps: Deps, key: string) {
  const row = deps.db.select().from(invoices).where(eq(invoices.invoiceKey, key)).get();
  if (!row) throw notFound("Invoice not found");
  return row;
}

async function json(req: Request): Promise<Record<string, unknown>> {
  const v = await req.json().catch(() => null);
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/**
 * Links an order to a payment. The buyer's page claims the tx hash the moment the wallet returns it,
 * before it is even mined, and an order can only claim a payment made after the order was created.
 * Together with one order per tx, this stops anyone from attaching themselves to someone else's payment.
 */
async function claimOrder(deps: Deps, key: string, orderId: string, txHash: Hex): Promise<{ status: "ok"; receiptId: number | null } | { status: "pending" }> {
  const order = deps.db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.invoiceKey, key)))
    .get();
  if (!order) throw notFound("Order not found");
  if (order.txHash && order.txHash !== txHash) throw conflict("This order is linked to another payment");
  if (order.txHash && order.confirmedAt) return { status: "ok", receiptId: order.receiptId };
  if (!order.txHash) {
    const taken = deps.db.select({ id: orders.id }).from(orders).where(eq(orders.txHash, txHash)).get();
    if (taken) throw conflict("This payment is already linked to an order");
    deps.db.update(orders).set({ txHash }).where(eq(orders.id, order.id)).run();
  }
  const proof = await checkPayment(deps, txHash, key as Hex);
  if (proof.status === "pending") return { status: "pending" };
  const release = () => deps.db.update(orders).set({ txHash: null }).where(eq(orders.id, order.id)).run();
  if (proof.status === "invalid") {
    release();
    throw badRequest("That transaction did not pay this invoice");
  }
  const p = proof.payment;
  // Allow a little clock skew between this server and the chain.
  if (p.timestamp * 1000 < order.createdAt.getTime() - 120_000) {
    release();
    throw forbidden("This payment was made before the order");
  }
  deps.db
    .update(orders)
    .set({ receiptId: p.receiptId, buyer: p.buyer.toLowerCase(), status: "paid", confirmedAt: new Date(), updatedAt: new Date() })
    .where(eq(orders.id, order.id))
    .run();
  return { status: "ok", receiptId: p.receiptId };
}

/** Off-chain order details and paid downloads. Every unlock re-checks the payment on Base. */
export const orderRoutes = new Hono<AppEnv>()
  .post("/:key/orders", async (c) => {
    const deps = c.var.deps;
    const row = loadInvoice(deps, c.req.param("key"));
    const { fields, fulfilment } = checkoutExtras(deps, row);
    const body = await json(c.req.raw);
    const checked = validateDetails(fields, body.details);
    if (!checked.ok) throw badRequest(checked.error);
    const id = randomBytes(18).toString("base64url");
    const now = new Date();
    for (let attempt = 0; ; attempt++) {
      const code = orderCode();
      if (deps.db.select({ id: orders.id }).from(orders).where(eq(orders.code, code)).get()) {
        if (attempt > 8) throw conflict("Please try again");
        continue;
      }
      deps.db
        .insert(orders)
        .values({ id, code, invoiceKey: row.invoiceKey, seller: row.seller, fulfilment, status: "pending", ...checked.details, createdAt: now, updatedAt: now })
        .run();
      return c.json({ orderId: id, code }, 201);
    }
  })
  .post("/:key/orders/:orderId/confirm", async (c) => {
    const deps = c.var.deps;
    const body = await json(c.req.raw);
    if (!isTxHash(body.txHash)) throw badRequest("txHash required");
    const r = await claimOrder(deps, c.req.param("key"), c.req.param("orderId"), body.txHash.toLowerCase() as Hex);
    if (r.status === "pending") return c.json({ ok: false, pending: true }, 202);
    return c.json({ ok: true, receiptId: r.receiptId });
  })
  /**
   * Signed download links for a confirmed payment. The caller proves it is the buyer with the
   * private order id from checkout, or with a wallet signature from the paying address.
   */
  .post("/:key/delivery", async (c) => {
    const deps = c.var.deps;
    const row = loadInvoice(deps, c.req.param("key"));
    const body = await json(c.req.raw);
    if (!isTxHash(body.txHash)) throw badRequest("txHash required");
    const txHash = body.txHash.toLowerCase() as Hex;
    const { deliveries } = checkoutExtras(deps, row);
    if (deliveries.length === 0) return c.json({ items: [] });

    const paid = await verifyPayment(deps, txHash, row.invoiceKey as Hex);
    if (!paid) return c.json({ pending: true, items: [] }, 202);

    let allowed = false;
    if (typeof body.orderId === "string") {
      const r = await claimOrder(deps, row.invoiceKey, body.orderId, txHash).catch(() => null);
      allowed = r?.status === "ok";
      if (allowed) {
        // A download-only order is complete as soon as the buyer has their links.
        deps.db
          .update(orders)
          .set({ status: "delivered", updatedAt: new Date() })
          .where(and(eq(orders.id, body.orderId), eq(orders.fulfilment, "digital"), eq(orders.status, "paid")))
          .run();
      }
    } else if (typeof body.signature === "string" && /^0x[0-9a-fA-F]+$/.test(body.signature)) {
      allowed = await deps.client
        .verifyMessage({ address: paid.buyer, message: unlockMessage(txHash), signature: body.signature as Hex })
        .catch(() => false);
    }
    if (!allowed) throw forbidden("Only the buyer of this payment can open the download");

    const secret = deps.config.JWT_SECRET;
    const base = deps.config.PUBLIC_BASE_URL.replace(/\/$/, "");
    return c.json({
      items: deliveries.map((d) => {
        const { token, expiresAt } = signDownload(secret, txHash, d.productId, LINK_TTL_SECONDS);
        const used = usage(deps, txHash.toLowerCase(), d.productId);
        const file = d.kind === "file";
        return {
          readable: file && isPdf(d.fileName, d.contentType),
          downloadsLeft: file ? Math.max(0, MAX_DOWNLOADS - (used?.count ?? 0)) : null,
          productId: d.productId,
          name: d.productName,
          kind: d.kind,
          fileName: d.kind === "file" ? d.fileName : null,
          size: d.size,
          url: `${base}/downloads/${token}`,
          expiresAt,
        };
      }),
    });
  })
  /** Anyone can flag a product (stolen content, misleading, broken). Saved for review. */
  .post("/:key/report", async (c) => {
    const deps = c.var.deps;
    const row = loadInvoice(deps, c.req.param("key"));
    const parsed = reportInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw badRequest(z.prettifyError(parsed.error));
    const open = deps.db.select({ id: productReports.id }).from(productReports).where(eq(productReports.invoiceKey, row.invoiceKey)).all();
    if (open.length >= 50) return c.json({ ok: true }, 202);
    deps.db
      .insert(productReports)
      .values({ invoiceKey: row.invoiceKey, seller: row.seller, ...parsed.data, createdAt: new Date() })
      .run();
    return c.json({ ok: true }, 201);
  });

const reportInput = z.object({
  reason: z.enum(["stolen", "misleading", "broken", "other"]),
  details: z.string().trim().max(1000).optional(),
  contact: z.string().trim().max(200).optional(),
});

/** Public proof of who uploaded a file first, by its SHA-256. */
export const fileRoutes = new Hono<AppEnv>().get("/:sha256", (c) => {
  const sha = c.req.param("sha256").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha)) throw badRequest("Expected a SHA-256 hex hash");
  const f = c.var.deps.db.select().from(fileFingerprints).where(eq(fileFingerprints.sha256, sha)).get();
  if (!f) throw notFound("No shop has registered this file");
  const shop = c.var.deps.db.select().from(shops).where(eq(shops.id, f.shopId)).get();
  return c.json({ sha256: sha, shop: shop ? { name: shop.name, slug: shop.slug } : null, firstUploadedAt: f.firstUploadedAt.toISOString() });
});

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
function orderCode() {
  const bytes = randomBytes(7);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}
export const normalizeCode = (v: string) => {
  const s = v.toUpperCase().replace(/[^0-9A-Z]/g, "");
  return s.length > 7 && s.startsWith("QRUSH") ? s.slice(5) : s;
};

const updateInput = z.object({
  status: z.string().optional(),
  tracking: z.string().trim().max(300).nullish(),
  sellerNote: z.string().trim().max(1000).nullish(),
});

/** Seller order desk under /orders/mine, plus a buyer's own status by private order id. */
export const orderDeskRoutes = new Hono<AppEnv>()
  .get("/mine", requireSeller, (c) => {
    const { db } = c.var.deps;
    const status = c.req.query("status");
    const fulfilment = c.req.query("fulfilment");
    const rows = db
      .select()
      .from(orders)
      .where(eq(orders.seller, c.var.seller))
      .orderBy(desc(orders.createdAt))
      .limit(500)
      .all()
      .filter((o) => o.confirmedAt && (!status || o.status === status) && (!fulfilment || o.fulfilment === fulfilment));
    return c.json(rows.map(serializeOrder));
  })
  .get("/mine/reports", requireSeller, (c) => {
    const rows = c.var.deps.db.select().from(productReports).where(eq(productReports.seller, c.var.seller)).orderBy(desc(productReports.createdAt)).all();
    return c.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
  })
  .get("/mine/by-code/:code", requireSeller, (c) => {
    const code = normalizeCode(c.req.param("code"));
    const o = c.var.deps.db.select().from(orders).where(eq(orders.code, code)).get();
    if (!o || o.seller !== c.var.seller || !o.confirmedAt) throw notFound("No paid order with that code");
    return c.json(serializeOrder(o));
  })
  .patch("/mine/:id", requireSeller, async (c) => {
    const { db } = c.var.deps;
    const o = db.select().from(orders).where(eq(orders.id, c.req.param("id"))).get();
    if (!o || o.seller !== c.var.seller || !o.confirmedAt) throw notFound("Order not found");
    const parsed = updateInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw badRequest(z.prettifyError(parsed.error));
    const { status, tracking, sellerNote } = parsed.data;
    if (status && !FLOWS[o.fulfilment].includes(status)) throw badRequest(`Status must be one of: ${FLOWS[o.fulfilment].join(", ")}`);
    const row = db
      .update(orders)
      .set({
        ...(status ? { status } : {}),
        ...(tracking !== undefined ? { tracking: tracking || null } : {}),
        ...(sellerNote !== undefined ? { sellerNote: sellerNote || null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, o.id))
      .returning()
      .get();
    return c.json(serializeOrder(row));
  })
  .get("/:orderId", (c) => {
    const o = c.var.deps.db.select().from(orders).where(eq(orders.id, c.req.param("orderId"))).get();
    if (!o || !o.confirmedAt) throw notFound("Order not found");
    c.header("cache-control", "private, no-store");
    return c.json(publicOrderStatus(o));
  });

export const downloadRoutes = new Hono<AppEnv>().get("/:token", async (c) => {
  const deps = c.var.deps;
  const claims = readDownload(deps.config.JWT_SECRET, c.req.param("token"));
  if (!claims) throw forbidden("This download link is invalid or has expired. Open your receipt to get a fresh one.");
  const d = deps.db.select().from(productDeliveries).where(eq(productDeliveries.productId, claims.productId)).get();
  if (!d) throw notFound("This download is no longer available");
  c.header("cache-control", "private, no-store");
  c.header("referrer-policy", "no-referrer");
  if (d.kind === "url") return c.redirect(d.url!, 302);
  const files = deps.files;
  if (!files) throw unavailable("File storage is not configured");

  const tx = claims.txHash.toLowerCase();
  const view = c.req.query("view") === "1";
  const used = usage(deps, tx, d.productId);
  if (view ? (used?.views ?? 0) >= MAX_VIEWS : (used?.count ?? 0) >= MAX_DOWNLOADS) {
    throw new HTTPException(429, {
      message: view
        ? "This copy has been opened too many times. Contact the seller if you need more."
        : `You have used all ${MAX_DOWNLOADS} downloads for this order. Contact the seller if you need more.`,
    });
  }

  let pathname = d.pathname!;
  let stamped = used?.stampedPathname ?? null;
  if (isPdf(d.fileName, d.contentType)) {
    if (!stamped) {
      const order = deps.db.select().from(orders).where(eq(orders.txHash, tx)).get();
      const buyer = order?.name || order?.email || (order?.buyer ? `wallet ${order.buyer.slice(0, 6)}...${order.buyer.slice(-4)}` : `payment ${tx.slice(0, 10)}`);
      try {
        const bytes = await stampPdf(await files.read(pathname), { buyer, code: order?.code ?? tx.slice(2, 9).toUpperCase(), date: new Date() });
        stamped = await files.write(`stamped/${d.productId}/${tx}.pdf`, bytes, "application/pdf");
      } catch (e) {
        // Some PDFs (encrypted or malformed) cannot be edited; the buyer still gets the file they paid for.
        console.error("could not stamp pdf:", e instanceof Error ? e.message : e);
      }
    }
    if (stamped) pathname = stamped;
  }
  const now = new Date();
  if (used) {
    deps.db
      .update(downloads)
      .set({ ...(view ? { views: used.views + 1 } : { count: used.count + 1 }), stampedPathname: stamped, lastAt: now })
      .where(and(eq(downloads.txHash, tx), eq(downloads.productId, d.productId)))
      .run();
  } else {
    deps.db.insert(downloads).values({ txHash: tx, productId: d.productId, count: view ? 0 : 1, views: view ? 1 : 0, stampedPathname: stamped, lastAt: now }).run();
  }
  const out = await files.open(pathname, FILE_URL_TTL_MS, d.fileName ?? "download", view ? "inline" : "attachment", view);
  if ("redirect" in out) return c.redirect(out.redirect, 302);
  return out.response;
});
