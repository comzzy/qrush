import type { Address, Hex } from "viem";

export type Tx = { chainId?: number; to: Address; value: string; data: Hex };

export type Shop = {
  id: string;
  seller: Address;
  name: string;
  slug: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  country: string | null;
};

export type Product = {
  id: string;
  shopId: string;
  name: string;
  description: string | null;
  priceUsdc: string;
  price: string;
  sku: string | null;
  active: boolean;
};

export type InvoiceItem = { name: string; quantity: number; unitPrice: string; unitPriceFormatted: string; productId?: string };

export type Invoice = {
  id: string;
  invoiceId: Hex;
  invoiceKey: Hex;
  shopId: string;
  seller: Address;
  amount: string;
  amountUnits: string;
  expiresAt: string | null;
  maxUses: number;
  reusable: boolean;
  uses: number;
  items: InvoiceItem[];
  memo: string | null;
  status: "awaiting_signature" | "signed" | "open" | "completed" | "cancelled";
  signature: Hex | null;
  payUrl: string;
  qr: { png: string; svg: string };
  createdAt: string;
};

export type PayView = {
  invoice: Invoice;
  shop: Pick<Shop, "id" | "name" | "slug" | "city" | "country">;
  onchain: { status: "none" | "open" | "completed" | "cancelled"; uses: number };
  payable: boolean;
  checkout: Address;
  chainId: number;
};

export type Checkout = {
  invoiceKey: Hex;
  buyer: Address;
  payToken: Address | "ETH";
  gross: string;
  discount: string;
  amountDue: string;
  amountDueUnits: string;
  loyalty: { purchases: string; threshold: number; discountBps: number; eligible: boolean };
  swap: { path: Hex; amountIn: string; maxAmountIn: string; hops: number } | null;
  calls: Tx[];
  transactions: Tx[];
};

export type Receipt = {
  receiptId: number;
  invoiceKey: Hex;
  shop: { id: string; name: string; slug: string } | null;
  seller: Address;
  buyer: Address;
  paidWith: Address | "ETH";
  amountIn: string;
  gross: string;
  discount: string;
  total: string;
  purchaseNumber: number;
  items: { name: string; quantity: number; unitPrice: string }[];
  memo: string | null;
  payouts: { recipient: Address; amount: string }[];
  txHash: Hex;
  blockNumber: number;
  paidAt: string;
  geo: { latitude: number | null; longitude: number | null; city: string | null; country: string | null };
};

export type RawPayment = {
  receiptId: number;
  invoiceKey: Hex;
  seller: Address;
  buyer: Address;
  netAmount: string;
  txHash: Hex;
  blockTimestamp: number;
};

export type FeedItem = {
  receiptId: number;
  seller: Address;
  netAmount: string;
  tokenIn: Address;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  country: string | null;
  blockTimestamp: number;
  txHash: Hex;
  shopName?: string | null;
};

export type SellerOnchain = {
  registered: boolean;
  name: string;
  loyalty: { threshold: number; discountBps: number };
  splits: { recipient: Address; bps: number }[];
  customSplits: boolean;
};
