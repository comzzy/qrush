import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { streamSSE } from "hono/streaming";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { isAddress, type Address } from "viem";
import { z } from "zod";
import { requireSeller } from "../auth.js";
import type { AppEnv } from "../context.js";
import { invoices, products, payments, sellers, shops } from "../db/schema.js";
import { badRequest, unavailable } from "../lib/errors.js";
import { forwardBundler, forwardPaymaster, rpcError } from "../aa/proxy.js";
import { ENTRY_POINT_V07 } from "../aa/policy.js";
import { AiNotConfiguredError, extractProductsFromImage } from "../services/ai.js";
import { resolveBasename, reverseBasename } from "../services/basenames.js";
import type { PaymentEvent } from "../events.js";
import { getOwnedShop, serializeProduct } from "./shops.js";
import { randomUUID } from "node:crypto";

export const feedRoutes = new Hono<AppEnv>()
  .get("/live", (c) => {
    const seller = c.req.query("seller")?.toLowerCase();
    const shopId = c.req.query("shopId");
    const bus = c.var.deps.bus;
    return streamSSE(c, async (stream) => {
      const queue: PaymentEvent[] = [];
      let wake: (() => void) | undefined;
      const onPayment = (e: PaymentEvent) => {
        if (seller && e.seller.toLowerCase() !== seller) return;
        if (shopId && e.shopId !== shopId) return;
        queue.push(e);
        wake?.();
      };
      bus.on("payment", onPayment);
      let closed = false;
      stream.onAbort(() => {
        closed = true;
        bus.off("payment", onPayment);
        wake?.();
      });
      await stream.writeSSE({ event: "ready", data: JSON.stringify({ at: new Date().toISOString() }) });
      while (!closed) {
        const next = queue.shift();
        if (next) {
          await stream.writeSSE({ event: "payment", id: String(next.receiptId), data: JSON.stringify(next) });
          continue;
        }
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 15_000);
          wake = () => {
            clearTimeout(t);
            resolve();
          };
        });
        wake = undefined;
        if (!closed && queue.length === 0) await stream.writeSSE({ event: "ping", data: "" });
      }
    });
  })
  .get("/recent", (c) => {
    const limit = Math.min(Number(c.req.query("limit") ?? 100) || 100, 500);
    // Map clients want geotagged points only; the activity feed passes include=all.
    const all = c.req.query("include") === "all";
    const rows = c.var.deps.db
      .select({
        receiptId: payments.receiptId,
        seller: payments.seller,
        netAmount: payments.netAmount,
        tokenIn: payments.tokenIn,
        latitude: payments.latitude,
        longitude: payments.longitude,
        city: payments.city,
        country: payments.country,
        geoSource: payments.geoSource,
        blockTimestamp: payments.blockTimestamp,
        txHash: payments.txHash,
        shopName: shops.name,
      })
      .from(payments)
      .leftJoin(invoices, eq(invoices.invoiceKey, payments.invoiceKey))
      .leftJoin(shops, eq(shops.id, invoices.shopId))
      .where(all ? undefined : and(isNotNull(payments.latitude), isNotNull(payments.longitude)))
      .orderBy(desc(payments.receiptId))
      .limit(limit)
      .all();
    return c.json(rows);
  });

export const basenameRoutes = new Hono<AppEnv>()
  .get("/resolve/:name", async (c) => {
    try {
      const result = await resolveBasename(c.var.deps.client, c.var.deps.config.BASENAME_L2_RESOLVER, c.req.param("name"));
      return c.json(result, result.address ? 200 : 404);
    } catch (e) {
      throw badRequest((e as Error).message);
    }
  })
  .get("/reverse/:address", async (c) => {
    const address = c.req.param("address");
    if (!isAddress(address)) throw badRequest("Invalid address");
    const result = await reverseBasename(c.var.deps.client, c.var.deps.config.BASENAME_L2_RESOLVER, address as Address);
    if (result.name) {
      c.var.deps.db.update(sellers).set({ basename: result.name }).where(eq(sellers.address, result.address)).run();
    }
    // No primary name is a normal answer, not a missing resource.
    return c.json(result);
  });

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg"]);

