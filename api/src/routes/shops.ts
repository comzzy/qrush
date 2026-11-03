import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireSeller } from "../auth.js";
import type { AppEnv, Deps } from "../context.js";
import { invoices, products, shops } from "../db/schema.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
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
});

const productInput = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  price,
  sku: z.string().max(120).nullish(),
  active: z.boolean().optional(),
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
    return c.json(c.var.deps.db.select().from(products).where(eq(products.shopId, shop.id)).all().map(serializeProduct));
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
