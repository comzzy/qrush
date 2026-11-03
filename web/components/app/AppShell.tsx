"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useConnection } from "wagmi";
import { useSession } from "@/lib/session";
import { ConnectWallet, WalletChip } from "@/components/Wallet";
import { Guy } from "@/components/art/Guy";
import { Sparkle } from "@/components/art/Sparkle";
import { Notice, Spinner } from "@/components/ui";

const TABS = [
  { href: "/app", label: "Overview" },
  { href: "/app/products", label: "Products" },
  { href: "/app/links", label: "Pay links" },
  { href: "/app/payouts", label: "Payouts" },
  { href: "/app/receipts", label: "Receipts" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isConnected, isReconnecting } = useConnection();
  const { me, loading, signIn, signingIn, error } = useSession();
  const path = usePathname();

  // Wallet reconnect can stall (locked extension, closed popup); cap the wait so the page always resolves.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 3000);
    return () => clearTimeout(t);
  }, []);

  if (!waited && (loading || isReconnecting)) {
    return (
      <div className="section grid min-h-[50vh] place-items-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!me) {
    return (
      <section className="section relative py-10 sm:py-16">
        <Sparkle className="absolute top-6 right-6" size={30} />
        <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-2">
          <div className="mx-auto w-full min-w-0 max-w-md md:mx-0">
            <span className="pill border-2 border-ink">Seller dashboard</span>
            <h1 className="h-display mt-4 text-4xl sm:text-6xl">Open your shop</h1>
            <p className="mt-4 max-w-md text-lg text-ink-soft">
              Your wallet is your account. Connect it, sign a message to prove it is yours (free, no transaction), and start making pay links.
            </p>
            <div className="card mx-auto mt-8 w-full max-w-md p-4 sm:p-5">
              {!isConnected ? (
                <ConnectWallet label="1. Connect the wallet that should receive payments" />
              ) : (
                <div className="space-y-4">
                  <WalletChip />
                  <p className="font-semibold">2. Sign in</p>
                  <p className="text-sm text-ink-soft">Your wallet will ask you to sign a short message. It costs nothing.</p>
                  <button type="button" className="btn btn-ink w-full" onClick={() => void signIn()} disabled={signingIn}>
                    {signingIn ? <><Spinner /> Waiting for signature…</> : "Sign in with wallet"}
                  </button>
                  {error && <Notice tone="error">{error}</Notice>}
                </div>
              )}
            </div>
          </div>
          <div className="mx-auto mb-2 w-full max-w-md rounded-[2rem] md:max-w-sm border-[3px] border-ink bg-pink p-6" style={{ boxShadow: "0 8px 0 0 var(--color-ink)" }}>
            <Guy className="mx-auto h-auto w-full max-w-[16rem]" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section py-6 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">Dashboard</h1>
        <WalletChip />
      </div>
      <nav aria-label="Dashboard" className="-mx-4 mt-5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-2">
          {TABS.map((t) => {
            const on = t.href === "/app" ? path === "/app" : path.startsWith(t.href);
            return (
              <li key={t.href}>
                <Link href={t.href} aria-current={on ? "page" : undefined} className="relative block rounded-full border-2 border-ink px-4 py-2 font-semibold">
                  {on && <motion.span layoutId="app-tab" className="absolute inset-0 -z-10 rounded-full bg-sun" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
                  <span className={on ? "" : "opacity-80"}>{t.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="mt-6">{children}</div>
    </section>
  );
}
