"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Logo } from "./Logo";

const LINKS = [
  { href: "/features", label: "Features" },
  { href: "/live", label: "Live map" },
  { href: "/docs", label: "Docs" },
];

export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- portal target only exists after hydration
  useEffect(() => setMounted(true), []);

  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) {
    setLastPath(path);
    setOpen(false);
  }
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    const html = document.documentElement;
    html.style.overflow = document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    if (open) window.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = (href: string) => path === href || path.startsWith(`${href}/`);

  return (
    <header className={`sticky top-0 z-[70] transition-colors ${scrolled || open ? "bg-cream/90 backdrop-blur border-b-2 border-ink" : ""}`}>
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6" aria-label="Main">
        <Link href="/" aria-label="QRush home" className="shrink-0">
          <motion.span whileHover={{ rotate: -4, scale: 1.04 }} whileTap={{ scale: 0.96 }} className="inline-block">
            <Logo />
          </motion.span>
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="relative rounded-full px-4 py-2 font-medium transition-colors hover:bg-pink-soft"
                aria-current={active(l.href) ? "page" : undefined}
              >
                {active(l.href) && (
                  <motion.span layoutId="nav-pill" className="absolute inset-0 -z-10 rounded-full bg-blush" transition={{ type: "spring", stiffness: 380, damping: 30 }} />
                )}
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Link href="/app" className="btn btn-ink hidden !py-2 sm:inline-flex">
            Open app
          </Link>
          <button
            type="button"
            className="btn btn-cream !px-3 !py-2 md:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <motion.path animate={{ d: open ? "M5 5l14 14" : "M4 7h16" }} />
              <motion.path animate={{ opacity: open ? 0 : 1 }} d="M4 12h16" />
              <motion.path animate={{ d: open ? "M5 19L19 5" : "M4 17h16" }} />
            </svg>
          </button>
        </div>
      </nav>

      {/* Portalled to <body>: the header's backdrop-blur creates a containing block that would trap a fixed overlay inside its 64px. */}
      {mounted && createPortal(
      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            className="md:hidden fixed inset-x-0 top-16 bottom-0 z-[60] bg-cream border-t-2 border-ink overflow-y-auto overscroll-contain" role="dialog" aria-label="Menu"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
          >
            <ul className="flex flex-col gap-3 p-6">
              {[{ href: "/", label: "Home" }, ...LINKS].map((l, i) => (
                <motion.li key={l.href} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i }}>
                  <Link
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className={`block rounded-2xl border-2 border-ink px-5 py-4 text-xl font-semibold ${path === l.href ? "bg-blush" : "bg-white"}`}
                  >
                    {l.label}
                  </Link>
                </motion.li>
              ))}
              <motion.li initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.16 }}>
                <Link href="/app" onClick={() => setOpen(false)} className="btn btn-ink w-full !py-4 text-xl">
                  Start selling
                </Link>
              </motion.li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
        , document.body)}
    </header>
  );
}
