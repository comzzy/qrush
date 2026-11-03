import { formatUnits } from "viem";

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function usd(value: string | number) {
  const n = typeof value === "number" ? value : Number(value);
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const usdcUnits = (units: string | bigint) => formatUnits(BigInt(units), 6);

export function timeAgo(iso: string | number) {
  const t = typeof iso === "number" ? iso * 1000 : Date.parse(iso);
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const BASESCAN = "https://basescan.org";
