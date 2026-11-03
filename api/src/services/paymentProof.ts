import { isAddressEqual, parseEventLogs, type Address, type Hex } from "viem";
import type { Deps } from "../context.js";
import { qrushCheckoutAbi } from "../contracts/artifact.js";

export type VerifiedPayment = {
  txHash: Hex;
  receiptId: number;
  buyer: Address;
  seller: Address;
  netAmount: bigint;
  blockNumber: bigint;
  timestamp: number;
};
export type ProofResult = { status: "ok"; payment: VerifiedPayment } | { status: "pending" } | { status: "invalid" };

export const isTxHash = (v: unknown): v is Hex => typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);

/**
 * Reads the transaction receipt from Base and checks that it succeeded and that the QRush
 * checkout contract emitted PaymentReceived for this invoice. Nothing from the client is trusted
 * beyond the hash itself. `pending` means the tx is not mined yet.
 */
export async function checkPayment(deps: Deps, txHash: Hex, invoiceKey: Hex): Promise<ProofResult> {
  let receipt;
  try {
    receipt = await deps.client.getTransactionReceipt({ hash: txHash });
  } catch {
    return { status: "pending" };
  }
  if (receipt.status !== "success") return { status: "invalid" };
  const ours = receipt.logs.filter((l) => isAddressEqual(l.address, deps.config.CHECKOUT_ADDRESS));
  const events = parseEventLogs({ abi: qrushCheckoutAbi, logs: ours, eventName: "PaymentReceived", strict: true });
  const hit = events.find((e) => e.args.invoiceId.toLowerCase() === invoiceKey.toLowerCase());
  if (!hit) return { status: "invalid" };
  const block = await deps.client.getBlock({ blockNumber: receipt.blockNumber });
  const payment = {
    txHash: receipt.transactionHash,
    receiptId: Number(hit.args.receiptId),
    buyer: hit.args.buyer,
    seller: hit.args.seller,
    netAmount: hit.args.netAmount,
    blockNumber: receipt.blockNumber,
    timestamp: Number(block.timestamp),
  };
  return { status: "ok", payment };
}

export async function verifyPayment(deps: Deps, txHash: Hex, invoiceKey: Hex): Promise<VerifiedPayment | null> {
  const r = await checkPayment(deps, txHash, invoiceKey);
  return r.status === "ok" ? r.payment : null;
}

export const unlockMessage = (txHash: Hex) => `Unlock my QRush download\nPayment: ${txHash.toLowerCase()}`;
