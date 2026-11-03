import { createMiddleware } from "hono/factory";
import { sign, verify } from "hono/jwt";
import { getAddress, isAddress } from "viem";
import type { AppEnv } from "./context.js";
import { unauthorized } from "./lib/errors.js";

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function issueSession(secret: string, address: string) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = await sign({ sub: getAddress(address), exp }, secret, "HS256");
  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

export const requireSeller = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("authorization");
  if (!header?.startsWith("Bearer ")) throw unauthorized("Missing bearer token");
  try {
    const payload = await verify(header.slice(7), c.var.deps.config.JWT_SECRET, "HS256");
    if (typeof payload.sub !== "string" || !isAddress(payload.sub)) throw unauthorized("Invalid session");
    c.set("seller", getAddress(payload.sub));
  } catch {
    throw unauthorized("Invalid or expired session");
  }
  await next();
});
