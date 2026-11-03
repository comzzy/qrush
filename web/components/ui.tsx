"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <span aria-hidden className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} />;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "ok"; children: ReactNode }) {
  const bg = tone === "error" ? "bg-pink-soft" : tone === "ok" ? "bg-mint/60" : "bg-cream-deep";
  return (
    <motion.div role={tone === "error" ? "alert" : "status"} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className={`rounded-2xl border-2 border-ink px-4 py-3 text-sm ${bg}`}>
      {children}
    </motion.div>
  );
}

export function Skeleton({ className = "h-24" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[var(--radius-panel)] border-2 border-ink/20 bg-white/60 ${className}`} />;
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-cream !px-3 !py-1.5 text-sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value).catch(() => undefined);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={String(done)} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
          {done ? "Copied" : label}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

export function PageHeader({ pill, title, children }: { pill?: string; title: string; children?: ReactNode }) {
  return (
    <motion.header initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      {pill && <span className="pill border-2 border-ink">{pill}</span>}
      <h1 className="h-display mt-3 text-4xl sm:text-6xl">{title}</h1>
      {children && <div className="mt-4 max-w-2xl text-lg text-ink-soft">{children}</div>}
    </motion.header>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/40 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="card my-8 w-full max-w-lg bg-cream p-5 sm:p-6"
            initial={{ scale: 0.9, y: 30 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">{title}</h2>
              <button type="button" onClick={onClose} className="btn btn-cream !px-3 !py-1" aria-label="Close">✕</button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
