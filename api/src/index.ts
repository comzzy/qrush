import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createChainClient } from "./chain.js";
import { loadConfig } from "./config.js";
import { openDb } from "./db/client.js";
import { PaymentBus } from "./events.js";
import { CheckoutIndexer } from "./services/indexer.js";

const config = loadConfig();
const { db, close } = openDb(config.DATABASE_PATH);
const client = createChainClient(config);
const bus = new PaymentBus();

const indexer = new CheckoutIndexer({
  db,
  client,
  bus,
  address: config.CHECKOUT_ADDRESS,
  startBlock: config.CHECKOUT_DEPLOY_BLOCK,
  batchBlocks: config.INDEXER_BATCH_BLOCKS,
  minBatchBlocks: config.INDEXER_MIN_BATCH_BLOCKS,
  maxBackoffMs: config.INDEXER_MAX_BACKOFF_MS,
  confirmations: config.INDEXER_CONFIRMATIONS,
  pollMs: config.INDEXER_POLL_MS,
  onError: (e) => console.error("indexer:", e instanceof Error ? e.message : e),
});
indexer.start();

const app = createApp({ config, db, client, bus, fetch }, { log: true });
const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`RPC endpoints: ${config.rpcUrls.map((u) => new URL(u).host).join(", ")}`);
  console.log(`QRush API listening on :${info.port} (chain ${config.CHAIN_ID}, checkout ${config.CHECKOUT_ADDRESS})`);
});

function shutdown() {
  indexer.stop();
  server.close(() => {
    close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