export const aiRoutes = new Hono<AppEnv>().use("*", requireSeller).post("/shop-setup", async (c) => {
  const deps = c.var.deps;
  let image: { dataUrl: string } | { url: string };
  let shopId: string | undefined;
  const contentType = c.req.header("content-type") ?? "";
  if (contentType.startsWith("multipart/form-data")) {
    const form = await c.req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) throw badRequest("image file field required");
    if (!IMAGE_TYPES.has(file.type)) throw badRequest("image must be png or jpeg");
    if (file.size > MAX_IMAGE_BYTES) throw badRequest("image exceeds 8MB");
    image = { dataUrl: `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}` };
    const s = form.get("shopId");
    shopId = typeof s === "string" && s ? s : undefined;
  } else {
    const parsed = z
      .object({ imageUrl: z.string().url().optional(), imageBase64: z.string().optional(), mimeType: z.string().optional(), shopId: z.string().uuid().optional() })
      .refine((v) => v.imageUrl || v.imageBase64, { message: "imageUrl or imageBase64 required" })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw badRequest(z.prettifyError(parsed.error));
    const { imageUrl, imageBase64, mimeType, shopId: sid } = parsed.data;
    if (imageBase64) {
      const mime = mimeType ?? "image/jpeg";
      if (!IMAGE_TYPES.has(mime)) throw badRequest("mimeType must be png or jpeg");
      if (Buffer.byteLength(imageBase64, "base64") > MAX_IMAGE_BYTES) throw badRequest("image exceeds 8MB");
      image = { dataUrl: `data:${mime};base64,${imageBase64}` };
    } else {
      image = { url: imageUrl! };
    }
    shopId = sid;
  }
  const shop = shopId ? getOwnedShop(deps, shopId, c.var.seller) : undefined;

  let result;
  try {
    result = await extractProductsFromImage(
      { apiKey: deps.config.AI_API_KEY, baseUrl: deps.config.AI_BASE_URL, model: deps.config.AI_MODEL, fetch: deps.fetch },
      image,
    );
  } catch (e) {
    if (e instanceof AiNotConfiguredError) throw unavailable(e.message);
    throw new HTTPException(502, { message: (e as Error).message });
  }
  const priced = result.products.filter((p) => BigInt(p.priceUsdc) > 0n);
  const nonUsd = result.currency !== null && !["USD", "USDC"].includes(result.currency.toUpperCase());

  let created: ReturnType<typeof serializeProduct>[] = [];
  if (shop && !nonUsd && priced.length) {
    const now = new Date();
    created = deps.db
      .insert(products)
      .values(
        priced.map((p) => ({
          id: randomUUID(),
          shopId: shop.id,
          name: p.name,
          description: p.description,
          priceUsdc: p.priceUsdc,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .returning()
      .all()
      .map(serializeProduct);
  }
  return c.json({
    model: result.model,
    currency: result.currency,
    requiresCurrencyConversion: nonUsd,
    products: result.products,
    created,
  });
});

export const aaRoutes = new Hono<AppEnv>()
  .get("/config", (c) => {
    const { config } = c.var.deps;
    const api = config.PUBLIC_BASE_URL.replace(/\/$/, "");
    return c.json({
      chainId: config.CHAIN_ID,
      entryPoint: ENTRY_POINT_V07,
      entryPointVersion: "0.7",
      checkout: config.CHECKOUT_ADDRESS,
      paymasterUrl: config.PAYMASTER_URL ? `${api}/aa/paymaster` : null,
      bundlerUrl: config.BUNDLER_URL ? `${api}/aa/bundler` : null,
      sponsorship: config.PAYMASTER_URL ? "checkout-calls-only" : "disabled",
    });
  })
  .post("/paymaster", async (c) => {
    const { config, fetch } = c.var.deps;
    const req = await c.req.json().catch(() => null);
    if (!req?.method) return c.json(rpcError(null, -32700, "Parse error"));
    if (!config.PAYMASTER_URL) return c.json(rpcError(req.id ?? null, -32004, "Paymaster not configured"));
    return c.json(
      await forwardPaymaster(req, {
        upstream: config.PAYMASTER_URL,
        checkout: config.CHECKOUT_ADDRESS,
        chainId: config.CHAIN_ID,
        context: config.PAYMASTER_CONTEXT ? JSON.parse(config.PAYMASTER_CONTEXT) : undefined,
        fetch,
      }),
    );
  })
  .post("/bundler", async (c) => {
    const { config, fetch } = c.var.deps;
    const req = await c.req.json().catch(() => null);
    if (!req?.method) return c.json(rpcError(null, -32700, "Parse error"));
    if (!config.BUNDLER_URL) return c.json(rpcError(req.id ?? null, -32004, "Bundler not configured"));
    return c.json(await forwardBundler(req, { upstream: config.BUNDLER_URL, fetch }));
  });
