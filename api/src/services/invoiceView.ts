import QRCode from "qrcode";
import type { Deps } from "../context.js";
import type { invoices } from "../db/schema.js";
import { formatUsdc } from "../lib/money.js";

type InvoiceRow = typeof invoices.$inferSelect;

export function payUrl(deps: Deps, invoiceKey: string) {
  const raw = (deps.config.PAY_BASE_URL ?? deps.config.PUBLIC_BASE_URL).replace(/\/+$/, "");
  const base = raw.endsWith("/pay") ? raw : `${raw}/pay`;
  return `${base.replace(/\/$/, "")}/${invoiceKey}`;
}

export function qrLinks(deps: Deps, invoiceKey: string) {
  const api = deps.config.PUBLIC_BASE_URL.replace(/\/$/, "");
  return { png: `${api}/pay/${invoiceKey}/qr.png`, svg: `${api}/pay/${invoiceKey}/qr.svg` };
}

export async function renderQr(text: string, format: "png" | "svg", size = 512) {
  const opts = { errorCorrectionLevel: "M" as const, margin: 2, width: size };
  return format === "png" ? QRCode.toBuffer(text, { ...opts, type: "png" }) : QRCode.toString(text, { ...opts, type: "svg" });
}

export function serializeInvoice(deps: Deps, row: InvoiceRow) {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    invoiceKey: row.invoiceKey,
    shopId: row.shopId,
    seller: row.seller,
    amount: formatUsdc(row.amount),
    amountUnits: row.amount,
    expiresAt: row.expiresAt === 0 ? null : new Date(row.expiresAt * 1000).toISOString(),
    maxUses: row.maxUses,
    reusable: row.maxUses !== 1,
    uses: row.uses,
    items: row.items.map((i) => ({ ...i, unitPriceFormatted: formatUsdc(i.unitPrice) })),
    memo: row.memo,
    status: row.status,
    signature: row.signature,
    payUrl: payUrl(deps, row.invoiceKey),
    qr: qrLinks(deps, row.invoiceKey),
    createdAt: row.createdAt.toISOString(),
  };
}
