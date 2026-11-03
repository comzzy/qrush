"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { signTypedData } from "wagmi/actions";
import { api } from "@/lib/api";
import { useInvoices, useOnchain, useProducts } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { reviveTypedData, type TypedDataJson } from "@/lib/typed";
import { errorText } from "@/lib/tx";
import { wagmiConfig } from "@/lib/wagmi";
import { usd, timeAgo } from "@/lib/format";
import type { Invoice, Shop } from "@/lib/types";
import { NeedShop } from "@/components/app/NeedShop";
import { QrPoster } from "@/components/app/QrPoster";
import { CopyButton, Modal, Notice, Skeleton, Spinner } from "@/components/ui";

export default function LinksPage() {
  return <NeedShop>{(shop) => <Links shop={shop} />}</NeedShop>;
}

const STATUS: Record<Invoice["status"], [string, string]> = {
  awaiting_signature: ["Needs signature", "bg-sun"],
  signed: ["Ready", "bg-mint"],
  open: ["Ready", "bg-mint"],
  completed: ["Paid", "bg-sky"],
  cancelled: ["Cancelled", "bg-pink-soft"],
};

function Links({ shop }: { shop: Shop }) {
  const { data, isLoading } = useInvoices(shop.id);
  const onchain = useOnchain();
  const { me } = useSession();
  const [poster, setPoster] = useState<Invoice | null>(null);

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <div className="space-y-4">
        {onchain.data && !onchain.data.registered && (
          <Notice>
            Register your shop on the <Link className="underline" href="/app">overview</Link> before buyers can pay these links.
          </Notice>
        )}
        <CreateLink shop={shop} onCreated={setPoster} />
        {me?.basename && (
          <div className="card bg-blush p-4 text-sm">
            Buyers see <b>{me.basename}</b> on your checkout instead of a long address.
          </div>
        )}
      </div>
      <div className="card min-w-0 p-5 sm:p-6">
        <h2 className="text-xl font-bold">Your pay links</h2>
        {isLoading ? (
          <Skeleton className="mt-4 h-40" />
        ) : data?.length ? (
          <ul className="mt-4 space-y-3">
            {data.map((inv, i) => (
              <motion.li key={inv.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }} className="rounded-2xl border-2 border-ink bg-cream p-3 sm:p-4" data-testid="pay-link">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xl font-bold">{usd(inv.amount)}</span>
                  <span className={`pill border-2 border-ink !py-0.5 ${STATUS[inv.status][1]}`}>{STATUS[inv.status][0]}</span>
                  <span className="pill !bg-white !py-0.5">{inv.maxUses === 0 ? `Reusable · ${inv.uses} paid` : inv.maxUses === 1 ? "One payment" : `${inv.uses}/${inv.maxUses} paid`}</span>
                  <span className="ml-auto text-sm text-ink-soft">{timeAgo(inv.createdAt)}</span>
                </div>
                {(inv.memo || inv.items.length > 0) && (
                  <p className="mt-1 truncate text-sm text-ink-soft">{inv.items.length ? inv.items.map((x) => `${x.quantity}× ${x.name}`).join(", ") : inv.memo}</p>
                )}
                {inv.status !== "awaiting_signature" && inv.status !== "cancelled" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="btn btn-sun !px-3 !py-1.5 text-sm" onClick={() => setPoster(inv)}>QR poster</button>
                    <CopyButton value={inv.payUrl} label="Copy link" />
                    <Link href={`/pay/${inv.invoiceKey}`} className="btn btn-cream !px-3 !py-1.5 text-sm" target="_blank">Open</Link>
                  </div>
                )}
                {inv.status === "awaiting_signature" && <SignButton invoice={inv} shop={shop} />}
              </motion.li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-ink-soft">No links yet. Create one on the left.</p>
        )}
      </div>
      <Modal open={Boolean(poster)} onClose={() => setPoster(null)} title="Your QR poster">
        {poster && <QrPoster invoice={poster} shop={shop} />}
      </Modal>
    </div>
  );
}

async function signInvoice(id: string, typedData: TypedDataJson) {
  const td = reviveTypedData(typedData);
  const signature = await signTypedData(wagmiConfig, td as Parameters<typeof signTypedData>[1]);
  return api<Invoice>(`/invoices/${id}/signature`, { json: { signature } });
}

