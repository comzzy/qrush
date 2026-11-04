"use client";

import { useQuery } from "@tanstack/react-query";
import { createPublicClient, fallback, http, parseAbi } from "viem";
import { base } from "viem/chains";
import { CHECKOUT_ADDRESS } from "@/lib/guard";

const client = createPublicClient({ chain: base, transport: fallback(["https://base-rpc.publicnode.com", "https://mainnet.base.org"].map((u) => http(u))) });
const abi = parseAbi(["function receiptCount() view returns (uint256)"]);

/** Read straight from the QRush checkout contract on Base. Shows nothing if the read fails. */
export function OnchainStats() {
  const { data } = useQuery({
    queryKey: ["onchain", "receiptCount"],
    queryFn: () => client.readContract({ address: CHECKOUT_ADDRESS, abi, functionName: "receiptCount" }),
    refetchInterval: 30_000,
  });
  if (data === undefined) return null;
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-ink bg-white px-4 py-3 text-sm" data-testid="onchain-stats">
      <span className="text-2xl font-bold">{data.toString()}</span>
      <span>payments settled through the QRush contract on Base so far (live count).</span>
      <a href={`https://basescan.org/address/${CHECKOUT_ADDRESS}`} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
        Check on Basescan ↗
      </a>
    </div>
  );
}
