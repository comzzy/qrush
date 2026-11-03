"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useMyReceipts } from "@/lib/hooks";
import { BASESCAN, shortAddress, timeAgo, usd } from "@/lib/format";
import { Skeleton } from "@/components/ui";
import { ReceiptSticker } from "@/components/art/Stickers";

export default function ReceiptsPage() {
  const { data, isLoading } = useMyReceipts();
  if (isLoading) return <Skeleton className="h-64" />;
  if (!data?.length)
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <ReceiptSticker size={90} />
        <p className="text-ink-soft">Receipts appear here as soon as a payment is confirmed on Base.</p>
      </div>
    );
  return (
    <div className="card overflow-hidden">
      <div className="hidden grid-cols-[5rem_1fr_8rem_7rem_7rem] gap-3 border-b-2 border-ink bg-cream-deep px-5 py-3 text-sm font-semibold md:grid">
        <span>#</span><span>Buyer</span><span>When</span><span className="text-right">Total</span><span className="text-right">Tx</span>
      </div>
      <ul>
        {data.map((r, i) => (
          <motion.li key={r.receiptId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 10) * 0.03 }} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-b-2 border-ink/10 px-5 py-3 last:border-0 md:grid-cols-[5rem_1fr_8rem_7rem_7rem] md:items-center" data-testid="receipt-row">
            <Link href={`/receipt/${r.receiptId}`} className="font-semibold underline-offset-4 hover:underline">#{r.receiptId}</Link>
            <span className="text-right font-bold md:hidden">{usd(r.total)}</span>
            <span className="truncate font-mono text-sm">{shortAddress(r.buyer)}{r.discount !== "0" && Number(r.discount) > 0 ? <span className="ml-2 rounded-full bg-sun px-2 py-0.5 font-sans text-xs">loyalty</span> : null}</span>
            <span className="text-right text-sm text-ink-soft md:text-left">{timeAgo(r.paidAt)}</span>
            <span className="hidden text-right font-bold md:block">{usd(r.total)}</span>
            <a href={`${BASESCAN}/tx/${r.txHash}`} target="_blank" rel="noreferrer" className="text-sm underline md:text-right">Basescan</a>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
