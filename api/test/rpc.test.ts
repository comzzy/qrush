import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import { DEFAULT_PUBLIC_RPCS, loadConfig } from "../src/config.js";
import { openDb } from "../src/db/client.js";
import { PaymentBus } from "../src/events.js";
import { CheckoutIndexer } from "../src/services/indexer.js";
import { BASE } from "./constants.js";

const base = { JWT_SECRET: "x".repeat(32), CHECKOUT_ADDRESS: BASE.WETH };

describe("rpc config", () => {
  it("uses public fallbacks by default and pins RPC_URL first", () => {
    expect(loadConfig(base).rpcUrls).toEqual(DEFAULT_PUBLIC_RPCS);
    const pinned = loadConfig({
      ...base,
      RPC_URL: "https://dedicated.example",
      RPC_FALLBACK_URLS: "https://a.example, https://dedicated.example",
    });
    expect(pinned.rpcUrls).toEqual([
      "https://dedicated.example",
      "https://a.example",
    ]);
    expect(
      loadConfig({ ...base, RPC_URL: "http://x", RPC_FALLBACK_URLS: "none" })
        .rpcUrls,
    ).toEqual(["http://x"]);
    expect(() => loadConfig({ ...base, RPC_FALLBACK_URLS: "none" })).toThrow();
  });
});

describe("indexer range adaptation", () => {
  it("shrinks the getLogs range on provider limits, persists progress, and grows back", async () => {
    const { db, close } = openDb(
      join(mkdtempSync(join(tmpdir(), "qrush-")), "t.db"),
    );
    const ranges: bigint[] = [];
    const client = {
      getBlockNumber: async () => 10_999n,
      getLogs: async ({
        fromBlock,
        toBlock,
      }: {
        fromBlock: bigint;
        toBlock: bigint;
      }) => {
        const span = toBlock - fromBlock + 1n;
        ranges.push(span);
        if (span > 500n)
          throw new Error("Block range too large: maximum 500 blocks");
        return [];
      },
    } as unknown as PublicClient;
    const indexer = new CheckoutIndexer({
      db,
      client,
      bus: new PaymentBus(),
      address: BASE.WETH,
      startBlock: 1_000n,
      batchBlocks: 2000n,
      minBatchBlocks: 10n,
      confirmations: 0n,
      pollMs: 10,
    });
    expect(await indexer.syncOnce()).toBe(10_999n);
    expect(ranges.slice(0, 3)).toEqual([2000n, 1000n, 500n]);
    expect(indexer.lastIndexedBlock()).toBe(10_999n);
    close();
  });

  it("gives up at the minimum range so the poll loop can back off", async () => {
    const { db, close } = openDb(
      join(mkdtempSync(join(tmpdir(), "qrush-")), "t.db"),
    );
    const client = {
      getBlockNumber: async () => 5_000n,
      getLogs: async () => {
        throw new Error("429 request limit reached");
      },
    } as unknown as PublicClient;
    const indexer = new CheckoutIndexer({
      db,
      client,
      bus: new PaymentBus(),
      address: BASE.WETH,
      startBlock: 1_000n,
      batchBlocks: 40n,
      minBatchBlocks: 10n,
      confirmations: 0n,
      pollMs: 10,
    });
    await expect(indexer.syncOnce()).rejects.toThrow(/429/);
    expect(indexer.currentBatchBlocks).toBe(10n);
    expect(indexer.lastIndexedBlock()).toBe(999n);
    close();
  });
});
