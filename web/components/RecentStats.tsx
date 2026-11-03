"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { FeedItem } from "@/lib/types";
import { Counter } from "./Reveal";

/** Real numbers from the indexer; renders nothing until there is data. */
export function RecentStats() {
  const { data } = useQuery({
    queryKey: ["feed", "all"],
    queryFn: () => api<FeedItem[]>("/feed/recent?include=all&limit=100"),
    refetchInterval: 15_000,
  });
  const items = data ?? [];
  if (!items.length) return null;
  const volume = items.reduce((sum, i) => sum + Number(i.netAmount) / 1e6, 0);
  const shops = new Set(items.map((i) => i.shopName ?? i.seller)).size;
  return (
    <dl className="grid grid-cols-3 gap-3 text-center">
      {[
        ["Recent payments", <Counter key="a" to={items.length} />],
        ["USDC settled", <Counter key="b" to={volume} decimals={2} />],
        ["Shops paid", <Counter key="c" to={shops} />],
      ].map(([label, value]) => (
        <div key={label as string} className="card !rounded-2xl px-2 py-3">
          <dd className="text-2xl font-bold sm:text-3xl">{value}</dd>
          <dt className="text-xs text-ink-soft sm:text-sm">{label}</dt>
        </div>
      ))}
    </dl>
  );
}
