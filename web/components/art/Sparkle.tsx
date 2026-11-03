"use client";

import { motion, useReducedMotion } from "motion/react";

type Props = { size?: number; className?: string; delay?: number; color?: string };

/** Four-point star that twinkles in place. */
export function Sparkle({ size = 28, className, delay = 0, color = "var(--color-sun)" }: Props) {
  const reduce = useReducedMotion();
  return (
    <motion.svg
      aria-hidden
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={className}
      initial={{ scale: 0, rotate: -30 }}
      animate={reduce ? { scale: 1, rotate: 0 } : { scale: [1, 0.72, 1], rotate: [0, 18, 0], opacity: [1, 0.75, 1] }}
      transition={reduce ? { duration: 0 } : { duration: 2.4, repeat: Infinity, ease: "easeInOut", delay }}
    >
      <path d="M20 1c1.6 9.6 4.4 13.4 19 19-14.6 5.6-17.4 9.4-19 19-1.6-9.6-4.4-13.4-19-19C15.6 14.4 18.4 10.6 20 1Z" fill={color} />
    </motion.svg>
  );
}
