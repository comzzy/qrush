"use client";

import { motion, useReducedMotion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import type { ReactNode } from "react";

/** The pink "Scan Here" board from the poster, with a live QR and a moving scan line. */
export function ScanPanel({ value, title = "Scan Here", caption, children }: { value: string; title?: string; caption?: ReactNode; children?: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="relative rounded-[2rem] border-[3px] border-ink bg-pink p-4 sm:p-6"
      style={{ boxShadow: "0 8px 0 0 var(--color-ink)" }}
      initial={{ opacity: 0, y: 40, rotate: -2 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ type: "spring", stiffness: 120, damping: 16, delay: 0.15 }}
    >
      <h2 className="script-outline text-center text-[2.6rem] leading-none sm:text-6xl">{title}</h2>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-end gap-3 sm:gap-5">
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl border-[3px] border-ink bg-white p-3">
          <QRCodeSVG value={value} className="h-full w-full" bgColor="#ffffff" fgColor="#141414" level="M" marginSize={0} title="QR code" />
          {!reduce && (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-x-2 h-1.5 rounded-full bg-pink-deep shadow-[0_0_18px_6px_rgba(247,143,134,.55)]"
              animate={{ top: ["8%", "90%", "8%"] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
          {["top-1 left-1 border-l-4 border-t-4", "top-1 right-1 border-r-4 border-t-4", "bottom-1 left-1 border-l-4 border-b-4", "bottom-1 right-1 border-r-4 border-b-4"].map((c) => (
            <span key={c} aria-hidden className={`absolute h-5 w-5 rounded-sm border-ink ${c}`} />
          ))}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
      {caption && <p className="mt-4 text-center text-sm font-medium sm:text-base">{caption}</p>}
    </motion.div>
  );
}
