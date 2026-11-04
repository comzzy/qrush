import Link from "next/link";
import { Guy } from "@/components/art/Guy";
import { Sparkle } from "@/components/art/Sparkle";
import { Float } from "@/components/art/Float";
import { MapPinSticker, PhoneScanSticker, QrTileSticker, ReceiptSticker, SplitSticker, StampCardSticker, UsdcCoinSticker, WalletSticker } from "@/components/art/Stickers";
import { ScanPanel } from "@/components/ScanPanel";
import { Reveal } from "@/components/Reveal";
import { RecentStats } from "@/components/RecentStats";
import { HeroText } from "@/components/HeroText";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://qrushpay.vercel.app";

const STEPS = [
  { n: "1", title: "Make a pay link", body: "Sign in with your wallet, name your shop, add an amount or a product. QRush gives you a QR code to print or show on screen.", Art: QrTileSticker, bg: "bg-pink-soft" },
  { n: "2", title: "Buyer scans and pays", body: "Their phone opens the checkout. They pay in USDC, or ETH and other tokens that are swapped to USDC in the same transaction.", Art: PhoneScanSticker, bg: "bg-sky/50" },
  { n: "3", title: "USDC lands, receipt saved", body: "The money goes straight to your wallet (or is split between partners). The buyer gets an onchain receipt and a loyalty stamp.", Art: ReceiptSticker, bg: "bg-mint/50" },
];

const TEASERS = [
  { title: "Any token in, USDC out", body: "Buyers spend what they hold. You always receive USDC.", Art: UsdcCoinSticker },
  { title: "Any phone wallet", body: "Buyers scan with MetaMask, Trust, Rainbow or 260+ wallets via WalletConnect.", Art: WalletSticker },
  { title: "Automatic splits", body: "Send a share of every sale to a partner, landlord or staff tip jar.", Art: SplitSticker },
  { title: "Loyalty stamps", body: "Every Nth purchase earns a discount, tracked onchain.", Art: StampCardSticker },
];

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="section relative pt-6 pb-16 sm:pt-12 lg:pb-24">
        <Sparkle className="absolute top-4 right-[8%] hidden sm:block" size={34} />
        <Sparkle className="absolute top-[46%] left-[46%] hidden lg:block" size={22} delay={0.8} />
        <Sparkle className="absolute bottom-6 left-[4%] hidden sm:block" size={26} delay={1.4} />

        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
          <div className="relative min-w-0">
            <HeroText />
            <div className="mt-8 hidden flex-wrap gap-4 lg:flex">
              <Float rotate={-8} delay={0.5}><UsdcCoinSticker size={72} /></Float>
              <Float rotate={6} delay={0.6} duration={6}><ReceiptSticker size={72} /></Float>
              <Float rotate={-4} delay={0.7} duration={5.5}><WalletSticker size={72} /></Float>
              <Float rotate={8} delay={0.8} duration={4.6}><MapPinSticker size={72} /></Float>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[34rem]">
            <Float className="absolute -top-8 -left-4 z-10 sm:-left-8" rotate={-12} delay={0.4}>
              <QrTileSticker size={64} />
            </Float>
            <Float className="absolute -top-6 -right-1 z-10 xl:-right-6" rotate={10} delay={0.55} duration={5.6}>
              <StampCardSticker size={70} />
            </Float>
            <ScanPanel value={`${SITE}/app`} caption="Point your camera here to open QRush on your phone.">
              <Guy className="mx-auto -mb-2 h-auto w-full max-w-[15rem]" />
            </ScanPanel>
          </div>
        </div>

        <div className="mt-10 flex justify-center gap-5 lg:hidden">
          <Float rotate={-8} delay={0.5}><UsdcCoinSticker size={56} /></Float>
          <Float rotate={6} delay={0.6} duration={6}><ReceiptSticker size={56} /></Float>
          <Float rotate={-4} delay={0.7} duration={5.5}><WalletSticker size={56} /></Float>
          <Float rotate={8} delay={0.8} duration={4.6}><MapPinSticker size={56} /></Float>
        </div>
      </section>

      {/* How it works */}
      <section className="section py-12" id="how">
        <Reveal>
          <span className="pill">How it works</span>
          <h2 className="h-display mt-3 text-4xl sm:text-5xl">Three steps from QR to USDC</h2>
        </Reveal>
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.1}>
              <li className={`card group relative flex h-full flex-col gap-4 p-6 transition-transform hover:-translate-y-1 ${s.bg}`}>
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-full border-2 border-ink bg-white text-xl font-bold">{s.n}</span>
                  <s.Art size={76} className="transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110" />
                </div>
                <h3 className="text-2xl font-bold">{s.title}</h3>
                <p className="text-ink-soft">{s.body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* Real activity */}
      <section className="section py-12">
        <Reveal className="card relative overflow-hidden bg-sun p-6 sm:p-10">
          <div className="grid items-center gap-8 md:grid-cols-[1fr_1fr]">
            <div className="min-w-0">
              <h2 className="h-display text-3xl sm:text-4xl">Every payment is public on Base</h2>
              <p className="mt-3 max-w-md">
                Watch payments land on a live map as they are confirmed. Each dot links to its transaction on Basescan.
              </p>
              <Link href="/live" className="btn btn-ink mt-6">
                See live payments
              </Link>
            </div>
            <div className="min-w-0">
              <RecentStats />
              <div className="mt-4 flex justify-center">
                <Float rotate={-6} distance={8}>
                  <MapPinSticker size={110} />
                </Float>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Features teaser */}
      <section className="section py-12">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="pill">Built for small shops</span>
            <h2 className="h-display mt-3 text-4xl sm:text-5xl">What you get</h2>
          </div>
          <Link href="/features" className="btn btn-cream">
            All features →
          </Link>
        </Reveal>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {TEASERS.map((t, i) => (
            <Reveal key={t.title} delay={i * 0.08}>
              <div className="card group h-full p-6 transition-transform hover:-translate-y-1 hover:rotate-[-0.6deg]">
                <t.Art size={64} className="transition-transform duration-300 group-hover:-rotate-12" />
                <h3 className="mt-4 text-xl font-bold">{t.title}</h3>
                <p className="mt-2 text-ink-soft">{t.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="section py-12">
        <Reveal className="card relative overflow-hidden bg-pink p-8 text-center sm:p-12">
          <Sparkle className="absolute top-5 left-6" size={28} />
          <Sparkle className="absolute right-8 bottom-6" size={36} delay={1} />
          <h2 className="script-outline text-5xl sm:text-7xl">Get paid today</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg">Set up a shop in a couple of minutes. All you need is a wallet on Base.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/app" className="btn btn-ink">Create your shop</Link>
            <Link href="/docs" className="btn btn-cream">Read the guide</Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
