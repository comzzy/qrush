import { sqliteTable, text, integer, real, uniqueIndex, index, primaryKey } from "drizzle-orm/sqlite-core";

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
    buyerFields: text("buyer_fields", { mode: "json" }).$type<BuyerFieldsRow>(),
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
    /** Overrides the shop's buyer fields for invoices that include this product. */
    buyerFields: text("buyer_fields", { mode: "json" }).$type<BuyerFieldsRow>(),
    /** How the buyer receives this product. Null means in person, with no extra fields. */
    fulfilment: text("fulfilment", { enum: ["pickup", "shipping", "service", "digital"] }),
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

export type FieldMode = "off" | "optional" | "required";
export type BuyerFieldsRow = {
  name: FieldMode;
  email: FieldMode;
  phone: FieldMode;
  address?: FieldMode;
  schedule?: FieldMode;
  note: FieldMode;
};
export type Fulfilment = "pickup" | "shipping" | "service" | "digital";

/** What a buyer receives after paying for a product. Never exposed by public routes. */
export const productDeliveries = sqliteTable("product_deliveries", {
  productId: text("product_id")
    .primaryKey()
    .references(() => products.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["file", "url"] }).notNull(),
  /** Private Blob pathname for files. */
  pathname: text("pathname"),
  url: text("url"),
  fileName: text("file_name"),
  size: integer("size"),
  contentType: text("content_type"),
  /** SHA-256 of the uploaded file, hex. */
  sha256: text("sha256"),
  /** When the seller confirmed they own the rights to sell the file. */
  rightsConfirmedAt: integer("rights_confirmed_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/** First shop to upload a given file. Blocks the same file being resold by another shop. */
export const fileFingerprints = sqliteTable("file_fingerprints", {
  sha256: text("sha256").primaryKey(),
  shopId: text("shop_id").notNull(),
  productId: text("product_id").notNull(),
  seller: text("seller").notNull(),
  fileName: text("file_name"),
  firstUploadedAt: integer("first_uploaded_at", { mode: "timestamp_ms" }).notNull(),
});

/** Download count per paid order and product, plus the buyer's stamped copy. */
export const downloads = sqliteTable(
  "downloads",
  {
    txHash: text("tx_hash").notNull(),
    productId: text("product_id").notNull(),
    count: integer("count").notNull().default(0),
    views: integer("views").notNull().default(0),
    stampedPathname: text("stamped_pathname"),
    lastAt: integer("last_at", { mode: "timestamp_ms" }),
  },
  (t) => [primaryKey({ columns: [t.txHash, t.productId] })],
);

/** Buyer reports about a product, saved for review. */
export const productReports = sqliteTable(
  "product_reports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    invoiceKey: text("invoice_key").notNull(),
    seller: text("seller").notNull(),
    reason: text("reason").notNull(),
    details: text("details"),
    contact: text("contact"),
    status: text("status").notNull().default("open"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("product_reports_seller_idx").on(t.seller)],
);

/** Buyer details collected off-chain at checkout, linked to the payment by tx hash once it is confirmed. */
export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    /** Short code the buyer shows or reads out; also in the receipt QR. */
    code: text("code").notNull(),
    invoiceKey: text("invoice_key").notNull(),
    seller: text("seller").notNull(),
    fulfilment: text("fulfilment", { enum: ["pickup", "shipping", "service", "digital"] }).notNull(),
    status: text("status").notNull(),
    tracking: text("tracking"),
    sellerNote: text("seller_note"),
    address: text("address"),
    schedule: text("schedule"),
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    note: text("note"),
    txHash: text("tx_hash"),
    receiptId: integer("receipt_id"),
    buyer: text("buyer"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    uniqueIndex("orders_tx_idx").on(t.txHash),
    uniqueIndex("orders_code_idx").on(t.code),
    index("orders_invoice_idx").on(t.invoiceKey),
    index("orders_seller_idx").on(t.seller),
  ],
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
