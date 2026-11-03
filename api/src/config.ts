import { z } from "zod";
import { isAddress, type Address } from "viem";

/**
 * Free, no-account Base mainnet endpoints, ordered by measured eth_getLogs range limits
 * (Nov 2026): publicnode >50k blocks, tenderly 1000, drpc ~100, 1rpc 50, mainnet.base.org
 * (heavily rate limited for logs; fine for reads).
 */
export const DEFAULT_PUBLIC_RPCS = [
  "https://base-rpc.publicnode.com",
  "https://base.gateway.tenderly.co",
  "https://base.drpc.org",
  "https://1rpc.io/base",
  "https://mainnet.base.org",
];

const address = z.string().refine(isAddress, "invalid address").transform((v) => v as Address);

const schema = z.object({
  PORT: z.coerce.number().int().default(8787),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:8787"),
  PAY_BASE_URL: z.string().url().optional(),
  DATABASE_PATH: z.string().default("./qrush.db"),
  /** Optional dedicated provider; always tried first when set. */
  RPC_URL: z.string().url().optional(),
  /** Comma-separated public endpoints used for failover (after RPC_URL). Set to "none" to disable. */
  RPC_FALLBACK_URLS: z
    .string()
    .default(DEFAULT_PUBLIC_RPCS.join(","))
    .transform((v) => (v.trim() === "none" ? [] : v.split(",").map((u) => u.trim()).filter(Boolean)))
    .pipe(z.array(z.string().url())),
  CHAIN_ID: z.coerce.number().int().default(8453),
  CHECKOUT_ADDRESS: address,
  CHECKOUT_DEPLOY_BLOCK: z.coerce.bigint().default(0n),
  USDC_ADDRESS: address.default("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
  WETH_ADDRESS: address.default("0x4200000000000000000000000000000000000006"),
  QUOTER_V2_ADDRESS: address.default("0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a"),
  BASENAME_L2_RESOLVER: address.default("0xC6d566A56A1aFf6508b41f6c90ff131615583BCD"),
  JWT_SECRET: z.string().min(32),
  SIWE_DOMAIN: z.string().default("localhost:8787"),
  INDEXER_POLL_MS: z.coerce.number().int().positive().default(2000),
  INDEXER_BATCH_BLOCKS: z.coerce.bigint().positive().default(2000n),
  INDEXER_MIN_BATCH_BLOCKS: z.coerce.bigint().positive().default(10n),
  INDEXER_MAX_BACKOFF_MS: z.coerce.number().int().positive().default(30_000),
  INDEXER_CONFIRMATIONS: z.coerce.bigint().default(0n),
  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.string().url().default("https://ai-gateway.vercel.sh/v1"),
  AI_MODEL: z.string().default("openai/gpt-4o-mini"),
  PAYMASTER_URL: z.string().url().optional(),
  BUNDLER_URL: z.string().url().optional(),
  PAYMASTER_CONTEXT: z.string().optional(),
});

export type Config = z.infer<typeof schema> & { /** RPC_URL first, then fallbacks, de-duplicated. */ rpcUrls: string[] };

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  // Blank values (e.g. `PAYMASTER_URL=` in .env) mean "unset".
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v.trim() !== ""));
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${z.prettifyError(parsed.error)}`);
  }
  const urls = [...new Set([parsed.data.RPC_URL, ...parsed.data.RPC_FALLBACK_URLS].filter((u): u is string => !!u))];
  if (urls.length === 0) throw new Error("Invalid configuration: set RPC_URL or RPC_FALLBACK_URLS");
  return { ...parsed.data, rpcUrls: urls };
}
