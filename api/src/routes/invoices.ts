import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { encodeFunctionData, isHex, toHex, type Hex } from "viem";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireSeller } from "../auth.js";
import type { AppEnv } from "../context.js";
import { qrushCheckoutAbi } from "../contracts/artifact.js";
import { invoices, products, type InvoiceItemRow } from "../db/schema.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { parseUsdc } from "../lib/money.js";
import { invoiceDomain, invoiceKey, invoiceTypes, toOnchainInvoice } from "../services/invoiceTypes.js";
import { renderQr, serializeInvoice } from "../services/invoiceView.js";
import { getOwnedShop } from "./shops.js";

const usdcAmount = z.union([z.string(), z.number()]).transform((v, ctx) => {
  try {
    const units = parseUsdc(v);
    if (units <= 0n) throw new Error();
    return units;
  } catch {
    ctx.addIssue({ code: "custom", message: "must be a positive USDC amount" });
    return z.NEVER;
  }
});

const createInput = z
  .object({
    shopId: z.string().uuid(),
    amount: usdcAmount.optional(),
    items: z
      .array(
        z.union([
          z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(1_000_000) }),
          z.object({ name: z.string().min(1).max(200), quantity: z.number().int().min(1).max(1_000_000), unitPrice: usdcAmount }),
        ]),
      )
      .max(100)
      .optional(),
    memo: z.string().max(500).optional(),
    expiresInSeconds: z.number().int().min(60).max(365 * 24 * 3600).optional(),
    maxUses: z.number().int().min(0).max(4_294_967_295).default(1),
  })
  .refine((v) => (v.items?.length ?? 0) > 0 || v.amount !== undefined, { message: "amount or items required" });

function typedDataFor(chainId: number, checkout: `0x${string}`, row: typeof invoices.$inferSelect) {
  const message = toOnchainInvoice(row);
  return {
    domain: invoiceDomain(chainId, checkout),
    types: invoiceTypes,
    primaryType: "Invoice" as const,
    message,
  };
}

function jsonSafe<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}

export const invoiceRoutes = new Hono<AppEnv>()
  .use("*", requireSeller)
  .post("/", async (c) => {
    const deps = c.var.deps;
    const parsed = createInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw badRequest(z.prettifyError(parsed.error));
    const input = parsed.data;
    const shop = getOwnedShop(deps, input.shopId, c.var.seller);

    const productIds = (input.items ?? []).flatMap((i) => ("productId" in i ? [i.productId] : []));
    const catalog = productIds.length
      ? deps.db
          .select()
          .from(products)
          .where(and(eq(products.shopId, shop.id), inArray(products.id, productIds), eq(products.active, true)))
          .all()
      : [];
    const items: InvoiceItemRow[] = (input.items ?? []).map((i) => {
      if ("productId" in i) {
        const p = catalog.find((x) => x.id === i.productId);
        if (!p) throw badRequest(`Unknown or inactive product ${i.productId}`);
        return { name: p.name, quantity: i.quantity, unitPrice: p.priceUsdc, productId: p.id };
      }
      return { name: i.name, quantity: i.quantity, unitPrice: i.unitPrice.toString() };
    });
    const itemsTotal = items.reduce((sum, i) => sum + BigInt(i.unitPrice) * BigInt(i.quantity), 0n);
    if (items.length && input.amount !== undefined && input.amount !== itemsTotal) {
      throw badRequest("amount does not match item total");
    }
    const amount = items.length ? itemsTotal : input.amount!;

    const id = toHex(randomBytes(32));
    const now = new Date();
    const row = deps.db
      .insert(invoices)
      .values({
        id: randomUUID(),
        invoiceId: id,
        invoiceKey: invoiceKey(c.var.seller, id),
        shopId: shop.id,
        seller: c.var.seller,
        amount: amount.toString(),
        expiresAt: input.expiresInSeconds ? Math.floor(now.getTime() / 1000) + input.expiresInSeconds : 0,
        maxUses: input.maxUses,
        items,
        memo: input.memo ?? null,
        status: "awaiting_signature",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    const typedData = typedDataFor(deps.config.CHAIN_ID, deps.config.CHECKOUT_ADDRESS, row);
    return c.json(
      {
        invoice: serializeInvoice(deps, row),
        typedData: jsonSafe(typedData),
        createInvoiceTx: {
          chainId: deps.config.CHAIN_ID,
          to: deps.config.CHECKOUT_ADDRESS,
          value: "0",
          data: encodeFunctionData({ abi: qrushCheckoutAbi, functionName: "createInvoice", args: [typedData.message] }),
        },
        qrSvg: await renderQr(serializeInvoice(deps, row).payUrl, "svg"),
      },
      201,
    );
  })
  .get("/", (c) => {
    const shopId = c.req.query("shopId");
    const rows = c.var.deps.db
      .select()
      .from(invoices)
      .where(shopId ? and(eq(invoices.seller, c.var.seller), eq(invoices.shopId, shopId)) : eq(invoices.seller, c.var.seller))
      .orderBy(desc(invoices.createdAt))
      .all();
    return c.json(rows.map((r) => serializeInvoice(c.var.deps, r)));
  })
  .get("/:id", (c) => {
    const row = c.var.deps.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, c.req.param("id")), eq(invoices.seller, c.var.seller)))
      .get();
    if (!row) throw notFound("Invoice not found");
    return c.json(serializeInvoice(c.var.deps, row));
  })
  .post("/:id/signature", async (c) => {
    const deps = c.var.deps;
    const row = deps.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, c.req.param("id")), eq(invoices.seller, c.var.seller)))
      .get();
    if (!row) throw notFound("Invoice not found");
    if (row.status !== "awaiting_signature") throw conflict(`Invoice is ${row.status}`);
    const body = (await c.req.json().catch(() => null)) as { signature?: string } | null;
    if (!body?.signature || !isHex(body.signature)) throw badRequest("signature required");
    const valid = await deps.client.verifyTypedData({
      address: row.seller as `0x${string}`,
      ...typedDataFor(deps.config.CHAIN_ID, deps.config.CHECKOUT_ADDRESS, row),
      signature: body.signature as Hex,
    });
    if (!valid) throw badRequest("Signature does not match invoice");
    const updated = deps.db
      .update(invoices)
      .set({ signature: body.signature, status: "signed", updatedAt: new Date() })
      .where(eq(invoices.id, row.id))
      .returning()
      .get();
    return c.json(serializeInvoice(deps, updated));
  })
  .post("/:id/cancel", (c) => {
    const deps = c.var.deps;
    const row = deps.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, c.req.param("id")), eq(invoices.seller, c.var.seller)))
      .get();
    if (!row) throw notFound("Invoice not found");
    if (row.status === "completed" || row.status === "cancelled") throw conflict(`Invoice is ${row.status}`);
    if (row.status === "awaiting_signature") {
      deps.db.update(invoices).set({ status: "cancelled", updatedAt: new Date() }).where(eq(invoices.id, row.id)).run();
      return c.json({ status: "cancelled", tx: null });
    }
    return c.json({
      status: row.status,
      tx: {
        chainId: deps.config.CHAIN_ID,
        to: deps.config.CHECKOUT_ADDRESS,
        value: "0",
        data: encodeFunctionData({
          abi: qrushCheckoutAbi,
          functionName: "cancelInvoice",
          args: [row.invoiceId as Hex],
        }),
      },
    });
  });
