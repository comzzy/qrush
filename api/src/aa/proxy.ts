import { isHex, type Address, type Hex } from "viem";
import { ENTRY_POINT_V07, isSponsorable } from "./policy.js";

type JsonRpcRequest = { jsonrpc: "2.0"; id: number | string | null; method: string; params?: unknown[] };

export const PAYMASTER_METHODS = new Set(["pm_getPaymasterStubData", "pm_getPaymasterData"]);
export const BUNDLER_METHODS = new Set([
  "eth_sendUserOperation",
  "eth_estimateUserOperationGas",
  "eth_getUserOperationByHash",
  "eth_getUserOperationReceipt",
  "eth_supportedEntryPoints",
  "eth_chainId",
  "pimlico_getUserOperationGasPrice",
  "pimlico_getUserOperationStatus",
]);

export function rpcError(id: JsonRpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

/**
 * ERC-7677 paymaster proxy: validates that the user operation only touches QRush checkout before
 * forwarding to the upstream paymaster, so the sponsorship key stays server side.
 */
export async function forwardPaymaster(
  req: JsonRpcRequest,
  opts: { upstream: string; checkout: Address; chainId: number; context?: unknown; fetch?: typeof fetch },
) {
  if (!PAYMASTER_METHODS.has(req.method)) return rpcError(req.id, -32601, `Method ${req.method} not supported`);
  const [userOp, entryPoint, chainIdHex] = (req.params ?? []) as [
    { sender?: string; callData?: Hex } | undefined,
    string | undefined,
    string | undefined,
    unknown,
  ];
  if (!userOp?.callData || !isHex(userOp.callData)) return rpcError(req.id, -32602, "userOp.callData required");
  if (entryPoint?.toLowerCase() !== ENTRY_POINT_V07.toLowerCase()) {
    return rpcError(req.id, -32602, "Only EntryPoint v0.7 is supported");
  }
  if (!chainIdHex || BigInt(chainIdHex) !== BigInt(opts.chainId)) return rpcError(req.id, -32602, "Wrong chain id");
  const verdict = isSponsorable(userOp.callData, opts.checkout);
  if (!verdict.ok) return rpcError(req.id, -32001, `Not sponsored: ${verdict.reason}`);

  const params = [userOp, entryPoint, chainIdHex, opts.context ?? (req.params ?? [])[3] ?? null];
  return forward({ ...req, params }, opts.upstream, opts.fetch);
}

export async function forwardBundler(req: JsonRpcRequest, opts: { upstream: string; fetch?: typeof fetch }) {
  if (!BUNDLER_METHODS.has(req.method)) return rpcError(req.id, -32601, `Method ${req.method} not supported`);
  return forward(req, opts.upstream, opts.fetch);
}

async function forward(req: JsonRpcRequest, upstream: string, doFetch: typeof fetch = fetch) {
  const res = await doFetch(upstream, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: req.id, method: req.method, params: req.params ?? [] }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return rpcError(req.id, -32603, `Upstream error ${res.status}`);
  return (await res.json()) as unknown;
}
