import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { Float } from "@/components/art/Float";
import { Sparkle } from "@/components/art/Sparkle";
import { STICKERS } from "@/components/art/Stickers";

export const metadata: Metadata = { title: "Features", description: "What QRush does: QR checkout on Base that settles in USDC, with splits, receipts, loyalty and pay links." };

const FEATURES: { sticker: keyof typeof STICKERS; tint: string; title: string; body: string; points: string[] }[] = [
  {
    sticker: "coin",
    tint: "bg-sky",
    title: "Any token in, USDC out",
    body: "Buyers pay with USDC or ETH. ETH is swapped through Uniswap inside the same transaction, so the seller always receives USDC.",
    points: ["Best route between direct and multi-hop pools", "Slippage cap with unused ETH refunded", "Price quote refreshed while the buyer decides"],
  },
  {
    sticker: "phone",
    tint: "bg-pink-soft",
    title: "Any wallet",
    body: "Buyers scan with a phone wallet over WalletConnect or use a browser extension. Smart wallets get one-tap batched checkout.",
    points: ["Smart wallets approve and pay in one tap", "Buyers pay a tiny Base network fee, usually under one cent", "Browser wallets like MetaMask work too"],
  },
  {
    sticker: "split",
    tint: "bg-mint",
    title: "Automatic splits",
    body: "Send a share of every payment to a partner, landlord or staff wallet. The contract splits it at payment time.",
    points: ["Up to 10 recipients", "Shares set in percent, stored onchain", "Every recipient shown on the receipt"],
  },
  {
    sticker: "receipt",
    tint: "bg-sun",
    title: "Receipts you can verify",
    body: "Each payment emits an onchain receipt with a number, line items and the transaction hash. Buyers get a shareable link.",
    points: ["Itemised from your product list", "Printable", "Linked to Basescan for proof"],
  },
  {
    sticker: "stamp",
    tint: "bg-blush",
    title: "Loyalty stamps",
    body: "Every Nth purchase from the same wallet gets a discount. The count lives in the contract, so there is no card to lose.",
    points: ["Set the purchase count and discount", "Discount applied at checkout automatically", "Up to 50% off"],
  },
  {
    sticker: "qr",
    tint: "bg-cream-deep",
    title: "Pay links and posters",
    body: "Create a fixed amount or pick products, sign it once, and get a link and QR. Download a print-ready poster for the counter.",
    points: ["Reusable or one-time links", "Your Basename shown to buyers", "Amount locked by your signature"],
  },
  {
    sticker: "wallet",
    tint: "bg-pink-soft",
    title: "Shop setup from a photo",
    body: "Snap your menu or price board and QRush reads the items and prices into your product list. You review before anything is saved.",
    points: ["Works with photos of printed or handwritten menus", "Edit or hide items after import", "Optional, only when enabled on the server"],
  },
  {
    sticker: "pin",
    tint: "bg-sky",
    title: "Live map",
    body: "A public feed of payments as they settle, pinned to the city where the link was opened.",
    points: ["Read straight from contract events", "City-level only, never exact location", "Updates every 15 seconds"],
  },
];

export default function FeaturesPage() {
  return (
    <div className="section py-10 md:py-16">
      <header className="relative mx-auto max-w-2xl text-center">
        <span className="pill">Features</span>
        <h1 className="h-display mt-4 text-4xl sm:text-6xl">Everything a counter needs, nothing it doesn&apos;t</h1>
        <p className="mt-4 text-lg text-ink-soft">QRush is a QR checkout on Base. Here is what is in the box.</p>
        <Sparkle className="absolute -top-2 left-4 hidden sm:block" size={30} />
        <Sparkle className="absolute top-16 -right-2 hidden sm:block" size={20} delay={0.7} />
      </header>
      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {FEATURES.map((f, i) => {
          const Art = STICKERS[f.sticker];
          return (
            <Reveal key={f.title} delay={(i % 2) * 0.08}>
              <article className={`card h-full p-6 sm:p-7 ${f.tint}`}>
                <div className="flex items-start gap-4">
                  <Float rotate={i % 2 ? 6 : -6} distance={6} duration={4 + (i % 3)} delay={i * 0.1} className="shrink-0">
                    <Art size={72} />
                  </Float>
                  <div className="min-w-0">
                    <h2 className="text-2xl font-bold">{f.title}</h2>
                    <p className="mt-2">{f.body}</p>
                  </div>
                </div>
                <ul className="mt-4 space-y-1.5 text-sm">
                  {f.points.map((p) => (
                    <li key={p} className="flex gap-2"><span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rotate-45 bg-ink" />{p}</li>
                  ))}
                </ul>
              </article>
            </Reveal>
          );
        })}
      </div>
      <Reveal>
        <div className="card mt-12 flex flex-col items-center gap-4 bg-pink p-8 text-center sm:p-10">
          <h2 className="script text-4xl text-white sm:text-5xl">Ready to try it?</h2>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/app" className="btn btn-ink">Open your shop</Link>
            <Link href="/docs" className="btn btn-cream">Read the guide</Link>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
