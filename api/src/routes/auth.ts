import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { generateSiweNonce, parseSiweMessage } from "viem/siwe";
import { z } from "zod";
import { issueSession, requireSeller } from "../auth.js";
import type { AppEnv } from "../context.js";
import { authNonces, sellers } from "../db/schema.js";
import { badRequest, unauthorized } from "../lib/errors.js";
import { getAddress, isHex } from "viem";

const NONCE_TTL_MS = 10 * 60 * 1000;

const verifyBody = z.object({ message: z.string().min(1), signature: z.string().refine((s) => isHex(s)) });

export const authRoutes = new Hono<AppEnv>()
  .get("/nonce", (c) => {
    const nonce = generateSiweNonce();
    c.var.deps.db.insert(authNonces).values({ nonce, createdAt: new Date() }).run();
    return c.json({
      nonce,
      domain: c.var.deps.config.SIWE_DOMAIN,
      uri: c.var.deps.config.PUBLIC_BASE_URL,
      chainId: c.var.deps.config.CHAIN_ID,
    });
  })
  .post("/verify", async (c) => {
    const { config, db, client } = c.var.deps;
    const body = verifyBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw badRequest("message and signature are required");
    const fields = parseSiweMessage(body.data.message);
    if (!fields.address || !fields.nonce) throw badRequest("Malformed SIWE message");
    if (fields.domain !== config.SIWE_DOMAIN) throw unauthorized("SIWE domain mismatch");
    if (fields.chainId !== config.CHAIN_ID) throw unauthorized("SIWE chain mismatch");

    const nonceRow = db.select().from(authNonces).where(eq(authNonces.nonce, fields.nonce)).get();
    if (!nonceRow || nonceRow.usedAt || Date.now() - nonceRow.createdAt.getTime() > NONCE_TTL_MS) {
      throw unauthorized("Unknown, expired, or used nonce");
    }

    const valid = await client.verifySiweMessage({
      message: body.data.message,
      signature: body.data.signature as `0x${string}`,
      domain: config.SIWE_DOMAIN,
      nonce: fields.nonce,
    });
    if (!valid) throw unauthorized("Invalid SIWE signature");

    db.update(authNonces).set({ usedAt: new Date() }).where(eq(authNonces.nonce, fields.nonce)).run();
    const address = getAddress(fields.address);
    db.insert(sellers).values({ address, createdAt: new Date() }).onConflictDoNothing().run();
    return c.json({ address, ...(await issueSession(config.JWT_SECRET, address)) });
  })
  .get("/me", requireSeller, (c) => {
    const row = c.var.deps.db.select().from(sellers).where(eq(sellers.address, c.var.seller)).get();
    return c.json({ address: c.var.seller, onchainRegistered: row?.onchainRegistered ?? false, basename: row?.basename ?? null });
  });
