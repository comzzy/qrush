"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { useSession } from "./session";
import type { Invoice, Product, Receipt, SellerOnchain, Shop } from "./types";

export function useShops() {
  const { me } = useSession();
  return useQuery({ queryKey: ["shops", me?.address], queryFn: () => api<Shop[]>("/shops"), enabled: Boolean(me) });
}

/** Sellers manage one shop from the dashboard; the first one is the active shop. */
export function useShop() {
  const q = useShops();
  return { ...q, shop: q.data?.[0] ?? null };
}

export function useOnchain() {
  const { me } = useSession();
  return useQuery({ queryKey: ["onchain", me?.address], queryFn: () => api<SellerOnchain>("/seller/onchain"), enabled: Boolean(me) });
}

export function useProducts(shopId: string | undefined) {
  return useQuery({ queryKey: ["products", shopId], queryFn: () => api<Product[]>(`/shops/${shopId}/products`), enabled: Boolean(shopId) });
}

export function useInvoices(shopId: string | undefined) {
  return useQuery({ queryKey: ["invoices", shopId], queryFn: () => api<Invoice[]>(`/invoices?shopId=${shopId}`), enabled: Boolean(shopId) });
}

export function useMyReceipts() {
  const { me } = useSession();
  return useQuery({
    queryKey: ["receipts", me?.address],
    queryFn: () => api<(Receipt | null)[]>("/receipts/mine").then((r) => r.filter((x): x is Receipt => Boolean(x))),
    enabled: Boolean(me),
    refetchInterval: 20_000,
  });
}