function SignButton({ invoice, shop }: { invoice: Invoice; shop: Shop }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The typed data is deterministic for a stored invoice, so re-fetching it is not needed:
  // create returns it once; for older drafts we cancel and recreate.
  const cancel = async () => {
    setBusy(true);
    try {
      await api(`/invoices/${invoice.id}/cancel`, { method: "POST" });
      await qc.invalidateQueries({ queryKey: ["invoices", shop.id] });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-ink-soft">This draft was never signed.</span>
      <button type="button" className="btn btn-cream !px-3 !py-1 text-sm" onClick={cancel} disabled={busy}>Discard</button>
      {error && <span className="text-pink-deep">{error}</span>}
    </div>
  );
}

type Line = { productId: string; quantity: number };

function CreateLink({ shop, onCreated }: { shop: Shop; onCreated: (i: Invoice) => void }) {
  const qc = useQueryClient();
  const products = useProducts(shop.id);
  const [mode, setMode] = useState<"amount" | "products">("amount");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [reusable, setReusable] = useState(true);
  const [lines, setLines] = useState<Line[]>([]);
  const [step, setStep] = useState<null | "create" | "sign">(null);
  const [error, setError] = useState<string | null>(null);
  const active = (products.data ?? []).filter((p) => p.active);
  const total = lines.reduce((s, l) => s + Number(active.find((p) => p.id === l.productId)?.price ?? 0) * l.quantity, 0);

  const setQty = (productId: string, quantity: number) =>
    setLines((ls) => (quantity <= 0 ? ls.filter((l) => l.productId !== productId) : ls.some((l) => l.productId === productId) ? ls.map((l) => (l.productId === productId ? { ...l, quantity } : l)) : [...ls, { productId, quantity }]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStep("create");
    try {
      const res = await api<{ invoice: Invoice; typedData: TypedDataJson }>("/invoices", {
        json: {
          shopId: shop.id,
          ...(mode === "amount" ? { amount } : { items: lines }),
          memo: memo.trim() || undefined,
          maxUses: reusable ? 0 : 1,
        },
      });
      setStep("sign");
      try {
        const signed = await signInvoice(res.invoice.id, res.typedData);
        onCreated(signed);
      } catch (err) {
        await api(`/invoices/${res.invoice.id}/cancel`, { method: "POST" }).catch(() => undefined);
        throw err;
      }
      setAmount("");
      setMemo("");
      setLines([]);
      await qc.invalidateQueries({ queryKey: ["invoices", shop.id] });
    } catch (err) {
      setError(errorText(err));
      await qc.invalidateQueries({ queryKey: ["invoices", shop.id] });
    } finally {
      setStep(null);
    }
  };

  return (
    <form onSubmit={submit} className="card space-y-4 p-5">
      <h2 className="text-xl font-bold">New pay link</h2>
      <div className="grid grid-cols-2 gap-1 rounded-full border-2 border-ink bg-cream p-1" role="tablist">
        {(["amount", "products"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className="relative rounded-full py-1.5 font-semibold">
            {mode === m && <motion.span layoutId="link-mode" className="absolute inset-0 -z-0 rounded-full bg-sun" />}
            <span className="relative">{m === "amount" ? "Fixed amount" : "From products"}</span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {mode === "amount" ? (
          <motion.div key="a" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
            <label className="label" htmlFor="l-amount">Amount (USDC)</label>
            <input id="l-amount" className="field text-2xl font-bold" required inputMode="decimal" pattern="^\d+(\.\d{1,6})?$" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10.00" />
          </motion.div>
        ) : (
          <motion.div key="p" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-2">
            {active.length === 0 && <p className="text-sm text-ink-soft">Add products first on the <Link className="underline" href="/app/products">Products</Link> tab.</p>}
            {active.map((p) => {
              const q = lines.find((l) => l.productId === p.id)?.quantity ?? 0;
              return (
                <div key={p.id} className="flex items-center gap-2 rounded-xl bg-cream p-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                  <span className="text-sm">{usd(p.price)}</span>
                  <button type="button" className="h-8 w-8 rounded-full border-2 border-ink bg-white font-bold" onClick={() => setQty(p.id, q - 1)} aria-label={`Fewer ${p.name}`}>−</button>
                  <span className="w-5 text-center font-bold">{q}</span>
                  <button type="button" className="h-8 w-8 rounded-full border-2 border-ink bg-sun font-bold" onClick={() => setQty(p.id, q + 1)} aria-label={`More ${p.name}`}>+</button>
                </div>
              );
            })}
            {lines.length > 0 && <p className="text-right font-bold">Total {usd(total)}</p>}
          </motion.div>
        )}
      </AnimatePresence>
      <div>
        <label className="label" htmlFor="l-memo">Note for the buyer (optional)</label>
        <input id="l-memo" className="field" maxLength={500} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Table 4" />
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-cream p-3">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-ink" checked={reusable} onChange={(e) => setReusable(e.target.checked)} />
        <span className="text-sm"><b>Reusable QR</b><br />Many people can pay it, e.g. a counter sign. Untick for a one-off bill.</span>
      </label>
      {error && <Notice tone="error">{error}</Notice>}
      <button type="submit" className="btn btn-ink w-full" disabled={Boolean(step) || (mode === "products" && !lines.length)} data-testid="create-link">
        {step === "create" ? <><Spinner /> Creating…</> : step === "sign" ? <><Spinner /> Sign in your wallet…</> : "Create and sign"}
      </button>
      <p className="text-xs text-ink-soft">Signing is free. It proves the link came from you so nobody can change the amount.</p>
    </form>
  );
}
