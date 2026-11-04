"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useConnect, useConnection, useConnectors, useDisconnect } from "wagmi";
import { shortAddress } from "@/lib/format";
import { errorText } from "@/lib/tx";
import { relatedOriginsOk, setPasskeyMode } from "@/lib/passkey";
import { WalletSticker, PhoneScanSticker } from "./art/Stickers";

const PASSKEY_HOST = "qrushpay.vercel.app";

const MOBILE_WALLETS = [
  { name: "MetaMask", href: (u: string) => `https://metamask.app.link/dapp/${u.replace(/^https?:\/\//, "")}` },
  { name: "Trust Wallet", href: (u: string) => `https://link.trustwallet.com/open_url?coin_id=8453&url=${encodeURIComponent(u)}` },
];

/** Wallet chooser: passkey wallet, browser extension, then WalletConnect for phone wallets. */
export function ConnectWallet({ label = "Connect a wallet" }: { label?: string }) {
  const connectors = useConnectors();
  const { mutateAsync: connect } = useConnect();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const noop = () => () => {};
  const hasInjected = useSyncExternalStore(noop, () => Boolean((window as { ethereum?: unknown }).ethereum), () => true);
  const here = useSyncExternalStore(noop, () => window.location.href, () => "https://qrush.online/app");

  const [noRelated, setNoRelated] = useState(false);
  useEffect(() => {
    relatedOriginsOk().then((ok) => setNoRelated(ok === false));
  }, []);
  const vercelLink = here.replace(/^https?:\/\/[^/]+/, "https://qrushpay.vercel.app");

  const go = async (id: string, pm?: "create" | "login") => {
    if (pm) setPasskeyMode(pm);
    const connector = connectors.find((c) => c.uid === id);
    if (!connector) return;
    setError(null);
    if (connector.id === "injected" && !hasInjected) {
      setError("No browser wallet found. Install MetaMask or Rabby, or open this page inside your wallet app's browser (links below).");
      return;
    }
    setBusy(pm ? `${id}:${pm}` : id);
    try {
      await Promise.race([
        connect({ connector }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("The wallet didn't respond within 20 seconds. Please try again or pick another option.")), 20_000)),
      ]);
    } catch (e) {
      const msg = errorText(e);
      setError(pm && /security|rp ?id|relying party|not allowed/i.test(msg) && !here.includes(PASSKEY_HOST) ? `This browser could not open your passkey here. Open QRush on ${PASSKEY_HOST} instead: ${vercelLink}` : msg);
    } finally {
      setBusy(null);
    }
  };

  const describe = (c: (typeof connectors)[number]) => {
    if (c.id === "qrush.passkey") return { title: "Passkey wallet", body: "Create a smart wallet on this device with Face ID, fingerprint or screen lock. No app, no seed phrase.", Art: PhoneScanSticker };
    if (c.type === "walletConnect") return { title: "WalletConnect", body: "Scan a QR with Trust, MetaMask mobile, Rainbow or another phone wallet.", Art: PhoneScanSticker };
    if (c.type === "mock") return { title: "Test wallet", body: "Local test account.", Art: WalletSticker };
    return { title: c.name === "Injected" ? "Browser wallet" : c.name, body: "MetaMask, Rabby, Trust or any wallet extension in this browser.", Art: WalletSticker };
  };

  return (
    <div className="space-y-3" data-testid="connect-wallet">
      <p className="font-semibold">{label}</p>
      {noRelated && (
        <p className="rounded-xl bg-cream-deep px-3 py-2 text-sm" data-testid="related-origin-note">
          Your passkey wallet lives on {PASSKEY_HOST}, and this browser can&apos;t open it from here.{" "}
          <a className="font-semibold underline" href={vercelLink}>Open QRush on {PASSKEY_HOST}</a> to use it, or try Chrome, Edge or Safari.
        </p>
      )}
      {connectors.map((c) => {
        const d = describe(c);
        if (c.id === "qrush.passkey")
          return (
            <div key={c.uid} className="rounded-2xl border-2 border-ink bg-white p-3 shadow-[0_3px_0_0_var(--color-ink)]" data-testid="passkey-box">
              <div className="flex items-center gap-4">
                <d.Art size={48} className="shrink-0" />
                <span className="min-w-0">
                  <span className="block font-semibold">{d.title}</span>
                  <span className="block text-sm text-ink-soft">Face ID, fingerprint or screen lock. No app, no seed phrase.</span>
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button type="button" data-testid="passkey-login" disabled={busy !== null} onClick={() => go(c.uid, "login")} className="rounded-full border-2 border-ink bg-ink px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {busy === `${c.uid}:login` ? "Waiting…" : "Sign in with my passkey"}
                </button>
                <button type="button" data-testid="passkey-create" disabled={busy !== null} onClick={() => go(c.uid, "create")} className="rounded-full border-2 border-ink bg-white px-3 py-2 text-sm font-semibold disabled:opacity-60">
                  {busy === `${c.uid}:create` ? "Waiting…" : "Create a new wallet"}
                </button>
              </div>
              <p className="mt-2 text-xs text-ink-soft">Made a wallet before? Use Sign in. Create makes a different, empty wallet.</p>
            </div>
          );
        return (
          <motion.button
            key={c.uid}
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            disabled={busy === c.uid}
            onClick={() => go(c.uid)}
            className="flex w-full items-center gap-4 rounded-2xl border-2 border-ink bg-white p-3 text-left shadow-[0_3px_0_0_var(--color-ink)] disabled:opacity-60"
          >
            <d.Art size={48} className="shrink-0" />
            <span className="min-w-0">
              <span className="block font-semibold">{busy === c.uid ? "Waiting for wallet…" : d.title}</span>
              <span className="block text-sm text-ink-soft">{d.body}</span>
            </span>
          </motion.button>
        );
      })}
      {!hasInjected && (
        <p className="text-sm text-ink-soft">
          On a phone? Open QRush in{" "}
          {MOBILE_WALLETS.map((w, i) => (
            <span key={w.name}>
              {i > 0 && " or "}
              <a className="font-semibold underline" href={w.href(here)}>{w.name}</a>
            </span>
          ))}
          .
        </p>
      )}
      <AnimatePresence>
        {error && (
          <motion.p role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-xl bg-pink-soft px-3 py-2 text-sm">
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export function WalletChip() {
  const { address, isConnected } = useConnection();
  const { mutate: disconnect } = useDisconnect();
  const [copied, setCopied] = useState(false);
  if (!isConnected || !address) return null;
  const copy = async () => {
    await navigator.clipboard.writeText(address).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="relative inline-flex items-center gap-2 rounded-full border-2 border-ink bg-white py-1 pr-1 pl-3 text-sm font-medium">
      <span className="h-2 w-2 rounded-full bg-[#3cc48a]" aria-hidden />
      <button type="button" onClick={copy} title="Tap to copy your full address" aria-label={`Copy address ${address}`} className="inline-flex items-center gap-1 hover:underline" data-testid="wallet-address">
        {shortAddress(address)}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
      </button>
      <AnimatePresence>
        {copied && (
          <motion.span role="status" data-testid="copied-toast" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute top-full right-0 z-50 mt-2 rounded-full border-2 border-ink bg-ink px-3 py-1 text-xs font-semibold whitespace-nowrap text-white">
            Copied
          </motion.span>
        )}
      </AnimatePresence>
      <button type="button" className="rounded-full bg-cream-deep px-2.5 py-1 hover:bg-pink-soft" onClick={() => disconnect()}>
        Disconnect
      </button>
    </div>
  );
}
