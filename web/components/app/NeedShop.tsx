"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useShop } from "@/lib/hooks";
import type { Shop } from "@/lib/types";
import { Skeleton } from "@/components/ui";

/** Renders children with the seller's shop, or a pointer to create one. */
export function NeedShop({ children }: { children: (shop: Shop) => ReactNode }) {
  const { shop, isLoading } = useShop();
  if (isLoading) return <Skeleton className="h-48" />;
  if (!shop)
    return (
      <div className="card p-6">
        <p className="font-semibold">Create your shop first.</p>
        <Link href="/app" className="btn btn-ink mt-4">Go to overview</Link>
      </div>
    );
  return <>{children(shop)}</>;
}
