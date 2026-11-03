import { Hono } from "hono";
import { encodeFunctionData, getAddress, isAddress, type Address } from "viem";
import { z } from "zod";
import { requireSeller } from "../auth.js";
import type { AppEnv, Deps } from "../context.js";
import { qrushCheckoutAbi } from "../contracts/artifact.js";
import { badRequest } from "../lib/errors.js";

const splitsInput = z
  .object({
    splits: z
      .array(
        z.object({
          recipient: z.string().refine(isAddress, "invalid address"),
          bps: z.number().int().min(1).max(10_000),
        }),
      )
      .max(10),
  })
  .refine((v) => v.splits.length === 0 || v.splits.reduce((a, s) => a + s.bps, 0) === 10_000, {
    message: "bps must sum to 10000",
  });

const loyaltyInput = z
  .object({ threshold: z.number().int().min(0).max(4_294_967_295), discountBps: z.number().int().min(0).max(5000) })
  .refine((v) => v.threshold !== 0 || v.discountBps === 0, { message: "discountBps requires threshold > 0" });

async function parse<T extends z.ZodType>(schema: T, req: Request): Promise<z.infer<T>> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw badRequest(z.prettifyError(parsed.error));
  return parsed.data;
}

export async function readSellerOnchain(deps: Deps, seller: Address) {
  const address = deps.config.CHECKOUT_ADDRESS;
  const [info, splits] = await Promise.all([
    deps.client.readContract({ address, abi: qrushCheckoutAbi, functionName: "getSeller", args: [seller] }),
    deps.client.readContract({ address, abi: qrushCheckoutAbi, functionName: "getSplits", args: [seller] }),
  ]);
  return {
    registered: info.registered,
    name: info.name,
    loyalty: { threshold: info.loyaltyThreshold, discountBps: info.loyaltyDiscountBps },
    splits:
      splits.length === 0
        ? [{ recipient: seller, bps: 10_000 }]
        : splits.map((s) => ({ recipient: getAddress(s.recipient), bps: s.bps })),
    customSplits: splits.length > 0,
  };
}

const tx = (deps: Deps, data: `0x${string}`) => ({
  chainId: deps.config.CHAIN_ID,
  to: deps.config.CHECKOUT_ADDRESS,
  value: "0",
  data,
});

/** Seller-signed onchain actions. The API prepares calldata; the seller's wallet submits it. */
export const sellerRoutes = new Hono<AppEnv>()
  .use("*", requireSeller)
  .get("/onchain", async (c) => c.json(await readSellerOnchain(c.var.deps, c.var.seller)))
  .post("/onchain/register", async (c) => {
    const input = await parse(splitsInput.and(z.object({ name: z.string().min(1).max(120) })), c.req.raw);
    const data = encodeFunctionData({
      abi: qrushCheckoutAbi,
      functionName: "registerSeller",
      args: [input.name, input.splits.map((s) => s.recipient as Address), input.splits.map((s) => s.bps)],
    });
    return c.json({ tx: tx(c.var.deps, data) });
  })
  .get("/splits", async (c) => {
    const info = await readSellerOnchain(c.var.deps, c.var.seller);
    return c.json({ splits: info.splits, customSplits: info.customSplits });
  })
  .put("/splits", async (c) => {
    const input = await parse(splitsInput, c.req.raw);
    const data = encodeFunctionData({
      abi: qrushCheckoutAbi,
      functionName: "setSplits",
      args: [input.splits.map((s) => s.recipient as Address), input.splits.map((s) => s.bps)],
    });
    return c.json({ tx: tx(c.var.deps, data) });
  })
  .get("/loyalty", async (c) => {
    const info = await readSellerOnchain(c.var.deps, c.var.seller);
    return c.json(info.loyalty);
  })
  .put("/loyalty", async (c) => {
    const input = await parse(loyaltyInput, c.req.raw);
    const data = encodeFunctionData({
      abi: qrushCheckoutAbi,
      functionName: "setLoyalty",
      args: [input.threshold, input.discountBps],
    });
    return c.json({ tx: tx(c.var.deps, data) });
  });
