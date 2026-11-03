import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { requireSeller } from "../auth.js";
import type { AppEnv, Deps } from "../context.js";
import { fileFingerprints, invoices, productDeliveries, products, shops } from "../db/schema.js";
import { badRequest, conflict, forbidden, notFound, unavailable } from "../lib/errors.js";
import { buyerFieldsInput } from "../services/buyerFields.js";

const firstUpload = (db: Deps["db"], sha256: string) =>
  db.select().from(fileFingerprints).where(eq(fileFingerprints.sha256, sha256)).get()?.firstUploadedAt.toISOString() ?? null;

export const MAX_DELIVERY_BYTES = 50 * 1024 * 1024;
const deliveryPrefix = (shopId: string, productId: string) => `deliveries/${shopId}/${productId}/`;

const deliveryInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("url"),
    url: z
      .string()
      .url()
      .max(2000)
      .refine((u) => /^https?:\/\//i.test(u), "Link must start with http:// or https://"),
  }),
  z.object({
    kind: z.literal("file"),
    pathname: z.string().min(1).max(600),
    fileName: z.string().min(1).max(200),
    rightsConfirmed: z.literal(true, { error: "Confirm that you own the rights to sell this file" }),
  }),
]);
import { formatUsdc, parseUsdc } from "../lib/money.js";

const price = z.union([z.string(), z.number()]).transform((v, ctx) => {
  try {
    const units = parseUsdc(v);
    if (units <= 0n) throw new Error();
    return units.toString();
  } catch {
    ctx.addIssue({ code: "custom", message: "price must be a positive USDC amount" });
    return z.NEVER;
  }
});

const shopInput = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/, "slug must be 3-64 chars of a-z, 0-9, -")
    .optional(),
  description: z.string().max(2000).nullish(),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  city: z.string().max(120).nullish(),
  country: z.string().length(2).nullish(),
  buyerFields: buyerFieldsInput.nullish(),
});

