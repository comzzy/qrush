import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { DocsNav } from "./DocsNav";
import { Faq } from "./Faq";

export const metadata: Metadata = { title: "Docs", description: "What QRush is, the problem it solves, and step-by-step guides for sellers and buyers." };

const CONTRACT = "0x6E41C4C993f0C2967eB9F8a3B27E9AD1E0dDb12e";

const SELLER_STEPS = [
  ["Open the app and connect a wallet", "Go to Open app. Pick WalletConnect to scan with a phone wallet (MetaMask, Trust, Rainbow and more), or Browser wallet for an extension like MetaMask or Rabby."],
  ["Sign in", "Press Sign in and approve the message in your wallet. It is free and proves you own the wallet. Nothing is sent onchain."],
  ["Create your shop", "Enter your shop name and city. Allow location if you want your payments to show on the live map."],
  ["Register onchain", "Press Register. This is one small transaction on Base that records your shop in the checkout contract. You need a little ETH on Base for gas."],
  ["Add products (optional)", "Type items and prices in USDC, or upload a photo of your menu and review what QRush reads from it."],
  ["Create a pay link", "On Pay links, enter an amount or pick products, choose reusable or one-time, then sign. Signing is free."],
  ["Show the QR", "Open QR poster to show the code on screen, download it as a print-ready poster, or copy the link and send it in a chat."],
  ["Get paid", "When a buyer pays, USDC arrives in your wallet (or is split as you set) and a receipt appears on Receipts."],
] as const;

const BUYER_STEPS = [
  ["Scan the QR", "Point your phone camera at the code. It opens the payment page in your browser. No app to install."],
  ["Check the amount", "You see the shop name, the items and the total in USDC. If you have earned a loyalty discount, it is already applied."],
  ["Connect a wallet", "Use WalletConnect with a phone wallet, or any browser wallet on Base."],
  ["Choose how to pay", "Pick USDC, or ETH which is swapped to USDC for you. The page shows the exact cost before you confirm."],
  ["Confirm", "Approve in your wallet. Smart wallets do it in one step; other wallets may ask twice (approve, then pay)."],
  ["Keep your receipt", "When the payment confirms you get a receipt link you can save, share or print. It is also verifiable on Basescan."],
] as const;

function Steps({ steps, tint }: { steps: readonly (readonly [string, string])[]; tint: string }) {
  return (
    <ol className="mt-6 space-y-4">
      {steps.map(([title, body], i) => (
        <Reveal key={title} delay={Math.min(i, 4) * 0.05} y={16}>
          <li className="card flex gap-4 p-4 sm:p-5">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-ink text-lg font-bold ${tint}`}>{i + 1}</span>
            <div className="min-w-0">
              <h4 className="text-lg font-bold">{title}</h4>
              <p className="mt-1 text-ink-soft">{body}</p>
            </div>
          </li>
        </Reveal>
      ))}
    </ol>
  );
}

export default function DocsPage() {
  return (
    <div className="section py-10 md:py-14">
      <header className="max-w-2xl">
        <span className="pill">Docs</span>
        <h1 className="h-display mt-4 text-4xl sm:text-6xl">How QRush works</h1>
        <p className="mt-3 text-lg text-ink-soft">Plain-language guides for sellers and buyers. Five minutes to read, about the same to set up.</p>
      </header>
      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <DocsNav />
        <div className="min-w-0 max-w-3xl space-y-16">
          <section id="what" className="scroll-mt-24">
            <h2 className="text-3xl font-bold">What QRush is</h2>
            <p className="mt-3">QRush lets any shop accept digital dollars (USDC) with a QR code. The seller makes a pay link, the buyer scans it and pays from a wallet on Base, and the money lands in the seller&apos;s wallet in seconds. There is no card terminal, no monthly fee and no payout delay.</p>
            <p className="mt-3">Payments go through one public smart contract, so every sale has a receipt anyone can check: <a className="break-all underline" href={`https://basescan.org/address/${CONTRACT}`} target="_blank" rel="noreferrer">{CONTRACT}</a>.</p>
          </section>

          <section id="problem" className="scroll-mt-24">
            <h2 className="text-3xl font-bold">The problem</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ["Card fees eat the margin", "Small shops lose a few percent of every sale and wait days for the money."],
                ["Crypto checkout is awkward", "Buyers hold different tokens, need gas, and copy long addresses by hand."],
                ["No proof for either side", "A screenshot of a transfer is not a receipt, and it is easy to fake."],
                ["Extras need extra tools", "Splitting revenue or running a loyalty card usually means more apps and spreadsheets."],
              ].map(([t, b]) => (
                <li key={t} className="card bg-pink-soft p-4"><h3 className="font-bold">{t}</h3><p className="mt-1 text-sm">{b}</p></li>
              ))}
            </ul>
          </section>

          <section id="solution" className="scroll-mt-24">
            <h2 className="text-3xl font-bold">The solution</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ["Scan and pay", "A QR opens a page with the exact amount. The buyer confirms in their wallet. That's it."],
                ["Pay with what you hold", "USDC goes straight through; ETH is swapped to USDC in the same transaction."],
                ["Signed amounts", "The seller signs each link, so the amount and recipient can't be changed by anyone else."],
                ["Built-in receipts, splits and loyalty", "The contract records each sale, divides it between recipients and tracks repeat buyers."],
              ].map(([t, b]) => (
                <li key={t} className="card bg-mint p-4"><h3 className="font-bold">{t}</h3><p className="mt-1 text-sm">{b}</p></li>
              ))}
            </ul>
          </section>

          <section id="sellers" className="scroll-mt-24">
            <h2 className="text-3xl font-bold">Guide for sellers</h2>
            <p className="mt-2 text-ink-soft">You need a wallet and a little ETH on Base for the one-time registration.</p>
            <Steps steps={SELLER_STEPS} tint="bg-sun" />
            <h3 className="mt-8 text-xl font-bold">Splits and loyalty</h3>
            <p className="mt-2">On Payouts, add wallet addresses with a percentage each (they must add up to 100%) and save. For loyalty, choose a purchase count and a discount, for example every 5th purchase gets 10% off. Both are saved onchain with one transaction.</p>
          </section>

          <section id="buyers" className="scroll-mt-24">
            <h2 className="text-3xl font-bold">Guide for buyers</h2>
            <p className="mt-2 text-ink-soft">You need USDC or ETH on Base. Each payment also pays a tiny Base network fee (usually under one cent), so keep a little ETH on Base.</p>
            <Steps steps={BUYER_STEPS} tint="bg-pink" />
          </section>

          <section id="faq" className="scroll-mt-24">
            <h2 className="text-3xl font-bold">FAQ</h2>
            <Faq />
          </section>

          <div className="card flex flex-col items-start gap-3 bg-sun p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-lg font-bold">Ready to take your first payment?</p>
            <Link href="/app" className="btn btn-ink">Open app</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
