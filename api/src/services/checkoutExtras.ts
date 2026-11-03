import { and, eq, inArray } from "drizzle-orm";
import type { Deps } from "../context.js";
import { invoices, orders, productDeliveries, products, shops } from "../db/schema.js";
import { mergeFields, orderFulfilment, productFields } from "./buyerFields.js";

type InvoiceRow = typeof invoices.$inferSelect;

/** Fields to ask for and products to deliver for one invoice. */
export function checkoutExtras(deps: Deps, row: InvoiceRow) {
  const shop = deps.db.select().from(shops).where(eq(shops.id, row.shopId)).get();
  const ids = [...new Set(row.items.flatMap((i) => (i.productId ? [i.productId] : [])))];
  const prods = ids.length
    ? deps.db.select().from(products).where(and(eq(products.shopId, row.shopId), inArray(products.id, ids))).all()
    : [];
  const deliveries = ids.length
    ? deps.db.select().from(productDeliveries).where(inArray(productDeliveries.productId, ids)).all()
    : [];
  const fields = mergeFields(shop?.buyerFields, ...prods.map(productFields));
  // Products set up before fulfilment types existed count as digital when they carry a file or link.
  const fulfilment = orderFulfilment(
    prods.map((p) => p.fulfilment ?? (deliveries.some((d) => d.productId === p.id) ? "digital" : null)),
  );
  const named = deliveries.map((d) => ({ ...d, productName: prods.find((p) => p.id === d.productId)?.name ?? "Your download" }));
  return { fields, fulfilment, deliveries: named };
}

/** Seller-only: the order linked to a payment, if the buyer's page made one. */
export function orderForTx(deps: Deps, txHash: string) {
  const o = deps.db.select().from(orders).where(eq(orders.txHash, txHash.toLowerCase())).get();
  return o?.confirmedAt ? serializeOrder(o) : null;
}

/** Public, progress only: lets a receipt show "Shipped" without revealing who bought it. */
export function orderStatusForTx(deps: Deps, txHash: string) {
  const o = deps.db.select().from(orders).where(eq(orders.txHash, txHash.toLowerCase())).get();
  return o?.confirmedAt ? { fulfilment: o.fulfilment, status: o.status, updatedAt: (o.updatedAt ?? o.confirmedAt).toISOString() } : null;
}

/** Seller-facing order, including the buyer's details. Never returned by public routes. */
export function serializeOrder(o: typeof orders.$inferSelect) {
  return {
    id: o.id,
    code: o.code,
    invoiceKey: o.invoiceKey,
    fulfilment: o.fulfilment,
    status: o.status,
    tracking: o.tracking,
    sellerNote: o.sellerNote,
    receiptId: o.receiptId,
    txHash: o.txHash,
    buyer: o.buyer,
    details: { name: o.name, email: o.email, phone: o.phone, address: o.address, schedule: o.schedule, note: o.note },
    createdAt: o.createdAt.toISOString(),
    paidAt: o.confirmedAt?.toISOString() ?? null,
    updatedAt: (o.updatedAt ?? o.confirmedAt ?? o.createdAt).toISOString(),
  };
}

/** What the buyer sees when tracking their own order: progress only, no contact details. */
export function publicOrderStatus(o: typeof orders.$inferSelect) {
  return {
    code: o.code,
    fulfilment: o.fulfilment,
    status: o.status,
    tracking: o.tracking,
    sellerNote: o.sellerNote,
    schedule: o.schedule,
    receiptId: o.receiptId,
    updatedAt: (o.updatedAt ?? o.confirmedAt ?? o.createdAt).toISOString(),
  };
}
