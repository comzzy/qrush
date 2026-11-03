import { createPublicClient, defineChain, fallback, http, type PublicClient, type Transport } from "viem";
import { base } from "viem/chains";
import type { Config } from "./config.js";

/**
 * Public client over every configured RPC. With more than one URL, viem's fallback
 * transport fails over on errors (rate limits, range limits, outages) and, when no
 * dedicated RPC_URL is pinned first, ranks endpoints by latency and stability.
 */
export function createChainClient(config: Config): PublicClient {
  const urls = config.rpcUrls;
  const chain =
    config.CHAIN_ID === base.id
      ? { ...base, rpcUrls: { default: { http: urls } } }
      : defineChain({
          id: config.CHAIN_ID,
          name: `chain-${config.CHAIN_ID}`,
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: { default: { http: urls } },
        });
  const one = (url: string) => http(url, { retryCount: 1, retryDelay: 250, timeout: 15_000 });
  const transport: Transport =
    urls.length === 1
      ? http(urls[0], { retryCount: 3 })
      : fallback(urls.map(one), {
          // Keep a dedicated provider primary; otherwise let viem reorder by health.
          rank: config.RPC_URL ? false : { interval: 30_000, sampleCount: 5, timeout: 2_000 },
          retryCount: 2,
          retryDelay: 500,
        });
  return createPublicClient({ chain, transport }) as PublicClient;
}
