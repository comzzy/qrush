import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import type { AppEnv, Deps } from "./context.js";
import { authRoutes } from "./routes/auth.js";
import { invoiceRoutes } from "./routes/invoices.js";
import { aaRoutes, aiRoutes, basenameRoutes, feedRoutes } from "./routes/misc.js";
import { payRoutes } from "./routes/pay.js";
import { loyaltyRoutes, receiptRoutes } from "./routes/receipts.js";
import { sellerRoutes } from "./routes/seller.js";
import { shopRoutes } from "./routes/shops.js";

export function createApp(deps: Deps, opts: { log?: boolean } = {}) {
  const app = new Hono<AppEnv>();
  if (opts.log) app.use("*", logger());
  app.use("*", cors());
  app.use("*", async (c, next) => {
    c.set("deps", deps);
    await next();
  });

  app.get("/health", (c) => c.json({ ok: true, chainId: deps.config.CHAIN_ID, checkout: deps.config.CHECKOUT_ADDRESS }));
  app.route("/auth", authRoutes);
  app.route("/seller", sellerRoutes);
  app.route("/shops", shopRoutes);
  app.route("/invoices", invoiceRoutes);
  app.route("/pay", payRoutes);
  app.route("/receipts", receiptRoutes);
  app.route("/loyalty", loyaltyRoutes);
  app.route("/basenames", basenameRoutes);
  app.route("/feed", feedRoutes);
  app.route("/ai", aiRoutes);
  app.route("/aa", aaRoutes);

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: "Internal server error" }, 500);
  });
  app.notFound((c) => c.json({ error: "Not found" }, 404));
  return app;
}
