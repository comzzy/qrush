import { qrushCheckoutAbi } from "../contracts/artifact.js";
import { decodeFunctionData, erc20Abi, isAddressEqual, type Address, type Hex } from "viem";
import { entryPoint07Address } from "viem/account-abstraction";

export const ENTRY_POINT_V07 = entryPoint07Address;

/** execute / executeBatch ABIs of Coinbase Smart Wallet and the eth-infinitism SimpleAccount (used by permissionless). */
const accountAbi = [
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      { name: "target", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "executeBatch",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "executeBatch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "dest", type: "address[]" },
      { name: "value", type: "uint256[]" },
      { name: "func", type: "bytes[]" },
    ],
    outputs: [],
  },
] as const;

export type Call = { to: Address; value: bigint; data: Hex };

export function decodeAccountCalls(callData: Hex): Call[] {
  const decoded = decodeFunctionData({ abi: accountAbi, data: callData });
  if (decoded.functionName === "execute") {
    const [to, value, data] = decoded.args;
    return [{ to, value, data }];
  }
  if (decoded.args.length === 1) {
    return decoded.args[0].map((c) => ({ to: c.target, value: c.value, data: c.data }));
  }
  const [dest, values, funcs] = decoded.args;
  if (dest.length !== funcs.length || (values.length !== 0 && values.length !== dest.length)) {
    throw new Error("Malformed executeBatch");
  }
  return dest.map((to, i) => ({ to, value: values[i] ?? 0n, data: funcs[i]! }));
}

/**
 * Sponsorship policy: every call in the user operation must either target the checkout contract,
 * with a buyer-facing payment function, or be an ERC20 approve whose spender is the checkout contract.
 */
export function isSponsorable(callData: Hex, checkout: Address): { ok: true } | { ok: false; reason: string } {
  let calls: Call[];
  try {
    calls = decodeAccountCalls(callData);
  } catch {
    return { ok: false, reason: "Unsupported smart account callData" };
  }
  if (calls.length === 0) return { ok: false, reason: "Empty call batch" };
  for (const call of calls) {
    if (isAddressEqual(call.to, checkout)) {
      if (isSponsoredCheckoutCall(call.data)) continue;
      return { ok: false, reason: "Only checkout payment calls are sponsored" };
    }
    try {
      const fn = decodeFunctionData({ abi: erc20Abi, data: call.data });
      if (fn.functionName === "approve" && isAddressEqual(fn.args[0], checkout) && call.value === 0n) continue;
    } catch {
      return { ok: false, reason: `Call to ${call.to} is not a checkout or approve call` };
    }
    return { ok: false, reason: `Call to ${call.to} is not allowed for sponsorship` };
  }
  return { ok: true };
}

const SPONSORED_CHECKOUT_FUNCTIONS = new Set(["payWithUSDC", "payWithToken", "payWithETH", "publishInvoice", "multicall"]);

function isSponsoredCheckoutCall(data: Hex): boolean {
  try {
    const fn = decodeFunctionData({ abi: qrushCheckoutAbi, data });
    if (!SPONSORED_CHECKOUT_FUNCTIONS.has(fn.functionName)) return false;
    if (fn.functionName === "multicall") {
      const inner = fn.args[0] as readonly Hex[];
      return inner.length > 0 && inner.every((d) => {
        try {
          const f = decodeFunctionData({ abi: qrushCheckoutAbi, data: d }).functionName;
          return f !== "multicall" && SPONSORED_CHECKOUT_FUNCTIONS.has(f);
        } catch {
          return false;
        }
      });
    }
    return true;
  } catch {
    return false;
  }
}
