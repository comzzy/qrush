"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvoices, useMyReceipts, useOnchain, useProducts, useShop } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { errorText, sendSequential } from "@/lib/tx";
import type { Shop, Tx } from "@/lib/types";
import { usd, timeAgo } from "@/lib/format";
import { CopyButton, Notice, Skeleton, Spinner } from "@/components/ui";
import { QRCodeSVG } from "qrcode.react";
import { useBalance, useConnection } from "wagmi";
import { base } from "wagmi/chains";
import { formatEther } from "viem";
import { Counter } from "@/components/Reveal";

export default function Overview() {
  const { shop, isLoading } = useShop();
  if (isLoading) return <Skeleton className="h-64" />;
  if (!shop) return <CreateShop />;
  return <ShopOverview shop={shop} />;
}

function CreateShop() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", description: "", city: "", country: "" });
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => setCoords({ latitude: +p.coords.latitude.toFixed(4), longitude: +p.coords.longitude.toFixed(4) }),
      () => setError("Location permission was denied. You can skip this."),
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api<Shop>("/shops", {
        json: {
          name: form.name.trim(),
          description: form.description.trim() || null,
          city: form.city.trim() || null,
          country: form.country.trim().toUpperCase() || null,
          ...(coords ?? {}),
        },
      });
      await qc.invalidateQueries({ queryKey: ["shops"] });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <motion.form onSubmit={submit} className="card max-w-2xl space-y-4 p-5 sm:p-7" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <h2 className="text-2xl font-bold">Name your shop</h2>
      <p className="text-ink-soft">This is what buyers see on the checkout and their receipt.</p>
      <div>
        <label className="label" htmlFor="shop-name">Shop name</label>
        <input id="shop-name" className="field" required maxLength={120} value={form.name} onChange={set("name")} placeholder="Ada's Coffee Corner" />
      </div>
      <div>
        <label className="label" htmlFor="shop-desc">Short description (optional)</label>
        <textarea id="shop-desc" className="field min-h-20" maxLength={2000} value={form.description} onChange={set("description")} placeholder="Coffee, pastries and smoothies" />
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <div>
          <label className="label" htmlFor="shop-city">City (optional)</label>
          <input id="shop-city" className="field" value={form.city} onChange={set("city")} placeholder="Lagos" />
        </div>
        <div>
          <label className="label" htmlFor="shop-country">Country code</label>
          <input id="shop-country" className="field uppercase" maxLength={2} minLength={2} value={form.country} onChange={set("country")} placeholder="NG" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-cream" onClick={locate}>
          {coords ? "Location added ✓" : "Add my location to the live map"}
        </button>
        {coords && <span className="text-sm text-ink-soft">{coords.latitude}, {coords.longitude}</span>}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <button type="submit" className="btn btn-ink" disabled={busy || !form.name.trim()}>
        {busy ? <><Spinner /> Creating…</> : "Create shop"}
      </button>
    </motion.form>
  );
}

function RegisterOnchain({ shop }: { shop: Shop }) {
  const qc = useQueryClient();
  const { refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lowFunds, setLowFunds] = useState(false);
  const { address } = useConnection();
  const balance = useBalance({ address, chainId: base.id, query: { enabled: Boolean(address), refetchInterval: 10_000 } });
  const empty = balance.data !== undefined && balance.data.value < 2_000_000_000_000n; // under ~0.000002 ETH
  const register = async () => {
    setBusy(true);
    setError(null);
    try {
      const { tx } = await api<{ tx: Tx }>("/seller/onchain/register", { json: { name: shop.name, splits: [] } });
      await sendSequential([tx]);
      await Promise.all([qc.invalidateQueries({ queryKey: ["onchain"] }), refresh()]);
    } catch (e) {
      const msg = errorText(e);
      if (/insufficient funds|does not have sufficient funds|exceeds balance|AA21/i.test(msg)) {
        setLowFunds(true);
        setError("Your wallet needs a little ETH on Base to pay the network fee. Fund it below, then tap Register again.");
      } else setError(msg);
    } finally {
      setBusy(false);
    }
  };
  const showFund = Boolean(address) && (lowFunds || empty);
  return (
    <motion.div className="card bg-sun p-5 sm:p-6" initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
      <h2 className="text-xl font-bold">One last step: register on Base</h2>
      <p className="mt-2 max-w-xl">
        This records your shop in the QRush checkout contract so it can receive payments. It is a single transaction and costs a fraction of a cent in gas.
      </p>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      {showFund && address && (
        <div className="mt-4 rounded-2xl border-2 border-ink bg-white p-4" data-testid="fund-wallet">
          <h3 className="text-lg font-bold">Fund your wallet</h3>
          <p className="mt-1 text-sm">Send a little ETH on Base (about $0.20) to this address. Use the Base network only.</p>
          <div className="mt-3 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="shrink-0 rounded-xl border-2 border-ink bg-white p-2"><QRCodeSVG value={`ethereum:${address}@8453`} size={132} /></div>
            <div className="w-full min-w-0 space-y-2">
              <p className="font-mono text-sm break-all" data-testid="fund-address">{address}</p>
              <div className="flex flex-wrap gap-2">
                <CopyButton value={address} label="Copy address" />
                <a className="btn btn-cream !px-3 !py-1.5 text-sm" href={`https://basescan.org/address/${address}`} target="_blank" rel="noreferrer">View on Basescan</a>
              </div>
              {balance.data && <p className="text-xs text-ink-soft">Balance: {Number(formatEther(balance.data.value)).toFixed(6)} ETH</p>}
            </div>
          </div>
        </div>
      )}
      <button type="button" className="btn btn-ink mt-4" onClick={register} disabled={busy} data-testid="register-onchain">
        {busy ? <><Spinner /> Confirm in your wallet…</> : "Register shop onchain"}
      </button>
    </motion.div>
  );
}

