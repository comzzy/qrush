import { concatHex, numberToHex, type Address, type Hex, type PublicClient } from "viem";

const quoterV2Abi = [
  {
    type: "function",
    name: "quoteExactOutput",
    stateMutability: "nonpayable",
    inputs: [
      { name: "path", type: "bytes" },
      { name: "amountOut", type: "uint256" },
    ],
    outputs: [
      { name: "amountIn", type: "uint256" },
      { name: "sqrtPriceX96AfterList", type: "uint160[]" },
      { name: "initializedTicksCrossedList", type: "uint32[]" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

const FEE_TIERS = [100, 500, 3000, 10000] as const;
const HOP_FEES = [500, 3000] as const;

/** Exact-output paths are encoded from the output token (USDC) back to the input token. */
export function encodeExactOutputPath(tokens: Address[], fees: number[]): Hex {
  if (tokens.length !== fees.length + 1) throw new Error("path tokens/fees mismatch");
  const parts: Hex[] = [tokens[0]!];
  fees.forEach((fee, i) => {
    parts.push(numberToHex(fee, { size: 3 }), tokens[i + 1]!);
  });
  return concatHex(parts);
}

export type SwapQuote = { path: Hex; amountIn: bigint; maxAmountIn: bigint; hops: number };

export async function quoteBestExactOutput(
  client: PublicClient,
  params: { quoter: Address; usdc: Address; weth: Address; tokenIn: Address; amountOut: bigint; slippageBps: number },
): Promise<SwapQuote> {
  const { quoter, usdc, weth, tokenIn, amountOut, slippageBps } = params;
  const candidates: Hex[] = FEE_TIERS.map((fee) => encodeExactOutputPath([usdc, tokenIn], [fee]));
  if (tokenIn.toLowerCase() !== weth.toLowerCase()) {
    for (const outFee of HOP_FEES) {
      for (const inFee of FEE_TIERS) {
        candidates.push(encodeExactOutputPath([usdc, weth, tokenIn], [outFee, inFee]));
      }
    }
  }

  const results = await Promise.allSettled(
    candidates.map(async (path) => {
      const { result } = await client.simulateContract({
        address: quoter,
        abi: quoterV2Abi,
        functionName: "quoteExactOutput",
        args: [path, amountOut],
      });
      return { path, amountIn: result[0] };
    }),
  );

  let best: { path: Hex; amountIn: bigint } | undefined;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.amountIn > 0n && (!best || r.value.amountIn < best.amountIn)) {
      best = r.value;
    }
  }
  if (!best) throw new Error("No Uniswap v3 route to USDC found for this token");
  const maxAmountIn = best.amountIn + (best.amountIn * BigInt(slippageBps)) / 10_000n + 1n;
  return { path: best.path, amountIn: best.amountIn, maxAmountIn, hops: (best.path.length - 42) / 46 };
}
