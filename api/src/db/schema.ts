import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const authNonces = sqliteTable("auth_nonces", {
  nonce: text("nonce").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp_ms" }),
});

export const sellers = sqliteTable("sellers", {
  address: text("address").primaryKey(),
  basename: text("basename"),
  onchainRegistered: integer("onchain_registered", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const shops = sqliteTable(
  "shops",
  {
    id: text("id").primaryKey(),
    seller: text("seller")
      .notNull()
      .references(() => sellers.address),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    city: text("city"),
    country: text("country"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("shops_slug_idx").on(t.slug), index("shops_seller_idx").on(t.seller)],
);

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    shopId: text("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    priceUsdc: text("price_usdc").notNull(),
    sku: text("sku"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("products_shop_idx").on(t.shopId)],
);

export const invoices = sqliteTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id").notNull(),
    invoiceKey: text("invoice_key").notNull(),
    shopId: text("shop_id")
      .notNull()
      .references(() => shops.id),
    seller: text("seller").notNull(),
    amount: text("amount").notNull(),
    expiresAt: integer("expires_at").notNull(),
    maxUses: integer("max_uses").notNull(),
    items: text("items", { mode: "json" }).$type<InvoiceItemRow[]>().notNull(),
    memo: text("memo"),
    signature: text("signature"),
    status: text("status", { enum: ["awaiting_signature", "signed", "open", "completed", "cancelled"] }).notNull(),
    uses: integer("uses").notNull().default(0),
    viewerLatitude: real("viewer_latitude"),
    viewerLongitude: real("viewer_longitude"),
    viewerCountry: text("viewer_country"),
    viewerCity: text("viewer_city"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("invoices_key_idx").on(t.invoiceKey), index("invoices_shop_idx").on(t.shopId)],
);

export type InvoiceItemRow = { name: string; quantity: number; unitPrice: string; productId?: string };

export const payments = sqliteTable(
  "payments",
  {
    receiptId: integer("receipt_id").primaryKey(),
    invoiceKey: text("invoice_key").notNull(),
    seller: text("seller").notNull(),
    buyer: text("buyer").notNull(),
    tokenIn: text("token_in").notNull(),
    amountIn: text("amount_in").notNull(),
    grossAmount: text("gross_amount").notNull(),
    discount: text("discount").notNull(),
    netAmount: text("net_amount").notNull(),
    purchaseNumber: integer("purchase_number").notNull(),
    txHash: text("tx_hash").notNull(),
    blockNumber: integer("block_number").notNull(),
    logIndex: integer("log_index").notNull(),
    blockTimestamp: integer("block_timestamp").notNull(),
    latitude: real("latitude"),
    longitude: real("longitude"),
    city: text("city"),
    country: text("country"),
    geoSource: text("geo_source", { enum: ["shop", "request"] }),
  },
  (t) => [
    index("payments_invoice_idx").on(t.invoiceKey),
    index("payments_seller_idx").on(t.seller),
    index("payments_buyer_idx").on(t.buyer),
  ],
);

export const payouts = sqliteTable(
  "payouts",
  {
    receiptId: integer("receipt_id").notNull(),
    recipient: text("recipient").notNull(),
    amount: text("amount").notNull(),
    logIndex: integer("log_index").notNull(),
    txHash: text("tx_hash").notNull(),
  },
  (t) => [uniqueIndex("payouts_tx_log_idx").on(t.txHash, t.logIndex), index("payouts_receipt_idx").on(t.receiptId)],
);

export const indexerState = sqliteTable("indexer_state", {
  id: text("id").primaryKey(),
  lastBlock: integer("last_block").notNull(),
});
