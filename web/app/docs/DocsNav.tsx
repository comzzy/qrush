"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";

const ITEMS = [
  ["what", "What it is"],
  ["problem", "The problem"],
  ["solution", "The solution"],
  ["sellers", "For sellers"],
  ["buyers", "For buyers"],
  ["faq", "FAQ"],
] as const;

export function DocsNav() {
  const [active, setActive] = useState<string>("what");
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const v = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (v) setActive(v.target.id);
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    ITEMS.forEach(([id]) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);
  return (
    <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
      <ul className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {ITEMS.map(([id, label]) => (
          <li key={id} className="shrink-0">
            <a href={`#${id}`} className="relative block rounded-full px-4 py-1.5 font-medium">
              {active === id && <motion.span layoutId="docs-nav" className="absolute inset-0 rounded-full border-2 border-ink bg-sun" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
              <span className="relative">{label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
