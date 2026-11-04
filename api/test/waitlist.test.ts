import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { openMemoryDb } from "../src/db/client.js";
import { waitlistRoutes } from "../src/routes/waitlist.js";

describe("waitlist", () => {
  const mem = openMemoryDb();
  const app = new Hono<{ Variables: { deps: unknown } }>()
    .use("*", async (c, next) => { c.set("deps", { db: mem.db }); await next(); })
    .route("/waitlist", waitlistRoutes as never);
  const post = (b: object) => app.request("/waitlist", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" }, body: JSON.stringify(b) });

  it("saves a signup, dedupes, and blocks bots", async () => {
    expect(await (await app.request("/waitlist")).json()).toEqual({ count: 0 });
    expect((await post({ email: "A@b.co", businessType: "Other", shownAt: Date.now() - 5000 })).status).toBe(200);
    expect((await post({ email: "a@b.co", businessType: "Other", shownAt: Date.now() - 5000 })).status).toBe(200);
    expect((await post({ email: "c@b.co", businessType: "Other", website: "x", shownAt: Date.now() - 5000 })).status).toBe(400);
    expect((await post({ email: "d@b.co", businessType: "Other", shownAt: Date.now() })).status).toBe(429);
    expect((await post({ email: "bad", businessType: "Other", shownAt: 1 })).status).toBe(400);
    expect(await (await app.request("/waitlist")).json()).toEqual({ count: 1 });
  });
});
