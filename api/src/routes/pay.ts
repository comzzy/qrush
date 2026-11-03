import { Hono, type Context } from "hono";
import { eq, desc } from "drizzle-orm";
import { encodeFunctionData, erc20Abi, getAddress, isAddress, isAddressEqual, type Address, type Hex } from "viem";
import type { AppEnv, Deps } from "../context.js";
import { qrushCheckoutAbi } from "../contracts/artifact.js";
import { invoices, payments, shops } from "../db/schema.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { geoFromHeaders } from "../lib/geo.js";
import { formatUsdc } from "../lib/money.js";
import { toOnchainInvoice } from "../services/invoiceTypes.js";
import { payUrl, renderQr, serializeInvoice } from "../services/invoiceView.js";
import { quoteBestExactOutput } from "../services/swapQuote.js";

const ONCHAIN_STATUS = ["none", "open", "completed", "cancelled"] as const;
const QUOTE_TTL_SECONDS = 600;

type Call = { to: Address; value: string; data: Hex };

function loadInvoice(deps: Deps, key: string) {
  const row = deps.db.select().from(invoices).where(eq(invoices.invoiceKey, key)).get();
  if (!row) throw notFound("Invoice not found");
  return row;
}

async function onchainInvoice(deps: Deps, key: Hex) {
  const inv = await deps.client.readContract({
    address: deps.config.CHECKOUT_ADDRESS,
    abi: qrushCheckoutAbi,
    functionName: "getInvoice",
    args: [key],
  });
  return { status: ONCHAIN_STATUS[inv.status] ?? "none", uses: inv.uses };
}

