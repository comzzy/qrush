"use client";

import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { useRef, useState } from "react";
import { motion } from "motion/react";
import type { Invoice, Shop } from "@/lib/types";
import { usd } from "@/lib/format";

const W = 1240;
const H = 1754; // A5-ish portrait at print resolution

function fontOf(selector: string, fallback: string) {
  const el = document.querySelector(selector);
  return el ? getComputedStyle(el).fontFamily : fallback;
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + r * 0.12, y - r * 0.12, x + r, y);
  ctx.quadraticCurveTo(x + r * 0.12, y + r * 0.12, x, y + r);
  ctx.quadraticCurveTo(x - r * 0.12, y + r * 0.12, x - r, y);
  ctx.quadraticCurveTo(x - r * 0.12, y - r * 0.12, x, y - r);
  ctx.fillStyle = "#f9d648";
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Printable poster in the QRush style: cream grid, pink "Scan Here" panel, big QR. */
export function QrPoster({ invoice, shop }: { invoice: Invoice; shop: Shop }) {
  const qrRef = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState(false);
  const amount = invoice.reusable && !invoice.items.length && invoice.maxUses === 0 ? null : usd(invoice.amount);
  const label = invoice.items.length ? invoice.items.map((i) => `${i.quantity}× ${i.name}`).join(", ") : invoice.memo;

  const download = async () => {
    setBusy(true);
    await document.fonts.ready;
    const sans = fontOf("body", "sans-serif");
    const script = fontOf(".script", "serif");
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fffbed";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#f7e4cf";
    ctx.lineWidth = 3;
    for (let x = 0; x < W; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    ctx.textAlign = "center";
    // Pill
    ctx.font = `600 40px ${sans}`;
    const pill = "Pay with USDC on Base";
    const pw = ctx.measureText(pill).width + 80;
    ctx.fillStyle = "#ffc6cb";
    roundRect(ctx, (W - pw) / 2, 90, pw, 76, 38);
    ctx.fill();
    ctx.fillStyle = "#141414";
    ctx.fillText(pill, W / 2, 142);
    // Shop name
    ctx.font = `700 ${shop.name.length > 18 ? 84 : 112}px ${sans}`;
    ctx.fillText(shop.name, W / 2, 300, W - 140);
    if (amount) {
      ctx.font = `700 72px ${sans}`;
      ctx.fillText(amount, W / 2, 400);
    }
    // Panel
    const px = 110, py = 470, pW = W - 220, pH = 1080;
    ctx.fillStyle = "#141414";
    roundRect(ctx, px, py + 16, pW, pH, 70);
    ctx.fill();
    ctx.fillStyle = "#ffb3ad";
    ctx.lineWidth = 8;
    roundRect(ctx, px, py, pW, pH, 70);
    ctx.fill();
    ctx.stroke();
    ctx.font = `150px ${script}`;
    ctx.lineJoin = "round";
    ctx.lineWidth = 22;
    ctx.strokeStyle = "#141414";
    ctx.strokeText("Scan Here", W / 2, py + 200);
    ctx.fillStyle = "#fff";
    ctx.fillText("Scan Here", W / 2, py + 200);
    // QR
    const q = 700, qx = (W - q) / 2, qy = py + 270;
    ctx.fillStyle = "#fff";
    roundRect(ctx, qx - 40, qy - 40, q + 80, q + 80, 40);
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.stroke();
    if (qrRef.current) ctx.drawImage(qrRef.current, qx, qy, q, q);
    // Footer text
    ctx.fillStyle = "#141414";
    ctx.font = `500 40px ${sans}`;
    if (label) ctx.fillText(label.length > 48 ? `${label.slice(0, 47)}…` : label, W / 2, 1640, W - 160);
    ctx.font = `500 32px ${sans}`;
    ctx.fillText("Open your camera, point it at the code, tap the link.", W / 2, 1700, W - 160);
    sparkle(ctx, 140, 260, 46);
    sparkle(ctx, W - 130, 360, 36);
    sparkle(ctx, W - 170, 130, 24);

    const a = document.createElement("a");
    a.download = `qrush-${shop.slug}-${invoice.invoiceKey.slice(2, 8)}.png`;
    a.href = c.toDataURL("image/png");
    a.click();
    setBusy(false);
  };

  return (
    <div>
      <motion.div className="mx-auto max-w-xs rounded-[1.75rem] border-[3px] border-ink bg-pink p-4 text-center" style={{ boxShadow: "0 6px 0 0 var(--color-ink)" }} initial={{ rotate: -3, scale: 0.9 }} animate={{ rotate: 0, scale: 1 }}>
        <p className="truncate font-bold">{shop.name}</p>
        {amount && <p className="text-2xl font-bold">{amount}</p>}
        <p className="script-outline mt-1 text-4xl">Scan Here</p>
        <div className="mt-3 rounded-2xl border-[3px] border-ink bg-white p-3">
          <QRCodeSVG value={invoice.payUrl} className="h-auto w-full" level="M" marginSize={0} />
        </div>
      </motion.div>
      <QRCodeCanvas ref={qrRef} value={invoice.payUrl} size={700} level="M" marginSize={0} className="hidden" aria-hidden />
      <button type="button" className="btn btn-ink mt-5 w-full" onClick={download} disabled={busy}>
        Download poster (PNG)
      </button>
    </div>
  );
}
