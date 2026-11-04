import { Hono } from "hono";
import { count } from "drizzle-orm";
import { z } from "zod";
import type { AppEnv } from "../context.js";
import { waitlist } from "../db/schema.js";

export const BUSINESS_TYPES = ["Ebooks and digital goods", "Food and drinks", "Retail shop", "Services", "Events and tickets", "Other"] as const;

const body = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  businessType: z.enum(BUSINESS_TYPES),
  /** Honeypot: people never see this field, bots fill it. */
  website: z.string().max(0).optional().default(""),
  /** When the form was shown (ms). Real people take longer than 2 seconds. */
  shownAt: z.number().int(),
});

const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5;
}

export const waitlistRoutes = new Hono<AppEnv>()
  .get("/", (c) => {
    const row = c.var.deps.db.select({ n: count() }).from(waitlist).get();
    return c.json({ count: row?.n ?? 0 });
  })
  .post("/", async (c) => {
    const parsed = body.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Please enter a valid email and pick a business type." }, 400);
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const tooFast = Date.now() - parsed.data.shownAt < 2000;
    if (parsed.data.website || tooFast || limited(ip)) return c.json({ error: "Please wait a moment and try again." }, 429);
    c.var.deps.db
      .insert(waitlist)
      .values({ email: parsed.data.email, businessType: parsed.data.businessType, createdAt: new Date() })
      .onConflictDoNothing()
      .run();
    return c.json({ ok: true });
  });
