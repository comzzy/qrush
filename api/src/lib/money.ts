import { formatUnits, parseUnits } from "viem";

export const USDC_DECIMALS = 6;

/** Parse a human decimal string ("12.50") into USDC base units. */
export function parseUsdc(value: string | number): bigint {
  const str = typeof value === "number" ? value.toFixed(USDC_DECIMALS) : value.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(str)) throw new Error(`Invalid USDC amount: ${value}`);
  return parseUnits(str, USDC_DECIMALS);
}

export const formatUsdc = (units: bigint | string) => formatUnits(BigInt(units), USDC_DECIMALS);