function ShopOverview({ shop }: { shop: Shop }) {
  const onchain = useOnchain();
  const products = useProducts(shop.id);
  const invoices = useInvoices(shop.id);
  const receipts = useMyReceipts();
  const total = (receipts.data ?? []).reduce((s, r) => s + Number(r.total), 0);

  const stats = [
    { label: "Payments", value: receipts.data?.length ?? 0, href: "/app/receipts" },
    { label: "USDC received", value: total, decimals: 2, href: "/app/receipts" },
    { label: "Products", value: products.data?.length ?? 0, href: "/app/products" },
    { label: "Pay links", value: invoices.data?.length ?? 0, href: "/app/links" },
  ];

  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <div className="min-w-0">
          <p className="text-sm text-ink-soft">Your shop</p>
          <h2 className="truncate text-2xl font-bold sm:text-3xl" data-testid="shop-name">{shop.name}</h2>
          {(shop.city || shop.country) && <p className="text-ink-soft">{[shop.city, shop.country].filter(Boolean).join(", ")}</p>}
        </div>
        {onchain.data?.registered ? (
          <span className="pill border-2 border-ink bg-mint" data-testid="registered">Registered on Base ✓</span>
        ) : onchain.isLoading ? (
          <Spinner />
        ) : null}
      </div>

      {onchain.data && !onchain.data.registered && <RegisterOnchain shop={shop} />}
      {onchain.isError && <Notice tone="error">Could not read your onchain status. Refresh to try again.</Notice>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Link href={s.href} className="card block p-4 transition-transform hover:-translate-y-1 sm:p-5">
              <p className="text-3xl font-bold sm:text-4xl"><Counter to={s.value} decimals={s.decimals ?? 0} /></p>
              <p className="text-sm text-ink-soft">{s.label}</p>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-bold">Latest payments</h3>
            <Link href="/app/receipts" className="text-sm font-semibold underline underline-offset-4">All</Link>
          </div>
          {receipts.data?.length ? (
            <ul className="mt-4 divide-y-2 divide-ink/10">
              {receipts.data.slice(0, 5).map((r) => (
                <li key={r.receiptId} className="flex items-center justify-between gap-3 py-3">
                  <Link href={`/receipt/${r.receiptId}`} className="min-w-0 truncate font-medium hover:underline">Receipt #{r.receiptId}</Link>
                  <span className="shrink-0 text-sm text-ink-soft">{timeAgo(r.paidAt)}</span>
                  <span className="shrink-0 font-bold">{usd(r.total)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-ink-soft">No payments yet. Create a pay link and share the QR code.</p>
          )}
        </div>
        <div className="card bg-pink-soft p-5 sm:p-6">
          <h3 className="text-xl font-bold">Next steps</h3>
          <ol className="mt-3 space-y-3">
            {[
              ["/app/products", "Add products", "Type them in or upload a photo of your menu."],
              ["/app/links", "Create a pay link", "Get a QR code poster to print or show on screen."],
              ["/app/payouts", "Set splits and loyalty", "Share sales with partners and reward regulars."],
            ].map(([href, t, b], i) => (
              <li key={href}>
                <Link href={href} className="flex gap-3 rounded-2xl bg-white/70 p-3 hover:bg-white">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-ink bg-white font-bold">{i + 1}</span>
                  <span className="min-w-0"><span className="block font-semibold">{t}</span><span className="block text-sm text-ink-soft">{b}</span></span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
