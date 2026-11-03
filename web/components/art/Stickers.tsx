/* Hand-drawn style stickers: thick ink outline, flat pastel fills, a white highlight stroke. */

type P = { size?: number; className?: string };

const INK = "#141414";
const s = { stroke: INK, strokeWidth: 3.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function PhoneScanSticker({ size = 120, className }: P) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} aria-hidden>
      <rect x="30" y="10" width="60" height="100" rx="12" fill="#a9d4ff" {...s} />
      <rect x="37" y="22" width="46" height="72" rx="5" fill="#fff" {...s} strokeWidth={2.5} />
      <g fill={INK}>
        <rect x="42" y="28" width="12" height="12" rx="2" />
        <rect x="66" y="28" width="12" height="12" rx="2" />
        <rect x="42" y="52" width="12" height="12" rx="2" />
        <rect x="60" y="48" width="5" height="5" />
        <rect x="68" y="56" width="5" height="5" />
        <rect x="60" y="60" width="5" height="5" />
        <rect x="74" y="48" width="4" height="9" />
      </g>
      <path d="M38 44h44" stroke="#f78f86" strokeWidth="3" strokeLinecap="round" />
      <rect x="40" y="72" width="40" height="14" rx="7" fill="#f9d648" {...s} strokeWidth={2.5} />
      <path d="M52 100h16" {...s} strokeWidth={3} />
      <path d="M36 16c3-2 6-2 9-2" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function UsdcCoinSticker({ size = 120, className }: P) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} aria-hidden>
      <ellipse cx="60" cy="66" rx="46" ry="46" fill="#1d5aa0" {...s} />
      <circle cx="60" cy="60" r="46" fill="#2775ca" {...s} />
      <circle cx="60" cy="60" r="34" fill="none" stroke="#fff" strokeWidth="4" strokeDasharray="44 10" />
      <path
        d="M70 47c-2-5-6-7-11-7-7 0-11 4-11 9 0 12 23 7 23 20 0 5-5 9-12 9-6 0-10-3-12-8M59 34v52"
        fill="none"
        stroke="#fff"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path d="M28 40c4-8 10-13 18-16" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" opacity=".7" />
    </svg>
  );
}

export function ReceiptSticker({ size = 120, className }: P) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} aria-hidden>
      <path d="M28 8h64v100l-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6Z" fill="#fff" {...s} />
      <path d="M40 26h40M40 40h28M40 52h34M40 64h22" {...s} strokeWidth={3} />
      <path d="M40 80h40" stroke={INK} strokeWidth="2.5" strokeDasharray="4 4" />
      <circle cx="78" cy="64" r="11" fill="#9fe0c3" {...s} strokeWidth={3} />
      <path d="m73 64 4 4 7-8" {...s} strokeWidth={3} fill="none" />
      <path d="M40 92h18" stroke="#f78f86" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export function WalletSticker({ size = 120, className }: P) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} aria-hidden>
      <path d="M22 34 76 16l8 18" fill="#9fe0c3" {...s} />
      <rect x="14" y="32" width="88" height="66" rx="14" fill="#f78f86" {...s} />
      <path d="M78 56h28v24H78a12 12 0 0 1 0-24Z" fill="#ffb3ad" {...s} />
      <circle cx="80" cy="68" r="4.5" fill={INK} />
      <path d="M24 44c6-2 14-2 22-2" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M30 84c3 2 7 2 10 0" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function QrTileSticker({ size = 120, className }: P) {
  const dots = [
    [52, 22], [62, 22], [52, 32], [72, 32], [52, 52], [62, 62], [72, 52], [82, 62], [52, 72], [72, 72],
    [82, 82], [62, 82], [92, 52], [22, 52], [32, 62], [42, 52],
  ];
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} aria-hidden>
      <rect x="10" y="10" width="100" height="100" rx="18" fill="#ffd6d2" {...s} />
      <rect x="18" y="18" width="84" height="84" rx="10" fill="#fff" {...s} strokeWidth={2.5} />
      {[
        [22, 22],
        [78, 22],
        [22, 78],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width="20" height="20" rx="4" fill="none" stroke={INK} strokeWidth="4" />
          <rect x={x! + 6} y={y! + 6} width="8" height="8" rx="1.5" fill={INK} />
        </g>
      ))}
      {dots.map(([x, y]) => (
        <rect key={`${x}:${y}`} x={x} y={y} width="7" height="7" rx="1.5" fill={INK} />
      ))}
    </svg>
  );
}

export function SplitSticker({ size = 120, className }: P) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} aria-hidden>
      <circle cx="60" cy="60" r="50" fill="#f9d648" {...s} />
      <path d="M60 92V62M60 62 34 36M60 62l26-26" fill="none" {...s} strokeWidth={6} />
      <path d="M30 50V32h18M90 50V32H72" fill="none" {...s} strokeWidth={6} />
      <circle cx="60" cy="92" r="7" fill="#fff" {...s} />
      <path d="M24 74c2 6 6 11 11 14" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function StampCardSticker({ size = 120, className }: P) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} aria-hidden>
      <rect x="8" y="26" width="104" height="68" rx="12" fill="#fff" {...s} />
      <path d="M8 44h104" {...s} strokeWidth={3} />
      <path d="M20 36h34" stroke="#f78f86" strokeWidth="5" strokeLinecap="round" />
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={26 + i * 23} cy="68" r="9" fill={i < 3 ? "#f78f86" : "#fff"} {...s} strokeWidth={3} />
      ))}
      {[0, 1, 2].map((i) => (
        <path key={i} d={`m${21 + i * 23} 68 4 4 6-7`} stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" />
      ))}
      <path d="M95 64l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4Z" fill="#f9d648" stroke={INK} strokeWidth="1.5" />
    </svg>
  );
}

export function MapPinSticker({ size = 120, className }: P) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} aria-hidden>
      <ellipse cx="60" cy="106" rx="26" ry="7" fill="#f7e4cf" {...s} strokeWidth={3} />
      <path d="M60 104C40 80 26 64 26 44a34 34 0 0 1 68 0c0 20-14 36-34 60Z" fill="#f78f86" {...s} />
      <circle cx="60" cy="44" r="14" fill="#fff" {...s} />
      <path d="M38 30c3-6 8-10 14-12" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export const STICKERS = {
  phone: PhoneScanSticker,
  coin: UsdcCoinSticker,
  receipt: ReceiptSticker,
  wallet: WalletSticker,
  qr: QrTileSticker,
  split: SplitSticker,
  stamp: StampCardSticker,
  pin: MapPinSticker,
};
