"use client";

import Link from "next/link";
import { use } from "react";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BASESCAN, shortAddress, usd } from "@/lib/format";
import type { Receipt } from "@/lib/types";
import { Skeleton } from "@/components/ui";
import { Sparkle } from "@/components/art/Sparkle";
import { CopyButton } from "@/components/ui";

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, error } = useQuery({ queryKey: ["receipt", id], queryFn: () => api<Receipt>(`/receipts/${id}`, { auth: false }), retry: 1 });

  return (
    <div className="section py-10 md:py-16">
      <div className="relative mx-auto max-w-md">
        <Sparkle className="absolute -top-4 -left-3" size={26} />
        <Sparkle className="absolute top-10 -right-4" size={18} delay={0.5} />
        {isLoading ? (
          <Skeleton className="h-[30rem]" />
        ) : error || !data ? (
          <div className="card p-6"><h1 className="text-2xl font-bold">Receipt not found</h1><p className="mt-2 text-ink-soft">If you just paid, give it a few seconds and refresh.</p></div>
        ) : (
          <motion.article initial={{ y: -30, opacity: 0, rotate: -2 }} animate={{ y: 0, opacity: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 160, damping: 16 }} className="card receipt-edge bg-white p-6 font-medium" data-testid="receipt">
            <div className="text-center">
              <p className="text-sm text-ink-soft">Receipt #{data.receiptId}</p>
              <h1 className="mt-1 text-2xl font-bold">{data.shop?.name ?? shortAddress(data.seller)}</h1>
              <p className="text-sm text-ink-soft">{new Date(data.paidAt).toLocaleString()}</p>
            </div>
            <hr className="my-4 border-t-2 border-dashed border-ink/30" />
            {data.items.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {data.items.map((it, i) => <li key={i} className="flex justify-between gap-3"><span>{it.quantity}× {it.name}</span><span>{usd(Number(it.unitPrice) * it.quantity)}</span></li>)}
              </ul>
            ) : data.memo ? <p className="text-sm">{data.memo}</p> : null}
            <dl className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{usd(data.gross)}</dd></div>
              {Number(data.discount) > 0 && <div className="flex justify-between text-pink-deep"><dt>Loyalty discount</dt><dd>−{usd(data.discount)}</dd></div>}
              <div className="flex justify-between border-t-2 border-ink pt-2 text-lg font-bold"><dt>Total</dt><dd data-testid="receipt-total">{usd(data.total)}</dd></div>
              <div className="flex justify-between text-ink-soft"><dt>Paid with</dt><dd>{data.paidWith === "ETH" ? "ETH" : data.paidWith.toLowerCase() === "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" ? "USDC" : shortAddress(data.paidWith)}</dd></div>
              <div className="flex justify-between text-ink-soft"><dt>Purchase at this shop</dt><dd>#{data.purchaseNumber}</dd></div>
              <div className="flex justify-between text-ink-soft"><dt>Buyer</dt><dd className="font-mono">{shortAddress(data.buyer)}</dd></div>
            </dl>
            {data.payouts.length > 1 && (
              <div className="mt-4 rounded-xl bg-cream p-3 text-sm">
                <p className="font-semibold">Split between</p>
                {data.payouts.map((p) => <p key={p.recipient} className="flex justify-between font-mono"><span>{shortAddress(p.recipient)}</span><span className="font-sans">{usd(p.amount)}</span></p>)}
              </div>
            )}
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <a href={`${BASESCAN}/tx/${data.txHash}`} target="_blank" rel="noreferrer" className="btn btn-sun !py-1.5 text-sm">Verify on Basescan</a>
              <CopyButton value={typeof window !== "undefined" ? window.location.href : ""} label="Copy link" />
              <button type="button" className="btn btn-cream !py-1.5 text-sm" onClick={() => window.print()}>Print</button>
            </div>
          </motion.article>
        )}
        <p className="mt-6 text-center text-sm"><Link className="underline" href="/live">See payments happening live</Link></p>
      </div>
    </div>
  );
}
