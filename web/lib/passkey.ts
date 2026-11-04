"use client";

import { p256 } from "@noble/curves/p256";
import { USDC_ADDRESS } from "./guard";
import { createPublicClient, http, numberToHex, parseAbi, toHex, type Address, type Hex, hexToString, isHex } from "viem";
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

/**
 * Every QRush passkey belongs to qrushpay.vercel.app, where the first wallets were made. qrush.online uses the
 * same passkeys through WebAuthn Related Origin Requests (see /.well-known/webauthn on qrushpay.vercel.app).
 * Local dev and tests keep their own hostname.
 */
export const PASSKEY_RP = "qrushpay.vercel.app";
const RELATED = ["qrush.online", "www.qrush.online", PASSKEY_RP];
export const rpId = () => (RELATED.includes(window.location.hostname) ? PASSKEY_RP : window.location.hostname);

/** False when this browser cannot use a qrushpay.vercel.app passkey from another site (e.g. older Firefox). */
export async function relatedOriginsOk(): Promise<boolean | null> {
  if (window.location.hostname === rpId()) return true;
  const pkc = window.PublicKeyCredential as unknown as { getClientCapabilities?: () => Promise<Record<string, boolean>> } | undefined;
  if (!pkc?.getClientCapabilities) return null;
  const caps = await pkc.getClientCapabilities().catch(() => null);
  return caps ? Boolean(caps.relatedOrigins) : null;
}

/** Which button the user pressed: make a brand-new wallet, or open the one their passkey already owns. */
let mode: "create" | "login" | null = null;
export function setPasskeyMode(m: "create" | "login") {
  mode = m;
  account = null;
}

function load(): Stored | null {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "null");
  } catch {
    return null;
  }
}
const save = (c: Stored) => localStorage.setItem(STORE, JSON.stringify(c));

async function accountFor(cred: Stored) {
  const owner = toWebAuthnAccount({ credential: cred, rpId: rpId() });
  return toKernelSmartAccount({ client, owners: [owner], version: "0.3.1", entryPoint: { address: entryPoint07Address, version: "0.7" } });
}

/** Kernel address a public key controls. Same key, same address, every time. */
export async function addressFor(id: string, publicKey: Hex): Promise<Address> {
  return (await accountFor({ id, publicKey })).address;
}

const b64uToBuf = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/** Ask the device for an existing passkey and work out its public key from the signature (2 possible keys). */
async function assert(allow?: string): Promise<{ id: string; keys: Hex[] }> {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: rpId(),
      userVerification: "required",
      allowCredentials: allow ? [{ type: "public-key", id: b64uToBuf(allow) }] : [],
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("No passkey was picked.");
  const r = cred.response as AuthenticatorAssertionResponse;
  const cdHash = new Uint8Array(await crypto.subtle.digest("SHA-256", r.clientDataJSON));
  const auth = new Uint8Array(r.authenticatorData);
  const msg = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array([...auth, ...cdHash])));
  const sig = p256.Signature.fromDER(new Uint8Array(r.signature));
  const keys: Hex[] = [];
  for (const bit of [0, 1]) {
    try {
      keys.push(toHex(sig.addRecoveryBit(bit).recoverPublicKey(msg).toRawBytes(false).slice(1)));
    } catch {
      /* this bit does not give a valid point */
    }
  }
  return { id: cred.id, keys };
}

const ERC20_BAL = parseAbi(["function balanceOf(address) view returns (uint256)"]);
async function used(a: Address) {
  const [code, eth, usdc] = await Promise.all([
    client.getCode({ address: a }).catch(() => undefined),
    client.getBalance({ address: a }).catch(() => 0n),
    client.readContract({ address: USDC_ADDRESS, abi: ERC20_BAL, functionName: "balanceOf", args: [a] }).catch(() => 0n),
  ]);
  return Boolean(code && code !== "0x") || eth > 0n || usdc > 0n;
}

/** Sign in with an existing passkey. Never makes a new wallet. */
async function login(): Promise<Stored> {
  const first = await assert();
  const cached = load();
  if (cached && cached.id === first.id) return cached;
  let keys = first.keys;
  if (keys.length > 1) {
    // Pick the key whose wallet has been used on Base; if that does not settle it, one more signature does.
    const flags = await Promise.all(keys.map(async (k) => used(await addressFor(first.id, k))));
    const hits = keys.filter((_, i) => flags[i]);
    if (hits.length === 1) keys = hits;
    else {
      const second = await assert(first.id);
      keys = keys.filter((k) => second.keys.includes(k));
    }
  }
  if (keys.length !== 1) throw new Error("Could not read this passkey. Please try again.");
  const cred = { id: first.id, publicKey: keys[0]! };
  save(cred);
  return cred;
}

async function ensure(request: boolean): Promise<SmartAccount | null> {
  if (account) return account;
  let cred: Stored | null = null;
  if (request && mode === "create") {
    const c = await createWebAuthnCredential({ name: `QRush ${new Date().toISOString().slice(0, 10)}`, rp: { id: rpId(), name: "QRush" } });
    cred = { id: c.id, publicKey: c.publicKey };
    save(cred);
  } else if (request && mode === "login") cred = await login();
  else if (request) cred = load() ?? (await login());
  else cred = load();
  mode = null;
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
