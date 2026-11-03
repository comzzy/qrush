import { decodeFunctionData, erc20Abi, getAddress, isAddress, isAddressEqual, type Address } from "viem";
import type { Tx } from "./types";

/** The live QRush checkout on Base. A build can point at another deployment (tests use a fork) with NEXT_PUBLIC_CHECKOUT_ADDRESS. */
export const CHECKOUT_ADDRESS: Address = getAddress(
  process.env.NEXT_PUBLIC_CHECKOUT_ADDRESS || "0x6E41C4C993f0C2967eB9F8a3B27E9AD1E0dDb12e",
);
export const USDC_ADDRESS: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
/** Hosts that serve real QRush pay links. */
export const PAY_HOSTS = ["qrushpay.vercel.app"];

/**
 * Checks every call the server asked the wallet to send before the wallet sees it.
 * Calls may only go to the QRush checkout, or be an ERC20 approve whose spender is the checkout.
 * Anything else means the API reply was altered on the way, so we refuse to send it.
 */
export function assertSafeCalls(calls: Tx[], checkout: Address = CHECKOUT_ADDRESS): void {
  if (calls.length === 0) throw new Error("Nothing to pay");
  for (const c of calls) {
    if (!isAddress(c.to)) throw new Error("Blocked a payment step with a bad address");
    if (isAddressEqual(c.to, checkout)) continue;
    let ok = false;
    try {
      const d = decodeFunctionData({ abi: erc20Abi, data: c.data });
      ok = d.functionName === "approve" && isAddressEqual(d.args[0] as Address, checkout) && BigInt(c.value || "0") === 0n;
    } catch {
      ok = false;
    }
    if (!ok) throw new Error("Blocked a payment step that does not go to the QRush checkout contract");
  }
}
