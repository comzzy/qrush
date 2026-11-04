import Link from "next/link";
import { Guy } from "@/components/art/Guy";
import { Sparkle } from "@/components/art/Sparkle";
import { Float } from "@/components/art/Float";
import { MapPinSticker, PhoneScanSticker, QrTileSticker, ReceiptSticker, SplitSticker, StampCardSticker, UsdcCoinSticker, WalletSticker } from "@/components/art/Stickers";
import { ScanPanel } from "@/components/ScanPanel";
import { Reveal } from "@/components/Reveal";
import { RecentStats } from "@/components/RecentStats";
import { HeroText } from "@/components/HeroText";
import { CompareTable, COMPARE_SOURCES } from "@/components/CompareTable";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://qrushpay.vercel.app";

const STEPS = [
  { n: "1", title: "Make a pay link", body: "Sign in with your wallet, name your shop, add an amount or a product. QRush gives you a QR code to print or show on screen.", Art: QrTileSticker, bg: "bg-pink-soft" },
  { n: "2", title: "Buyer scans and pays", body: "Their phone opens the checkout. They pay in USDC, or ETH and other tokens that are swapped to USDC in the same transaction.", Art: PhoneScanSticker, bg: "bg-sky/50" },
  { n: "3", title: "USDC lands, receipt saved", body: "The money goes straight to your wallet (or is split between partners). The buyer gets an onchain receipt and a loyalty stamp.", Art: ReceiptSticker, bg: "bg-mint/50" },
];

const DIFFERENT = [
  { title: "No Coinbase account needed", body: "Sellers in any country only need a wallet on Base. QRush works everywhere, including the many markets, like Nigeria, where Coinbase Business is not offered.", bg: "bg-pink-soft" },
  { title: "Any token in, USDC out, one transaction", body: "Buyers pay with ETH or other tokens. Our contract swaps them to USDC through Uniswap v3 and pays you in the same transaction.", bg: "bg-sky/50" },
  { title: "Fits every kind of business", body: "In-person pickup codes, delivery orders, bookings, and digital downloads. Sold PDFs are stamped with the buyer and order code, and every file gets a fingerprint so copies can be traced back to your shop.", bg: "bg-mint/50" },
  { title: "Passkey wallet for buyers", body: "No wallet app? Buyers can create one with their phone's fingerprint or face unlock and pay right away.", bg: "bg-sun/60" },
  { title: "QR stickers with a verified-shop panel", body: "Print a sticker for your counter. When scanned, buyers see a verified-shop panel, checked onchain, before they pay, so a swapped sticker is easy to spot.", bg: "bg-blush/60" },
  { title: "Snap your price list", body: "Take a photo of your menu or price list and QRush turns it into products you can sell.", bg: "bg-cream-deep" },
];

const SOURCES = [
  {
    stat: "$205B+",
    body: "Crypto value received in Sub-Saharan Africa from July 2024 to June 2025, up about 52% from the year before.",
    label: "Chainalysis, Sept 2025",
    href: "https://www.chainalysis.com/blog/subsaharan-africa-crypto-adoption-2025/",
  },
  {
    stat: "$92.1B",
    body: "Value received by Nigeria in the same 12 months, nearly triple the next country. Inflation and limited access to dollars make stablecoins attractive.",
    label: "Chainalysis, Sept 2025",
    href: "https://www.chainalysis.com/blog/subsaharan-africa-crypto-adoption-2025/",
  },
  {
    stat: "Small payments",
    body: "Over 8% of value moved in the region was in transfers under $10,000, compared with 6% elsewhere, a sign of everyday retail use.",
    label: "Chainalysis, Sept 2025",
    href: "https://www.chainalysis.com/blog/subsaharan-africa-crypto-adoption-2025/",
  },
  {
    stat: "US + Singapore only",
    body: "Coinbase closed Commerce on March 31, 2026. Its replacement, Coinbase Business, only accepts businesses in the US or Singapore.",
    label: "Coinbase Help Center",
    href: "https://help.coinbase.com/en/transitioning-from-coinbase-commerce-to-coinbase-business",
  },
];

const WHO = [
  { title: "Market stalls and food vendors", body: "Put a QR sticker on the counter. Buyers pay and show a pickup code." },
  { title: "Delivery businesses", body: "Collect the buyer's address and phone with the order." },
  { title: "Salons, tutors and service pros", body: "Take bookings and get paid up front." },
  { title: "Ebook and course sellers", body: "Sell PDFs that are stamped for each buyer." },
  { title: "Shops with partners or staff", body: "Split every sale automatically between wallets." },
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

      {/* Why QRush is different */}
      <section className="section py-12" id="different">
        <Reveal>
          <span className="pill">Why QRush</span>
          <h2 className="h-display mt-3 text-4xl sm:text-5xl">Built for shops other checkouts leave out</h2>
          <p className="mt-3 max-w-2xl text-ink-soft">
            Coinbase Commerce, Daimo Pay and Request all take crypto payments. Here is what QRush does differently.
          </p>
        </Reveal>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {DIFFERENT.map((d, i) => (
            <Reveal key={d.title} delay={i * 0.06}>
              <div className={`card h-full p-6 transition-transform hover:-translate-y-1 ${d.bg}`}>
                <h3 className="text-xl font-bold">{d.title}</h3>
                <p className="mt-2 text-ink-soft">{d.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Comparison */}
      <section className="section py-12" id="compare">
        <Reveal>
          <span className="pill">Side by side</span>
          <h2 className="h-display mt-3 text-4xl sm:text-5xl">How QRush compares</h2>
          <p className="mt-3 max-w-2xl text-ink-soft">Taken from each product&apos;s public docs. A dash means the feature is not listed there.</p>
        </Reveal>
        <Reveal delay={0.1}>
          <CompareTable />
        </Reveal>
        <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
          Sources:
          {COMPARE_SOURCES.map((s) => (
            <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{s.label} ↗</a>
          ))}
        </p>
      </section>

      {/* Who it's for */}
      <section className="section py-12" id="who">
        <Reveal>
          <span className="pill">Who it&apos;s for</span>
          <h2 className="h-display mt-3 text-4xl sm:text-5xl">Made for real shops</h2>
        </Reveal>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {WHO.map((w, i) => (
            <Reveal key={w.title} delay={i * 0.06}>
              <div className="card h-full p-5 transition-transform hover:-translate-y-1 hover:rotate-[0.6deg]">
                <h3 className="text-lg font-bold">{w.title}</h3>
                <p className="mt-2 text-sm text-ink-soft">{w.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Demand */}
      <section className="section py-12" id="demand">
        <Reveal className="card relative overflow-hidden bg-sky/40 p-6 sm:p-10">
          <span className="pill">Why now</span>
          <h2 className="h-display mt-3 text-3xl sm:text-4xl">Stablecoins are already everyday money</h2>
          <p className="mt-3 max-w-2xl">
            Around the world, people use stablecoins to save and pay, not just to trade. Shops in any country need a simple way to accept them. Here are examples from one fast-growing region, and why existing tools leave most sellers out.
          </p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {SOURCES.map((s) => (
              <div key={s.stat + s.label} className="min-w-0 rounded-3xl border-2 border-ink bg-white p-5">
                <div className="text-2xl font-bold break-words sm:text-3xl">{s.stat}</div>
                <p className="mt-2 text-sm text-ink-soft">{s.body}</p>
                <a href={s.href} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-semibold underline underline-offset-2">
                  Source: {s.label} ↗
                </a>
              </div>
            ))}
          </div>
        </Reveal>
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