export const payRoutes = new Hono<AppEnv>()
  .get("/:key", async (c) => {
    const deps = c.var.deps;
    const row = loadInvoice(deps, c.req.param("key"));
    const geo = geoFromHeaders((n) => c.req.header(n));
    if (geo.latitude !== null && geo.longitude !== null) {
      deps.db
        .update(invoices)
        .set({ viewerLatitude: geo.latitude, viewerLongitude: geo.longitude, viewerCity: geo.city, viewerCountry: geo.country })
        .where(eq(invoices.id, row.id))
        .run();
    }
    const shop = deps.db.select().from(shops).where(eq(shops.id, row.shopId)).get()!;
    const onchain = await onchainInvoice(deps, row.invoiceKey as Hex);
    const payable =
      (row.status === "signed" && onchain.status === "none") || (onchain.status === "open" && row.status !== "cancelled");
    return c.json({
      invoice: serializeInvoice(deps, row),
      shop: { id: shop.id, name: shop.name, slug: shop.slug, city: shop.city, country: shop.country },
      onchain,
      payable,
      checkout: deps.config.CHECKOUT_ADDRESS,
      chainId: deps.config.CHAIN_ID,
    });
  })
  .get("/:key/qr.png", (c) => qrResponse(c, "png"))
  .get("/:key/qr.svg", (c) => qrResponse(c, "svg"))
  .get("/:key/receipts", (c) => {
    const rows = c.var.deps.db
      .select()
      .from(payments)
      .where(eq(payments.invoiceKey, c.req.param("key")))
      .orderBy(desc(payments.receiptId))
      .all();
    return c.json(rows);
  })
  /**
   * Build the exact calls a buyer must submit. `calls` is the batch for a smart account
   * (permissionless / ERC-5792 sendCalls); `transactions` is the sequence for an EOA.
   */
  .get("/:key/checkout", async (c) => {
    const deps = c.var.deps;
    const { config, client } = deps;
    const row = loadInvoice(deps, c.req.param("key"));
    const buyerParam = c.req.query("buyer");
    if (!buyerParam || !isAddress(buyerParam)) throw badRequest("buyer address required");
    const buyer = getAddress(buyerParam);
    const tokenParam = (c.req.query("token") ?? "usdc").toLowerCase();
    const slippageBps = Number(c.req.query("slippageBps") ?? 50);
    if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 1000) throw badRequest("slippageBps 0-1000");

    if (row.status === "awaiting_signature") throw conflict("Invoice has not been signed by the seller");
    if (row.status === "cancelled" || row.status === "completed") throw conflict(`Invoice is ${row.status}`);
    if (row.expiresAt !== 0 && row.expiresAt <= Math.floor(Date.now() / 1000)) throw conflict("Invoice expired");

    const onchain = await onchainInvoice(deps, row.invoiceKey as Hex);
    if (onchain.status === "completed" || onchain.status === "cancelled") throw conflict(`Invoice is ${onchain.status}`);
    const needsPublish = onchain.status === "none";
    if (needsPublish && !row.signature) throw conflict("Invoice is not published onchain");

    const [purchases, threshold, discountBps, eligible] = await client.readContract({
      address: config.CHECKOUT_ADDRESS,
      abi: qrushCheckoutAbi,
      functionName: "loyaltyStatus",
      args: [row.seller as Address, buyer],
    });
    const gross = BigInt(row.amount);
    const discount = eligible ? (gross * BigInt(discountBps)) / 10_000n : 0n;
    const net = gross - discount;

    const checkout = config.CHECKOUT_ADDRESS;
    const key = row.invoiceKey as Hex;
    const publishData = needsPublish
      ? encodeFunctionData({
          abi: qrushCheckoutAbi,
          functionName: "publishInvoice",
          args: [toOnchainInvoice(row), row.signature as Hex],
        })
      : null;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + QUOTE_TTL_SECONDS);

    let payToken: Address | "ETH";
    if (tokenParam === "usdc") payToken = config.USDC_ADDRESS;
    else if (tokenParam === "eth") payToken = "ETH";
    else if (isAddress(tokenParam)) payToken = getAddress(tokenParam);
    else throw badRequest("token must be usdc, eth, or an ERC20 address");

    let payCall: Call;
    let approval: { token: Address; amount: bigint } | null = null;
    let swap: { path: Hex; amountIn: string; maxAmountIn: string; hops: number } | null = null;

    if (payToken !== "ETH" && isAddressEqual(payToken, config.USDC_ADDRESS)) {
      approval = { token: config.USDC_ADDRESS, amount: net };
      payCall = { to: checkout, value: "0", data: encodeFunctionData({ abi: qrushCheckoutAbi, functionName: "payWithUSDC", args: [key] }) };
    } else {
      const tokenIn = payToken === "ETH" ? config.WETH_ADDRESS : payToken;
      const quote = await quoteBestExactOutput(client, {
        quoter: config.QUOTER_V2_ADDRESS,
        usdc: config.USDC_ADDRESS,
        weth: config.WETH_ADDRESS,
        tokenIn,
        amountOut: net,
        slippageBps,
      }).catch((e: Error) => {
        throw badRequest(e.message);
      });
      swap = { path: quote.path, amountIn: quote.amountIn.toString(), maxAmountIn: quote.maxAmountIn.toString(), hops: quote.hops };
      if (payToken === "ETH") {
        payCall = {
          to: checkout,
          value: quote.maxAmountIn.toString(),
          data: encodeFunctionData({ abi: qrushCheckoutAbi, functionName: "payWithETH", args: [key, quote.path, deadline] }),
        };
      } else {
        approval = { token: payToken, amount: quote.maxAmountIn };
        payCall = {
          to: checkout,
          value: "0",
          data: encodeFunctionData({
            abi: qrushCheckoutAbi,
            functionName: "payWithToken",
            args: [key, quote.path, quote.maxAmountIn, deadline],
          }),
        };
      }
    }

    let approveCall: Call | null = null;
    if (approval) {
      const allowance = await client.readContract({
        address: approval.token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [buyer, checkout],
      });
      if (allowance < approval.amount) {
        approveCall = {
          to: approval.token,
          value: "0",
          data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [checkout, approval.amount] }),
        };
      }
    }

    const calls: Call[] = [
      ...(approveCall ? [approveCall] : []),
      ...(publishData ? [{ to: checkout, value: "0", data: publishData }] : []),
      payCall,
    ];

    const transactions: Call[] = [...(approveCall ? [approveCall] : [])];
    if (publishData && payCall.value === "0") {
      transactions.push({
        to: checkout,
        value: "0",
        data: encodeFunctionData({ abi: qrushCheckoutAbi, functionName: "multicall", args: [[publishData, payCall.data]] }),
      });
    } else {
      if (publishData) transactions.push({ to: checkout, value: "0", data: publishData });
      transactions.push(payCall);
    }

    return c.json({
      invoiceKey: key,
      chainId: config.CHAIN_ID,
      buyer,
      payToken,
      gross: formatUsdc(gross),
      discount: formatUsdc(discount),
      amountDue: formatUsdc(net),
      amountDueUnits: net.toString(),
      loyalty: { purchases: purchases.toString(), threshold, discountBps, eligible },
      swap,
      deadline: deadline.toString(),
      calls,
      transactions,
    });
  });

async function qrResponse(c: Context<AppEnv>, format: "png" | "svg") {
  const deps = c.var.deps;
  const row = loadInvoice(deps, c.req.param("key") ?? "");
  const size = Math.min(Math.max(Number(c.req.query("size") ?? 512) || 512, 128), 2048);
  const out = await renderQr(payUrl(deps, row.invoiceKey), format, size);
  c.header("cache-control", "public, max-age=86400, immutable");
  if (format === "png") {
    c.header("content-type", "image/png");
    return c.body(new Uint8Array(out as Buffer));
  }
  c.header("content-type", "image/svg+xml");
  return c.body(out as string);
}
