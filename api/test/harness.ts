import { serve, type ServerType } from "@hono/node-server";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { inject } from "vitest";
import { createApp } from "../src/app.js";
import { createChainClient } from "../src/chain.js";
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db/client.js";
import { PaymentBus } from "../src/events.js";
import type { FileStore } from "../src/services/files.js";
import { CheckoutIndexer } from "../src/services/indexer.js";

export async function startHarness(env: Record<string, string> = {}, fetchImpl: typeof fetch = fetch, files?: FileStore) {
  const dir = mkdtempSync(join(tmpdir(), "qrush-"));
  const server = await new Promise<ServerType>((resolve) => {
    const s = serve({ fetch: (req) => handler(req), port: 0 }, () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const config = loadConfig({
    DATABASE_PATH: join(dir, "test.db"),
    RPC_URL: inject("rpcUrl"),
    RPC_FALLBACK_URLS: "none",
    CHECKOUT_ADDRESS: inject("checkout"),
    CHECKOUT_DEPLOY_BLOCK: inject("deployBlock"),
    JWT_SECRET: "test-secret-test-secret-test-secret-0123",
    PUBLIC_BASE_URL: baseUrl,
    SIWE_DOMAIN: `127.0.0.1:${port}`,
    INDEXER_POLL_MS: "200",
    ...env,
  });
  const { db, close } = openDb(config.DATABASE_PATH);
  const client = createChainClient(config);
  const bus = new PaymentBus();
  const app = createApp({ config, db, client, bus, fetch: fetchImpl, files });
  const handler = (req: Request) => app.fetch(req);
  const indexer = new CheckoutIndexer({
    db,
    client,
    bus,
    address: config.CHECKOUT_ADDRESS,
    startBlock: config.CHECKOUT_DEPLOY_BLOCK,
    batchBlocks: config.INDEXER_BATCH_BLOCKS,
    confirmations: 0n,
    pollMs: config.INDEXER_POLL_MS,
    onError: (e) => console.error("indexer", e),
  });

  return {
    baseUrl,
    config,
    db,
    client,
    bus,
    indexer,
    async stop() {
      indexer.stop();
      await new Promise<void>((r) => server.close(() => r()));
      close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export type Harness = Awaited<ReturnType<typeof startHarness>>;
