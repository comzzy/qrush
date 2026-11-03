import { createApp } from "../app.js";
import { createChainClient } from "../chain.js";
import { loadConfig, type Config } from "../config.js";
import type { Deps } from "../context.js";
import { openMemoryDb, type MemoryDb } from "../db/client.js";
import { PaymentBus } from "../events.js";
import { CheckoutIndexer } from "../services/indexer.js";
import type { SnapshotStore } from "./snapshot.js";



export type ServerlessOptions = {
  env?: Record<string, string | undefined>;
  /** Persist the database between invocations. Without one, state lives only in this instance. */
  store?: SnapshotStore;
  /** Path prefix the platform mounts the API under, e.g. "/api". */
  basePath?: string;
  /** Minimum time between lazy indexer catch-ups triggered by reads. */
  syncIntervalMs?: number;
  /** Upper bound on blocks scanned in one request-triggered sync. */
  syncMaxBlocks?: bigint;
  fetch?: typeof fetch;
};

const SYNC_PATHS = [/^\/pay\/[^/]+(\/receipts)?$/, /^\/receipts\b/, /^\/feed\/recent$/, /^\/invoices\b/, /^\/loyalty\b/];
const MAX_ATTEMPTS = 3;

class Mutex {
  private tail = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

/**
 * Runs the API inside a request/response platform (Vercel Functions, Next.js route handlers).
 *
 * The database is SQLite held in memory. With a snapshot store, every request first checks
 * the stored version and reloads when another instance wrote since; requests that change
 * data write the snapshot back with an optimistic precondition and are replayed on conflict.
 * Requests are serialized inside an instance, so a snapshot never mixes two requests.
 */
export function createServerlessHandler(opts: ServerlessOptions = {}) {
  const config: Config = loadConfig(opts.env ?? process.env);
  const client = createChainClient(config);
  const bus = new PaymentBus();
  const mutex = new Mutex();
  const basePath = (opts.basePath ?? "").replace(/\/$/, "");
  const syncInterval = opts.syncIntervalMs ?? 5_000;
  const syncMaxBlocks = opts.syncMaxBlocks ?? 20_000n;

  let mem: MemoryDb | null = null;
  let version: string | null = null;
  let lastSync = 0;
  let deps: Deps;
  let indexer: CheckoutIndexer;
  let app: ReturnType<typeof createApp>;

  function mount(next: MemoryDb) {
    mem?.close();
    mem = next;
    deps = { config, db: next.db, client, bus, fetch: opts.fetch ?? fetch };
    indexer = new CheckoutIndexer({
      db: next.db,
      client,
      bus,
      address: config.CHECKOUT_ADDRESS,
      startBlock: config.CHECKOUT_DEPLOY_BLOCK,
      batchBlocks: config.INDEXER_BATCH_BLOCKS,
      minBatchBlocks: config.INDEXER_MIN_BATCH_BLOCKS,
      maxBackoffMs: config.INDEXER_MAX_BACKOFF_MS,
      confirmations: config.INDEXER_CONFIRMATIONS,
      pollMs: config.INDEXER_POLL_MS,
    });
    app = createApp(deps);
  }

  async function refresh() {
    if (!opts.store) {
      if (!mem) mount(openMemoryDb());
      return;
    }
    const current = await opts.store.version();
    if (mem && current === version) return;
    const snap = current ? await opts.store.load() : null;
    mount(openMemoryDb(snap?.bytes));
    version = snap?.version ?? null;
  }

  async function persist(): Promise<boolean> {
    if (!opts.store || !mem) return true;
    const next = await opts.store.save(mem.serialize(), version);
    if (next === null) {
      version = "\0stale";
      return false;
    }
    version = next;
    return true;
  }

  async function maybeSync(path: string, force = false) {
    if (!force && (Date.now() - lastSync < syncInterval || !SYNC_PATHS.some((r) => r.test(path)))) return;
    lastSync = Date.now();
    try {
      await indexer.syncOnce(syncMaxBlocks);
    } catch (e) {
      console.error("indexer:", e instanceof Error ? e.message : e);
    }
  }

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (basePath && url.pathname.startsWith(basePath)) url.pathname = url.pathname.slice(basePath.length) || "/";
    const path = url.pathname;
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
    const build = () => new Request(url, { method: request.method, headers: request.headers, body, signal: request.signal });

    if (path === "/feed/live") {
      return new Response(JSON.stringify({ error: "Live streaming is not available here; poll /feed/recent" }), {
        status: 501,
        headers: { "content-type": "application/json" },
      });
    }

    if (path === "/cron/index") {
      const secret = (opts.env ?? process.env).CRON_SECRET;
      if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    return mutex.run(async () => {
      for (let attempt = 1; ; attempt++) {
        await refresh();
        const before = mem!.changes();
        await maybeSync(path, path === "/cron/index");
        const res =
          path === "/cron/index"
            ? Response.json({ lastIndexedBlock: indexer.lastIndexedBlock().toString() })
            : await app.fetch(build());
        if (mem!.changes() === before || (await persist())) return res;
        if (attempt >= MAX_ATTEMPTS) {
          return Response.json({ error: "Busy, please retry" }, { status: 503, headers: { "retry-after": "1" } });
        }
      }
    });
  }

  return { handle, config };
}
