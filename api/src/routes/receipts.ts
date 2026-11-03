import { Hono } from "hono";
import { and, desc, eq, lt } from "drizzle-orm";
import { getAddress, isAddress, type Address } from "viem";
import { requireSeller } from "../auth.js";
import type { AppEnv, Deps } from "../context.js";
import { qrushCheckoutAbi } from "../contracts/artifact.js";
import { invoices, payments, payouts, shops } from "../db/schema.js";
import { badRequest, notFound } from "../lib/errors.js";
import { formatUsdc } from "../lib/money.js";
import { checkoutExtras, orderForTx, orderStatusForTx } from "../services/checkoutExtras.js";

export function buildReceipt(deps: Deps, receiptId: number) {
  const p = deps.db.select().from(payments).where(eq(payments.receiptId, receiptId)).get();
  if (!p) return null;
  const invoice = deps.db.select().from(invoices).where(eq(invoices.invoiceKey, p.invoiceKey)).get();
  const shop = invoice ? deps.db.select().from(shops).where(eq(shops.id, invoice.shopId)).get() : undefined;
  const splits = deps.db.select().from(payouts).where(eq(payouts.receiptId, receiptId)).orderBy(payouts.logIndex).all();
  return {
    receiptId: p.receiptId,
    invoiceKey: p.invoiceKey,
    shop: shop ? { id: shop.id, name: shop.name, slug: shop.slug } : null,
    seller: p.seller,
    buyer: p.buyer,
    paidWith: p.tokenIn === "0x0000000000000000000000000000000000000000" ? "ETH" : p.tokenIn,
    amountIn: p.amountIn,
    gross: formatUsdc(p.grossAmount),
    discount: formatUsdc(p.discount),
    total: formatUsdc(p.netAmount),
    totalUnits: p.netAmount,
    purchaseNumber: p.purchaseNumber,
    items: invoice?.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: formatUsdc(i.unitPrice) })) ?? [],
    memo: invoice?.memo ?? null,
    payouts: splits.map((s) => ({ recipient: s.recipient, amount: formatUsdc(s.amount), amountUnits: s.amount })),
    txHash: p.txHash,
    blockNumber: p.blockNumber,
    paidAt: new Date(p.blockTimestamp * 1000).toISOString(),
    geo: { latitude: p.latitude, longitude: p.longitude, city: p.city, country: p.country, source: p.geoSource },
    /** Whether the buyer gets a download; the file itself is only reachable with a signed link. */
    hasDelivery: invoice ? checkoutExtras(deps, invoice).deliveries.length > 0 : false,
    orderStatus: orderStatusForTx(deps, p.txHash),
  };
}

export const receiptRoutes = new Hono<AppEnv>()
  .get("/mine", requireSeller, (c) => {
    const before = Number(c.req.query("before") ?? 0);
    const limit = Math.min(Number(c.req.query("limit") ?? 50) || 50, 200);
    const rows = c.var.deps.db
      .select({ receiptId: payments.receiptId })
      .from(payments)
      .where(before ? and(eq(payments.seller, c.var.seller), lt(payments.receiptId, before)) : eq(payments.seller, c.var.seller))
      .orderBy(desc(payments.receiptId))
      .limit(limit)
      .all();
    // Buyer details are private to the seller and are only ever attached here.
    return c.json(
      rows.map((r) => {
        const receipt = buildReceipt(c.var.deps, r.receiptId)!;
        const order = orderForTx(c.var.deps, receipt.txHash);
        return { ...receipt, order, buyerDetails: order?.details ?? null };
      }),
    );
  })
  .get("/:receiptId", (c) => {
    const id = Number(c.req.param("receiptId"));
    if (!Number.isInteger(id) || id <= 0) throw badRequest("Invalid receipt id");
    const receipt = buildReceipt(c.var.deps, id);
    if (!receipt) throw notFound("Receipt not found");
    return c.json(receipt);
  });

export const loyaltyRoutes = new Hono<AppEnv>().get("/:seller/:buyer", async (c) => {
  const { seller, buyer } = c.req.param();
  if (!isAddress(seller) || !isAddress(buyer)) throw badRequest("Invalid address");
  const [purchases, threshold, discountBps, eligible] = await c.var.deps.client.readContract({
    address: c.var.deps.config.CHECKOUT_ADDRESS,
    abi: qrushCheckoutAbi,
    functionName: "loyaltyStatus",
    args: [seller as Address, buyer as Address],
  });
  return c.json({
    seller: getAddress(seller),
    buyer: getAddress(buyer),
    purchases: Number(purchases),
    threshold,
    discountBps,
    eligible,
    purchasesUntilDiscount: threshold === 0 ? null : Math.max(threshold - Number(purchases), 0),
  });
});
