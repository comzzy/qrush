"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

const QA = [
  ["What does it cost?", "QRush adds no fee. Each payment pays the normal Base network fee, usually under a cent. Sellers pay one small fee to register their shop and to save splits or loyalty settings."],
  ["Which tokens can buyers pay with?", "USDC directly, or ETH, which is swapped to USDC through Uniswap in the same transaction. The seller always receives USDC."],
  ["How fast does the seller get the money?", "As soon as the transaction confirms on Base, typically a couple of seconds. The receipt shows up in the dashboard shortly after."],
  ["Do buyers need ETH for gas?", "Yes, a tiny amount. Every payment pays a small Base network fee, usually under one cent, so keep a little ETH on Base in the paying wallet."],
  ["Can someone change the amount on my QR?", "No. You sign each pay link with your wallet and the contract checks that signature, so the amount, the items and the receiving wallet are fixed."],
  ["What is a reusable link?", "A link that many people can pay, like a fixed-price sign on the counter. A one-time link closes after the first payment."],
  ["What is a Basename?", "A readable name like yourshop.base.eth tied to your wallet. If you have one, buyers see it on the payment page instead of a long address."],
  ["Is my location shared?", "Only the approximate city of the device that opened the pay link, and only when the network provides it. Exact coordinates of buyers are never stored."],
  ["What if a payment fails?", "Nothing is taken. If the swap price moves too far or the balance is short, the transaction reverts and the buyer can try again."],
  ["Can I get a refund out?", "Payments are final onchain, like cash. To refund, send USDC back to the buyer's address shown on the receipt."],
] as const;

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <ul className="mt-4 space-y-3">
      {QA.map(([q, a], i) => {
        const isOpen = open === i;
        return (
          <li key={q} className="card overflow-hidden">
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)} className="flex w-full items-center justify-between gap-4 p-4 text-left font-bold sm:p-5">
              {q}
              <motion.span aria-hidden animate={{ rotate: isOpen ? 45 : 0 }} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-ink bg-sun text-xl leading-none">+</motion.span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
                  <p className="px-4 pb-4 text-ink-soft sm:px-5 sm:pb-5">{a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
}
