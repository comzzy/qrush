"use client";

import { createPublicClient, http, numberToHex, type Address, type Hex, hexToString, isHex } from "viem";
import { base } from "viem/chains";
import { createBundlerClient, createWebAuthnCredential, entryPoint07Address, toWebAuthnAccount, type SmartAccount } from "viem/account-abstraction";
import { toKernelSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";

/**
 * Passkey smart wallet created on this domain: a WebAuthn credential owns a Kernel v3.1
 * account (ERC-4337, EntryPoint 0.7) on Base. No third-party wallet service is involved;
 * user operations go through Pimlico's public bundler and the account pays its own gas.
 */
const STORE = "qrush.passkey.v1";
const BUNDLER = process.env.NEXT_PUBLIC_BUNDLER_URL || "https://public.pimlico.io/v2/8453/rpc";
const client = createPublicClient({ chain: base, transport: http() });
const pimlico = createPimlicoClient({ transport: http(BUNDLER), entryPoint: { address: entryPoint07Address, version: "0.7" } });

type Stored = { id: string; publicKey: Hex };
let account: SmartAccount | null = null;

function load(): Stored | null {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "null");
  } catch {
    return null;
  }
}

async function accountFor(cred: Stored) {
  const owner = toWebAuthnAccount({ credential: cred, rpId: window.location.hostname });
  return toKernelSmartAccount({ client, owners: [owner], version: "0.3.1", entryPoint: { address: entryPoint07Address, version: "0.7" } });
}

async function ensure(create: boolean): Promise<SmartAccount | null> {
  if (account) return account;
  let cred = load();
  if (!cred && create) {
    const c = await createWebAuthnCredential({ name: `QRush ${new Date().toISOString().slice(0, 10)}`, rp: { id: window.location.hostname, name: "QRush" } });
    cred = { id: c.id, publicKey: c.publicKey };
    localStorage.setItem(STORE, JSON.stringify(cred));
  }
  if (!cred) return null;
  account = await accountFor(cred);
  return account;
}

const bundler = () =>
  createBundlerClient({
    account: account!,
    client,
    transport: http(BUNDLER),
    userOperation: { estimateFeesPerGas: async () => (await pimlico.getUserOperationGasPrice()).fast },
  });

type Call = { to: Address; data?: Hex; value?: Hex | bigint };
const toCalls = (calls: Call[]) => calls.map((c) => ({ to: c.to, data: c.data ?? "0x", value: c.value === undefined ? 0n : BigInt(c.value) }));

const listeners = new Map<string, Set<(...a: unknown[]) => void>>();

export const passkeyProvider = {
  isQrushPasskey: true,
  on(e: string, f: (...a: unknown[]) => void) {
    (listeners.get(e) ?? listeners.set(e, new Set()).get(e)!).add(f);
  },
  removeListener(e: string, f: (...a: unknown[]) => void) {
    listeners.get(e)?.delete(f);
  },
  async request({ method, params }: { method: string; params?: unknown[] }): Promise<unknown> {
    const p = (params ?? []) as unknown[];
    switch (method) {
      case "eth_requestAccounts":
        return [(await ensure(true))!.address];
      case "eth_accounts": {
        const a = await ensure(false);
        return a ? [a.address] : [];
      }
      case "eth_chainId":
        return numberToHex(base.id);
      case "wallet_switchEthereumChain":
      case "wallet_requestPermissions":
      case "wallet_revokePermissions":
        account = method === "wallet_revokePermissions" ? null : account;
        return null;
      case "personal_sign": {
        const msg = p[0] as Hex;
        return (await ensure(false))!.signMessage({ message: isHex(msg) ? hexToString(msg) : (msg as string) });
      }
      case "eth_signTypedData_v4": {
        const td = typeof p[1] === "string" ? JSON.parse(p[1] as string) : p[1];
        const { EIP712Domain: _d, ...types } = td.types;
        return (await ensure(false))!.signTypedData({ ...td, types });
      }
      case "wallet_getCapabilities":
        return { [numberToHex(base.id)]: { atomic: { status: "supported" } } };
      case "wallet_sendCalls": {
        await ensure(false);
        const req = p[0] as { calls: Call[] };
        const id = await bundler().sendUserOperation({ calls: toCalls(req.calls) });
        return { id };
      }
      case "wallet_getCallsStatus": {
        const id = p[0] as Hex;
        const r = await bundler().getUserOperationReceipt({ hash: id }).catch(() => null);
        if (!r) return { version: "2.0.0", id, chainId: numberToHex(base.id), atomic: true, status: 100 };
        const t = r.receipt;
        return {
          version: "2.0.0", id, chainId: numberToHex(base.id), atomic: true, status: r.success ? 200 : 500,
          receipts: [{ transactionHash: t.transactionHash, blockHash: t.blockHash, blockNumber: numberToHex(t.blockNumber), gasUsed: numberToHex(t.gasUsed), status: r.success ? "0x1" : "0x0", logs: [] }],
        };
      }
      case "eth_sendTransaction": {
        await ensure(false);
        const tx = p[0] as Call;
        const hash = await bundler().sendUserOperation({ calls: toCalls([tx]) });
        const r = await bundler().waitForUserOperationReceipt({ hash, timeout: 180_000 });
        return r.receipt.transactionHash;
      }
      default:
        return client.request({ method, params } as never);
    }
  },
};
void hexToString;