const productInput = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  price,
  sku: z.string().max(120).nullish(),
  active: z.boolean().optional(),
  buyerFields: buyerFieldsInput.nullish(),
  fulfilment: z.enum(["pickup", "shipping", "service", "digital"]).nullish(),
});

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${base.length >= 3 ? base : "shop"}-${randomUUID().slice(0, 6)}`;
}

export function serializeProduct(p: typeof products.$inferSelect) {
  return { ...p, price: formatUsdc(p.priceUsdc) };
}

export function getOwnedShop(deps: Deps, shopId: string, seller: string) {
  const shop = deps.db.select().from(shops).where(eq(shops.id, shopId)).get();
  if (!shop) throw notFound("Shop not found");
  if (shop.seller !== seller) throw forbidden("Not your shop");
  return shop;
}

function ownedProduct(deps: Deps, shopId: string, productId: string) {
  const p = deps.db.select().from(products).where(and(eq(products.id, productId), eq(products.shopId, shopId))).get();
  if (!p) throw notFound("Product not found");
  return p;
}

async function body<T extends z.ZodType>(schema: T, req: Request): Promise<z.infer<T>> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw badRequest(z.prettifyError(parsed.error));
  return parsed.data;
}

export const shopRoutes = new Hono<AppEnv>()
  .get("/by-slug/:slug", (c) => {
    const { db } = c.var.deps;
    const shop = db.select().from(shops).where(eq(shops.slug, c.req.param("slug"))).get();
    if (!shop) throw notFound("Shop not found");
    const list = db
      .select()
      .from(products)
      .where(and(eq(products.shopId, shop.id), eq(products.active, true)))
      .all();
    return c.json({ shop, products: list.map(serializeProduct) });
  })
  .use("*", requireSeller)
  .get("/", (c) => c.json(c.var.deps.db.select().from(shops).where(eq(shops.seller, c.var.seller)).all()))
  .post("/", async (c) => {
    const input = await body(shopInput, c.req.raw);
    const now = new Date();
    const slug = input.slug ?? slugify(input.name);
    const { db } = c.var.deps;
    if (db.select().from(shops).where(eq(shops.slug, slug)).get()) throw conflict("Slug already taken");
    const row = db
      .insert(shops)
      .values({ id: randomUUID(), seller: c.var.seller, ...input, slug, createdAt: now, updatedAt: now })
      .returning()
      .get();
    return c.json(row, 201);
  })
  .get("/:shopId", (c) => c.json(getOwnedShop(c.var.deps, c.req.param("shopId"), c.var.seller)))
  .patch("/:shopId", async (c) => {
    const shop = getOwnedShop(c.var.deps, c.req.param("shopId"), c.var.seller);
    const input = await body(shopInput.partial(), c.req.raw);
    const { db } = c.var.deps;
    if (input.slug && input.slug !== shop.slug && db.select().from(shops).where(eq(shops.slug, input.slug)).get()) {
      throw conflict("Slug already taken");
    }
    return c.json(db.update(shops).set({ ...input, updatedAt: new Date() }).where(eq(shops.id, shop.id)).returning().get());
  })
  .delete("/:shopId", (c) => {
    const shop = getOwnedShop(c.var.deps, c.req.param("shopId"), c.var.seller);
    const { db } = c.var.deps;
    if (db.select({ id: invoices.id }).from(invoices).where(eq(invoices.shopId, shop.id)).get()) {
      throw conflict("Shop has invoices and cannot be deleted");
    }
    db.delete(shops).where(eq(shops.id, shop.id)).run();
    return c.body(null, 204);
  })
  .get("/:shopId/products", (c) => {
    const shop = getOwnedShop(c.var.deps, c.req.param("shopId"), c.var.seller);
    const { db } = c.var.deps;
    const list = db.select().from(products).where(eq(products.shopId, shop.id)).all();
    const deliveries = db.select().from(productDeliveries).all();
    // Seller-only: includes what each product delivers. The public shop route never does.
    return c.json(
      list.map((p) => {
        const d = deliveries.find((x) => x.productId === p.id);
        return {
          ...serializeProduct(p),
          delivery: d
            ? {
                kind: d.kind,
                url: d.url,
                fileName: d.fileName,
                size: d.size,
                sha256: d.sha256,
                firstUploadedAt: d.sha256 ? firstUpload(db, d.sha256) : null,
              }
            : null,
        };
      }),
    );
  })
  /** Vercel Blob client-upload handshake. Files land privately under this product's folder. */
  .post("/:shopId/products/:productId/upload", async (c) => {
    const deps = c.var.deps;
    const shop = getOwnedShop(deps, c.req.param("shopId"), c.var.seller);
    const product = ownedProduct(deps, shop.id, c.req.param("productId"));
    if (!deps.files) throw unavailable("File uploads are not configured");
    const prefix = deliveryPrefix(shop.id, product.id);
    const result = await deps.files.handleUpload(
      c.req.raw,
      await c.req.json().catch(() => null),
      (pathname) => {
        if (!pathname.startsWith(prefix) || pathname.includes("..")) throw forbidden("Upload path not allowed");
      },
      MAX_DELIVERY_BYTES,
    );
    return c.json(result);
  })
  .put("/:shopId/products/:productId/delivery", async (c) => {
    const deps = c.var.deps;
    const shop = getOwnedShop(deps, c.req.param("shopId"), c.var.seller);
    const product = ownedProduct(deps, shop.id, c.req.param("productId"));
    const input = await body(deliveryInput, c.req.raw);
    const previous = deps.db.select().from(productDeliveries).where(eq(productDeliveries.productId, product.id)).get();
    let row: typeof productDeliveries.$inferInsert;
    if (input.kind === "url") {
      row = { productId: product.id, kind: "url", url: input.url, createdAt: new Date() };
    } else {
      if (!deps.files) throw unavailable("File uploads are not configured");
      if (!input.pathname.startsWith(deliveryPrefix(shop.id, product.id))) throw forbidden("File does not belong to this product");
      const meta = await deps.files.head(input.pathname);
      if (!meta) throw badRequest("Upload not found. Try uploading again.");
      if (meta.size > MAX_DELIVERY_BYTES) throw badRequest("File is larger than 50 MB");
      const sha256 = createHash("sha256").update(await deps.files.read(input.pathname)).digest("hex");
      const owner = deps.db.select().from(fileFingerprints).where(eq(fileFingerprints.sha256, sha256)).get();
      if (owner && owner.shopId !== shop.id) {
        await deps.files.remove(input.pathname);
        throw conflict("This file is already sold by another shop");
      }
      if (!owner) {
        deps.db
          .insert(fileFingerprints)
          .values({ sha256, shopId: shop.id, productId: product.id, seller: c.var.seller, fileName: input.fileName, firstUploadedAt: new Date() })
          .run();
      }
      row = {
        sha256,
        rightsConfirmedAt: new Date(),
        productId: product.id,
        kind: "file",
        pathname: input.pathname,
        fileName: input.fileName,
        size: meta.size,
        contentType: meta.contentType,
        createdAt: new Date(),
      };
    }
    deps.db.delete(productDeliveries).where(eq(productDeliveries.productId, product.id)).run();
    deps.db.insert(productDeliveries).values(row).run();
    if (previous?.pathname && previous.pathname !== row.pathname) await deps.files?.remove(previous.pathname);
    return c.json({
      kind: row.kind,
      url: row.url ?? null,
      fileName: row.fileName ?? null,
      size: row.size ?? null,
      sha256: row.sha256 ?? null,
      firstUploadedAt: row.sha256 ? firstUpload(deps.db, row.sha256) : null,
    });
  })
  .delete("/:shopId/products/:productId/delivery", async (c) => {
    const deps = c.var.deps;
    const shop = getOwnedShop(deps, c.req.param("shopId"), c.var.seller);
    const product = ownedProduct(deps, shop.id, c.req.param("productId"));
    const previous = deps.db.delete(productDeliveries).where(eq(productDeliveries.productId, product.id)).returning().get();
    if (previous?.pathname) await deps.files?.remove(previous.pathname);
    return c.body(null, 204);
  })
  .post("/:shopId/products", async (c) => {
    const shop = getOwnedShop(c.var.deps, c.req.param("shopId"), c.var.seller);
    const raw = await c.req.json().catch(() => null);
    const many = Array.isArray(raw);
    const parsed = z.array(productInput).min(1).max(500).safeParse(many ? raw : [raw]);
    if (!parsed.success) throw badRequest(z.prettifyError(parsed.error));
    const now = new Date();
    const rows = c.var.deps.db
      .insert(products)
      .values(
        parsed.data.map(({ price: priceUsdc, ...p }) => ({
          id: randomUUID(),
          shopId: shop.id,
          ...p,
          priceUsdc,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .returning()
      .all()
      .map(serializeProduct);
    return c.json(many ? rows : rows[0], 201);
  })
  .patch("/:shopId/products/:productId", async (c) => {
    const shop = getOwnedShop(c.var.deps, c.req.param("shopId"), c.var.seller);
    const { price: priceUsdc, ...rest } = await body(productInput.partial(), c.req.raw);
    const row = c.var.deps.db
      .update(products)
      .set({ ...rest, ...(priceUsdc ? { priceUsdc } : {}), updatedAt: new Date() })
      .where(and(eq(products.id, c.req.param("productId")), eq(products.shopId, shop.id)))
      .returning()
      .get();
    if (!row) throw notFound("Product not found");
    return c.json(serializeProduct(row));
  })
  .delete("/:shopId/products/:productId", (c) => {
    const shop = getOwnedShop(c.var.deps, c.req.param("shopId"), c.var.seller);
    const row = c.var.deps.db
      .delete(products)
      .where(and(eq(products.id, c.req.param("productId")), eq(products.shopId, shop.id)))
      .returning()
      .get();
    if (!row) throw notFound("Product not found");
    return c.body(null, 204);
  });
