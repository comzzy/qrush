"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

const INK = "#141414";
const SKIN = "#b9784c";
const SKIN_SHADE = "#9c5f37";
const HAIR = "#1d1714";
const HOODIE = "#f9d648";
const HOODIE_SHADE = "#e9b923";
const line = { stroke: INK, strokeWidth: 4, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Deterministic QR-looking grid for the phone screen (decorative, not scannable). */
const MODULES: [number, number][] = (() => {
  const out: [number, number][] = [];
  let seed = 7;
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < 9; x++) {
      const finder = (x < 3 && y < 3) || (x > 5 && y < 3) || (x < 3 && y > 5);
      seed = (seed * 9301 + 49297) % 233280;
      if (!finder && seed / 233280 > 0.5) out.push([x, y]);
    }
  return out;
})();

function PhoneScreen({ paid }: { paid: boolean }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      {paid ? (
        <motion.g
          key="paid"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 16 }}
          style={{ transformOrigin: "36px 60px" }}
        >
          <rect x="0" y="0" width="72" height="118" rx="6" fill="#e9fbf2" />
          <circle cx="36" cy="46" r="20" fill="#3cc48a" stroke={INK} strokeWidth="3" />
          <motion.path
            d="m26 46 7 7 13-14"
            fill="none"
            stroke="#fff"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.35, delay: 0.1 }}
          />
          <text x="36" y="84" textAnchor="middle" fontSize="13" fontWeight="700" fill={INK} fontFamily="var(--font-fredoka)">
            Paid
          </text>
          <text x="36" y="100" textAnchor="middle" fontSize="10" fill={INK} fontFamily="var(--font-fredoka)">
            12.50 USDC
          </text>
        </motion.g>
      ) : (
        <motion.g key="qr" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <rect x="0" y="0" width="72" height="118" rx="6" fill="#fff" />
          <g transform="translate(9 22)">
            {[
              [0, 0],
              [6, 0],
              [0, 6],
            ].map(([x, y]) => (
              <g key={`${x}${y}`}>
                <rect x={x! * 6 + 1} y={y! * 6 + 1} width="16" height="16" rx="2" fill="none" stroke={INK} strokeWidth="3" />
                <rect x={x! * 6 + 6} y={y! * 6 + 6} width="6" height="6" fill={INK} />
              </g>
            ))}
            {MODULES.map(([x, y]) => (
              <rect key={`${x}-${y}`} x={x * 6} y={y * 6} width="5.4" height="5.4" rx="1" fill={INK} />
            ))}
          </g>
          {!reduce && (
            <motion.rect
              x="5"
              width="62"
              height="3"
              rx="1.5"
              fill="#f78f86"
              animate={{ y: [20, 76, 20] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
          <rect x="14" y="88" width="44" height="16" rx="8" fill="#ffb3ad" stroke={INK} strokeWidth="2" />
          <text x="36" y="100" textAnchor="middle" fontSize="9" fontWeight="700" fill={INK} fontFamily="var(--font-fredoka)">
            Scan
          </text>
        </motion.g>
      )}
    </AnimatePresence>
  );
}

function Coin({ i }: { i: number }) {
  const dx = [-70, -20, 34][i]!;
  const dy = [-90, -130, -96][i]!;
  return (
    <motion.g
      initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
      animate={{ x: dx, y: [0, dy, dy + 30], opacity: [0, 1, 0], scale: [0.4, 1, 0.9], rotate: [0, 180, 300] }}
      transition={{ duration: 1.3, delay: i * 0.12, ease: "easeOut" }}
    >
      <circle r="13" fill="#2775ca" stroke={INK} strokeWidth="3" />
      <text y="5" textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff" fontFamily="var(--font-fredoka)">
        $
      </text>
    </motion.g>
  );
}

type Props = { className?: string; /** Cycle between scan and paid states. */ demo?: boolean; paid?: boolean };

export function Guy({ className, demo = true, paid: paidProp }: Props) {
  const reduce = useReducedMotion();
  const [paidDemo, setPaidDemo] = useState(false);
  const [dings, setDings] = useState(0);
  const paid = paidProp ?? paidDemo;

  useEffect(() => {
    if (!demo || reduce || paidProp !== undefined) return;
    let t: ReturnType<typeof setTimeout>;
    const loop = (next: boolean) => {
      t = setTimeout(
        () => {
          setPaidDemo(next);
          if (next) setDings((d) => d + 1);
          loop(!next);
        },
        next ? 3200 : 2600,
      );
    };
    loop(true);
    return () => clearTimeout(t);
  }, [demo, reduce, paidProp]);

  const [lastPaidProp, setLastPaidProp] = useState(paidProp);
  if (paidProp !== lastPaidProp) {
    setLastPaidProp(paidProp);
    if (paidProp) setDings((d) => d + 1);
  }

  const idle = !reduce;

  return (
    <svg viewBox="0 0 400 540" className={className} role="img" aria-label="Illustrated guy holding a phone showing a QRush payment">
      <motion.g
        animate={idle ? { y: [0, -6, 0] } : undefined}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* Back arm (relaxed) */}
        <path d="M126 322c-22 30-32 76-30 128" fill="none" stroke={INK} strokeWidth="44" strokeLinecap="round" />
        <path d="M126 322c-22 30-32 76-30 128" fill="none" stroke={HOODIE_SHADE} strokeWidth="36" strokeLinecap="round" />
        <circle cx="96" cy="462" r="19" fill={SKIN} {...line} />

        {/* Torso, breathing */}
        <motion.g
          animate={idle ? { scaleY: [1, 1.018, 1], scaleX: [1, 1.01, 1] } : undefined}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "205px 540px" }}
        >
          <path
            d="M118 336c6-30 40-48 87-48s82 18 88 48l16 204H100Z"
            fill={HOODIE}
            {...line}
          />
          <path d="M160 300c10 22 26 32 45 32s35-10 45-32" fill={HOODIE_SHADE} {...line} />
          <path d="M186 330v48M224 330v44" {...line} strokeWidth={3} />
          <circle cx="186" cy="382" r="4" fill={INK} />
          <circle cx="224" cy="378" r="4" fill={INK} />
          <path d="M150 450h110l-8 52h-94Z" fill={HOODIE_SHADE} {...line} strokeWidth={3.5} />
          <path d="M132 356c4-8 10-14 18-18" stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none" opacity=".7" />
          {/* Q logo patch */}
          <circle cx="252" cy="410" r="15" fill="#ffb3ad" {...line} strokeWidth={3} />
          <path d="M247 405a6 6 0 1 0 9 8m-1-1 4 4" fill="none" {...line} strokeWidth={2.6} />
        </motion.g>

        {/* Neck + head */}
        <rect x="186" y="246" width="38" height="52" rx="14" fill={SKIN_SHADE} {...line} />
        <motion.g
          animate={idle ? { rotate: [0, -3, 0, 2, 0] } : undefined}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "205px 270px" }}
        >
          <ellipse cx="141" cy="206" rx="13" ry="17" fill={SKIN} {...line} />
          <ellipse cx="269" cy="206" rx="13" ry="17" fill={SKIN} {...line} />
          <ellipse cx="205" cy="196" rx="64" ry="72" fill={SKIN} {...line} />
          {/* Hair: short curls with a fade */}
          <path
            d="M141 186c-6-44 18-70 50-74 10-14 36-14 46-2 26 2 42 24 38 64-8-12-18-20-30-22-4 8-14 12-24 10-8 8-22 10-34 4-12 6-30 6-38 0-4 8-6 14-8 20Z"
            fill={HAIR}
            {...line}
          />
          {[
            [160, 128],
            [184, 116],
            [210, 112],
            [236, 118],
            [256, 134],
          ].map(([cx, cy]) => (
            <circle key={cx} cx={cx} cy={cy} r="12" fill={HAIR} />
          ))}
          {/* Brows */}
          <path d="M168 176c8-5 18-5 24 0M218 176c6-5 16-5 24 0" {...line} strokeWidth={5} fill="none" />
          {/* Eyes (blink) */}
          <motion.g
            animate={idle ? { scaleY: [1, 1, 0.08, 1, 1] } : undefined}
            transition={{ duration: 4.2, repeat: Infinity, times: [0, 0.9, 0.93, 0.96, 1] }}
            style={{ transformOrigin: "205px 200px" }}
          >
            <ellipse cx="181" cy="200" rx="7" ry="9" fill={INK} />
            <ellipse cx="229" cy="200" rx="7" ry="9" fill={INK} />
            <circle cx="183" cy="196" r="2.4" fill="#fff" />
            <circle cx="231" cy="196" r="2.4" fill="#fff" />
          </motion.g>
          <circle cx="164" cy="226" r="10" fill="#f78f86" opacity=".45" />
          <circle cx="246" cy="226" r="10" fill="#f78f86" opacity=".45" />
          <path d="M203 206c-3 8-4 14 4 16" {...line} strokeWidth={3} fill="none" />
          {/* Smile widens when paid */}
          <motion.path
            {...line}
            strokeWidth={3.5}
            fill="#fff"
            animate={{ d: paid ? "M180 234c10 20 40 20 50 0Z" : "M184 236c8 10 34 10 42 0Z" }}
            transition={{ type: "spring", stiffness: 200, damping: 18 }}
          />
        </motion.g>

        {/* Front arm holding the phone */}
        <motion.g
          animate={idle ? { rotate: paid ? [0, -7, -4] : [0, -2, 0] } : undefined}
          transition={paid ? { duration: 0.5, ease: "easeOut" } : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "288px 330px" }}
        >
          <path d="M286 332Q328 356 336 416" fill="none" stroke={INK} strokeWidth="44" strokeLinecap="round" />
          <path d="M286 332Q328 356 336 416" fill="none" stroke={HOODIE} strokeWidth="36" strokeLinecap="round" />
          <path d="M336 416Q338 366 322 322" fill="none" stroke={INK} strokeWidth="40" strokeLinecap="round" />
          <path d="M336 416Q338 366 322 322" fill="none" stroke={HOODIE} strokeWidth="32" strokeLinecap="round" />

          {/* Phone */}
          <g transform="translate(282 186) rotate(-8)">
            <rect x="-6" y="-6" width="84" height="142" rx="16" fill={INK} />
            <rect x="0" y="6" width="72" height="118" rx="6" fill="#fff" />
            <g transform="translate(0 6)">
              <PhoneScreen paid={paid} />
            </g>
            <rect x="26" y="-1" width="20" height="4" rx="2" fill="#555" />
          </g>
          {/* Hand over phone edge */}
          <ellipse cx="320" cy="314" rx="22" ry="18" fill={SKIN} {...line} />
          <path d="M302 304c6-4 12-4 16 0M300 316c6-3 12-3 16 1" {...line} strokeWidth={3} fill="none" />
        </motion.g>

        {/* Payment ding */}
        <AnimatePresence>
          {paid && !reduce && (
            <motion.g key={`ding-${dings}`} transform="translate(318 210)">
              {[0, 1, 2].map((i) => (
                <Coin key={i} i={i} />
              ))}
              <motion.g
                initial={{ opacity: 0, scale: 0.3, y: 0 }}
                animate={{ opacity: [0, 1, 1, 0], scale: [0.3, 1.1, 1, 1], y: [-30, -64, -66, -72] }}
                transition={{ duration: 1.6, times: [0, 0.25, 0.75, 1] }}
                exit={{ opacity: 0 }}
              >
                <rect x="10" y="-22" width="62" height="30" rx="15" fill="#fff" stroke={INK} strokeWidth="3" />
                <text x="41" y="-2" textAnchor="middle" fontSize="16" fontWeight="700" fill={INK} fontFamily="var(--font-fredoka)">
                  ding!
                </text>
              </motion.g>
            </motion.g>
          )}
        </AnimatePresence>
      </motion.g>
    </svg>
  );
}
