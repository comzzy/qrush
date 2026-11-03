"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { isAddress, type Address } from "viem";
import { api } from "@/lib/api";
import { useOnchain } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { errorText, sendSequential } from "@/lib/tx";
import { shortAddress } from "@/lib/format";
import type { Tx } from "@/lib/types";
import { Notice, Skeleton, Spinner } from "@/components/ui";
import { SplitSticker, StampCardSticker } from "@/components/art/Stickers";

export default function PayoutsPage() {
  const onchain = useOnchain();
  if (onchain.isLoading) return <Skeleton className="h-64" />;
  if (!onchain.data?.registered) return <Notice>Register your shop onchain from the Overview tab first. Splits and loyalty live in the checkout contract.</Notice>;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Splits initial={onchain.data.splits} />
      <Loyalty initial={onchain.data.loyalty} />
    </div>
  );
}

type Row = { recipient: string; percent: string };

function useTx() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const run = async (fn: () => Promise<{ tx: Tx }>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const { tx } = await fn();
      await sendSequential([tx]);
      await qc.invalidateQueries({ queryKey: ["onchain"] });
      setMsg({ tone: "ok", text: ok });
    } catch (e) {
      setMsg({ tone: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  return { busy, msg, run };
}

function Splits({ initial }: { initial: { recipient: Address; bps: number }[] }) {
  const { me } = useSession();
  const [rows, setRows] = useState<Row[]>(() => initial.map((s) => ({ recipient: s.recipient, percent: String(s.bps / 100) })));
  const { busy, msg, run } = useTx();
  const sum = rows.reduce((s, r) => s + (Number(r.percent) || 0), 0);
  const valid = rows.length > 0 && rows.every((r) => isAddress(r.recipient) && Number(r.percent) > 0) && Math.abs(sum - 100) < 1e-9;

  const save = () => {
    const splits = rows.map((r) => ({ recipient: r.recipient, bps: Math.round(Number(r.percent) * 100) }));
    const onlyMe = splits.length === 1 && me && splits[0]!.recipient.toLowerCase() === me.address.toLowerCase();
    return run(() => api<{ tx: Tx }>("/seller/splits", { method: "PUT", json: { splits: onlyMe ? [] : splits } }), "Splits saved onchain.");
  };

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Payment splits</h2>
          <p className="mt-1 text-sm text-ink-soft">Each payment is divided automatically by the contract. Shares must add up to 100%.</p>
        </div>
        <SplitSticker size={56} className="shrink-0" />
      </div>
      <ul className="mt-4 space-y-2">
        <AnimatePresence initial={false}>
          {rows.map((r, i) => (
            <motion.li key={i} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-center gap-2">
              <input aria-label="Recipient address" className={`field !px-3 font-mono text-sm ${r.recipient && !isAddress(r.recipient) ? "!border-pink-deep" : ""}`} value={r.recipient} placeholder="0x…" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, recipient: e.target.value.trim() } : x)))} />
              <div className="relative">
                <input aria-label="Share percent" className="field !pr-7 !pl-3" inputMode="decimal" value={r.percent} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))} />
                <span className="absolute top-1/2 right-3 -translate-y-1/2 text-ink-soft">%</span>
              </div>
              <button type="button" aria-label="Remove recipient" className="btn btn-cream !px-3 !py-2" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="btn btn-cream !py-1.5 text-sm" disabled={rows.length >= 10} onClick={() => setRows([...rows, { recipient: "", percent: "" }])}>+ Add recipient</button>
        <span className={`text-sm font-semibold ${Math.abs(sum - 100) < 1e-9 ? "" : "text-pink-deep"}`}>Total {sum}%</span>
      </div>
      {me && rows.length === 1 && rows[0]!.recipient.toLowerCase() === me.address.toLowerCase() && <p className="mt-2 text-sm text-ink-soft">All payments go to you ({shortAddress(me.address)}).</p>}
      {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      <button type="button" className="btn btn-ink mt-4 w-full" disabled={!valid || busy} onClick={save}>{busy ? <><Spinner /> Confirm in your wallet…</> : "Save splits"}</button>
    </div>
  );
}

function Loyalty({ initial }: { initial: { threshold: number; discountBps: number } }) {
  const [threshold, setThreshold] = useState(String(initial.threshold || ""));
  const [percent, setPercent] = useState(String(initial.discountBps / 100 || ""));
  const { busy, msg, run } = useTx();
  const t = Number(threshold) || 0;
  const p = Number(percent) || 0;
  const valid = (t === 0 && p === 0) || (Number.isInteger(t) && t > 0 && p > 0 && p <= 50);
  return (
    <div className="card bg-pink-soft p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Loyalty stamps</h2>
          <p className="mt-1 text-sm text-ink-soft">Reward repeat buyers. The discount is applied automatically at checkout.</p>
        </div>
        <StampCardSticker size={64} className="shrink-0" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="loy-n">Every Nth purchase</label>
          <input id="loy-n" className="field" inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="5" />
        </div>
        <div>
          <label className="label" htmlFor="loy-p">Discount %</label>
          <input id="loy-p" className="field" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} placeholder="10" />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2" aria-hidden>
        {Array.from({ length: Math.min(Math.max(t, 1), 12) }).map((_, i) => (
          <motion.span key={`${t}-${i}`} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.04 }} className={`grid h-9 w-9 place-items-center rounded-full border-2 border-ink text-xs font-bold ${i === t - 1 ? "bg-sun" : "bg-white"}`}>
            {i === t - 1 ? `-${p || 0}%` : i + 1}
          </motion.span>
        ))}
      </div>
      <p className="mt-3 text-sm">{t > 0 && p > 0 ? `Purchase number ${t}, ${t * 2}, ${t * 3}… gets ${p}% off.` : "Loyalty is off. Set both fields to turn it on, or 0 and 0 to turn it off."}</p>
      {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      <button type="button" className="btn btn-ink mt-4 w-full" disabled={!valid || busy} onClick={() => run(() => api<{ tx: Tx }>("/seller/loyalty", { method: "PUT", json: { threshold: t, discountBps: Math.round(p * 100) } }), "Loyalty saved onchain.")}>
        {busy ? <><Spinner /> Confirm in your wallet…</> : "Save loyalty"}
      </button>
    </div>
  );
}
