import { getCapabilities, sendCalls, sendTransaction, switchChain, waitForCallsStatus, waitForTransactionReceipt, getConnection } from "wagmi/actions";
import type { Hex } from "viem";
import { wagmiConfig, CHAIN } from "./wagmi";
import type { Tx } from "./types";

export type TxProgress = (step: { index: number; total: number; hash?: Hex }) => void;

async function ensureChain() {
  const { chainId } = getConnection(wagmiConfig);
  if (chainId !== CHAIN.id) await switchChain(wagmiConfig, { chainId: CHAIN.id });
}

/** Send transactions one by one, waiting for each to be mined (approve must land before pay). */
export async function sendSequential(txs: Tx[], onStep?: TxProgress): Promise<Hex[]> {
  await ensureChain();
  const hashes: Hex[] = [];
  for (const [index, t] of txs.entries()) {
    onStep?.({ index, total: txs.length });
    const hash = await sendTransaction(wagmiConfig, { to: t.to, data: t.data, value: BigInt(t.value || "0"), chainId: CHAIN.id });
    onStep?.({ index, total: txs.length, hash });
    const receipt = await waitForTransactionReceipt(wagmiConfig, { hash, chainId: CHAIN.id });
    if (receipt.status !== "success") throw new Error("Transaction reverted");
    hashes.push(hash);
  }
  return hashes;
}

/**
 * Smart wallets that support atomic batches get one prompt for approve + publish + pay,
 * sponsored when a paymaster is configured. Everything else falls back to sequential txs.
 */
export async function sendBatchOrSequential(calls: Tx[], transactions: Tx[], paymasterUrl: string | null, onStep?: TxProgress): Promise<Hex> {
  await ensureChain();
  let atomic = false;
  let sponsor = false;
  try {
    const caps = (await getCapabilities(wagmiConfig, { chainId: CHAIN.id })) as Record<string, { status?: string; supported?: boolean } | undefined>;
    const a = caps.atomic;
    atomic = a?.status === "supported" || a?.status === "ready" || (caps as { atomicBatch?: { supported?: boolean } }).atomicBatch?.supported === true;
    sponsor = Boolean(paymasterUrl) && (caps as { paymasterService?: { supported?: boolean } }).paymasterService?.supported === true;
  } catch {
    atomic = false;
  }
  if (!atomic) {
    const hashes = await sendSequential(transactions, onStep);
    return hashes[hashes.length - 1]!;
  }
  onStep?.({ index: 0, total: 1 });
  const { id } = await sendCalls(wagmiConfig, {
    chainId: CHAIN.id,
    calls: calls.map((c) => ({ to: c.to, data: c.data, value: BigInt(c.value || "0") })),
    capabilities: sponsor && paymasterUrl ? { paymasterService: { url: new URL(paymasterUrl, window.location.origin).toString() } } : undefined,
  });
  const status = await waitForCallsStatus(wagmiConfig, { id, timeout: 180_000 });
  const hash = status.receipts?.[status.receipts.length - 1]?.transactionHash;
  if (status.status !== "success" || !hash) throw new Error("Payment did not complete");
  onStep?.({ index: 0, total: 1, hash });
  return hash;
}

export function errorText(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string; name?: string };
  if (err?.name === "UserRejectedRequestError" || /reject|denied/i.test(err?.message ?? "")) return "You cancelled the request in your wallet.";
  return (err?.shortMessage ?? err?.message ?? "Something went wrong").split("\n")[0]!;
}
