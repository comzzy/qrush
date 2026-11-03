"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BASESCAN, timeAgo, usd } from "@/lib/format";
import type { FeedItem } from "@/lib/types";
import { WorldMap } from "@/components/live/WorldMap";
import { RecentStats } from "@/components/RecentStats";
import { Skeleton } from "@/components/ui";
import { Sparkle } from "@/components/art/Sparkle";
import { MapPinSticker } from "@/components/art/Stickers";

export function LiveClient() {
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["feed", "all"],
    queryFn: () => api<FeedItem[]>("/feed/recent?include=all&limit=100", { auth: false }),
    refetchInterval: 15_000,
  });
  const items = data ?? [];
  const seen = useRef<Set<number> | null>(null);
  const [fresh, setFresh] = useState<number | undefined>();
  useEffect(() => {
    if (!data) return;
    if (seen.current) {
      const n = data.find((i) => !seen.current!.has(i.receiptId));
      if (n) setFresh(n.receiptId);
    }
    seen.current = new Set(data.map((i) => i.receiptId));
  }, [data]);

  return (
    <div className="section py-10 md:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="relative">
          <span className="pill">
            <motion.span className="h-2.5 w-2.5 rounded-full bg-pink-deep" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity }} />
            Live from Base
          </span>
          <h1 className="h-display mt-3 text-4xl sm:text-6xl">Payments, as they land</h1>
          <p className="mt-2 max-w-xl text-ink-soft">Every QRush payment is a public onchain event. This page reads them from the checkout contract and refreshes every 15 seconds.</p>
          <Sparkle className="absolute -top-2 -right-3 sm:-right-8" size={22} />
        </div>
        {dataUpdatedAt > 0 && <p className="text-sm text-ink-soft">Updated {timeAgo(dataUpdatedAt / 1000)}</p>}
      </div>

      <div className="mt-6"><RecentStats /></div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="card overflow-hidden p-2 sm:p-4">
          {isLoading ? <Skeleton className="aspect-[96/50]" /> : <WorldMap items={items} highlight={fresh} />}
          <p className="px-2 pt-2 text-xs text-ink-soft">Pins show the approximate city where a pay link was opened, when the network shares it. No exact locations are stored.</p>
        </div>
        <div className="card flex max-h-[34rem] min-w-0 flex-col p-4" data-testid="live-feed">
          <h2 className="mb-3 text-lg font-bold">Latest</h2>
          {isLoading ? (
            <Skeleton className="h-60" />
          ) : items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
              <MapPinSticker size={80} />
              <p className="text-ink-soft">No payments yet. <Link href="/app" className="underline">Open a shop</Link> and be the first pin.</p>
            </div>
          ) : (
            <ul className="-mr-2 space-y-2 overflow-y-auto pr-2">
              <AnimatePresence initial={false}>
                {items.map((i) => (
                  <motion.li key={i.receiptId} layout initial={{ opacity: 0, x: 30, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} className={`rounded-2xl border-2 border-ink p-3 ${i.receiptId === fresh ? "bg-sun" : "bg-cream"}`} data-testid="feed-item">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{i.shopName ?? "A shop"}</span>
                      <span className="shrink-0 font-bold">{usd(Number(i.netAmount) / 1e6)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-ink-soft">
                      <span className="truncate">{[i.city, i.country].filter(Boolean).join(", ") || "Somewhere"} · {timeAgo(i.blockTimestamp)}</span>
                      <span className="flex shrink-0 gap-2">
                        <Link className="underline" href={`/receipt/${i.receiptId}`}>Receipt</Link>
                        <a className="underline" href={`${BASESCAN}/tx/${i.txHash}`} target="_blank" rel="noreferrer">Tx</a>
                      </span>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
