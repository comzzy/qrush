"use client";

import Link from "next/link";
import { motion } from "motion/react";

const WORDS = ["Scan.", "Pay.", "Done."];

export function HeroText() {
  return (
    <div>
      <motion.span className="pill border-2 border-ink" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pink-deep opacity-75 motion-reduce:hidden" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-pink-deep" />
        </span>
        QR payments in USDC on Base
      </motion.span>
      <h1 className="h-display mt-5 text-[3.4rem] sm:text-7xl lg:text-[5.4rem]">
        {WORDS.map((w, i) => (
          <motion.span
            key={w}
            className="mr-[0.22em] inline-block"
            initial={{ opacity: 0, y: 40, rotate: 6 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ type: "spring", stiffness: 160, damping: 14, delay: 0.12 + i * 0.12 }}
          >
            {i === 2 ? <span className="relative">{w}<Underline /></span> : w}
          </motion.span>
        ))}
      </h1>
      <motion.p className="mt-5 max-w-xl text-lg text-ink-soft sm:text-xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
        Print a QR code and get paid in USDC. Your customers pay from any wallet on their phone or browser. No card machine, no monthly fee.
      </motion.p>
      <motion.div className="mt-7 flex flex-wrap gap-3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
        <Link href="/app" className="btn btn-ink !px-6 !py-3 text-lg">Start selling</Link>
        <Link href="/#how" className="btn btn-cream !px-6 !py-3 text-lg">How it works</Link>
      </motion.div>
    </div>
  );
}

function Underline() {
  return (
    <svg aria-hidden viewBox="0 0 200 20" preserveAspectRatio="none" className="absolute -bottom-2 left-0 h-3 w-full">
      <motion.path
        d="M3 14C50 4 140 2 197 10"
        fill="none"
        stroke="var(--color-pink-deep)"
        strokeWidth="7"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.7, delay: 0.7, ease: "easeOut" }}
      />
    </svg>
  );
}
