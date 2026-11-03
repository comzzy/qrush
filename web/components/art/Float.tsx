"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  rotate?: number;
  distance?: number;
  duration?: number;
  delay?: number;
};

/** Gentle bob for stickers; enters with a pop and keeps drifting. */
export function Float({ children, className, rotate = 0, distance = 10, duration = 5, delay = 0 }: Props) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      aria-hidden
      className={className}
      initial={{ opacity: 0, scale: 0.6, rotate: rotate - 12 }}
      animate={{ opacity: 1, scale: 1, rotate }}
      transition={{ type: "spring", stiffness: 180, damping: 14, delay }}
      whileHover={reduce ? undefined : { scale: 1.08, rotate: rotate + 6 }}
    >
      <motion.div
        animate={reduce ? undefined : { y: [0, -distance, 0], rotate: [0, 3, 0] }}
        transition={{ duration, repeat: Infinity, ease: "easeInOut", delay: delay + 0.4 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
