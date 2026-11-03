import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type Stamp = { buyer: string; code: string; date: Date };

export const isPdf = (fileName: string | null, contentType: string | null) =>
  contentType === "application/pdf" || /\.pdf$/i.test(fileName ?? "");

/** Replaces characters the standard PDF fonts cannot draw. */
const plain = (v: string) => v.normalize("NFKD").replace(/[^\x20-\x7E]/g, "").trim() || "buyer";

/**
 * Puts a visible footer on every page and the buyer's details in the metadata,
 * so a shared copy can be traced to the order it came from.
 */
export async function stampPdf(bytes: Uint8Array, s: Stamp): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const day = s.date.toISOString().slice(0, 10);
  const line = `Licensed to ${plain(s.buyer)} - order ${s.code} - ${day} - sold via QRush`;
  for (const page of doc.getPages()) {
    const { width } = page.getSize();
    const size = Math.max(6, Math.min(8, width / 80));
    const textWidth = font.widthOfTextAtSize(line, size);
    page.drawText(line, {
      x: Math.max(8, (width - textWidth) / 2),
      y: 10,
      size,
      font,
      color: rgb(0.35, 0.35, 0.35),
      opacity: 0.8,
    });
  }
  doc.setSubject(`Licensed copy for ${plain(s.buyer)}`);
  doc.setKeywords([`order:${s.code}`, `buyer:${plain(s.buyer)}`, `date:${day}`]);
  doc.setProducer("QRush");
  doc.setModificationDate(s.date);
  return doc.save();
}
