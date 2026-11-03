import { and, eq } from "drizzle-orm";
import { getAddress, parseEventLogs, type Address, type Log, type PublicClient } from "viem";
import { qrushCheckoutAbi } from "../contracts/artifact.js";
import type { Db } from "../db/client.js";
import { indexerState, invoices, payments, payouts, sellers, shops } from "../db/schema.js";
import type { PaymentBus, PaymentEvent } from "../events.js";

const STATE_ID = "qrush-checkout";

export type IndexerOptions = {
  db: Db;
  client: PublicClient;
  bus: PaymentBus;
  address: Address;
  startBlock: bigint;
  /** Largest eth_getLogs range tried; shrinks on range/rate-limit errors and grows back on success. */
  batchBlocks: bigint;
  minBatchBlocks?: bigint;
  maxBackoffMs?: number;
  confirmations: bigint;
  pollMs: number;
  onError?: (error: unknown) => void;
};

export class CheckoutIndexer {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopped = true;
  private blockTimes = new Map<bigint, number>();
  private window: bigint;
  private failures = 0;
  private streak = 0;

  /** Current adaptive getLogs range (for diagnostics). */
  get currentBatchBlocks() {
    return this.window;
  }

  constructor(private readonly opts: IndexerOptions) {
    this.window = opts.batchBlocks;
  }

  start() {
    this.stopped = false;
    const loop = async () => {
      if (this.stopped) return;
      let delay = this.opts.pollMs;
      try {
        await this.syncOnce();
        this.failures = 0;
      } catch (error) {
        this.failures++;
        delay = Math.min(this.opts.pollMs * 2 ** this.failures, this.opts.maxBackoffMs ?? 30_000);
        this.opts.onError?.(error);
      }
      if (!this.stopped) this.timer = setTimeout(loop, delay);
    };
    void loop();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  lastIndexedBlock(): bigint {
    const row = this.opts.db.select().from(indexerState).where(eq(indexerState.id, STATE_ID)).get();
    return row ? BigInt(row.lastBlock) : this.opts.startBlock - 1n;
  }

  /** Index every confirmed block not yet processed. Returns the last indexed block. */
  async syncOnce(maxBlocks?: bigint): Promise<bigint> {
    if (this.running) return this.lastIndexedBlock();
    this.running = true;
    try {
      let from = this.lastIndexedBlock() + 1n;
      const tip = (await this.opts.client.getBlockNumber()) - this.opts.confirmations;
      // Serverless callers bound the work per request; the next call resumes where this one stopped.
      const head = maxBlocks !== undefined && from + maxBlocks - 1n < tip ? from + maxBlocks - 1n : tip;
      while (from <= head) {
        const to = from + this.window - 1n < head ? from + this.window - 1n : head;
        let logs: Log[];
        try {
          logs = await this.opts.client.getLogs({ address: this.opts.address, fromBlock: from, toBlock: to });
        } catch (error) {
          const min = this.opts.minBatchBlocks ?? 10n;
          // Range too large or rate limited on every endpoint: halve the range and retry; give up at the floor.
          if (this.window <= min) throw error;
          this.window = this.window / 2n > min ? this.window / 2n : min;
          this.streak = 0;
          await sleep(250);
          continue;
        }
        await this.processLogs(logs, to);
        from = to + 1n;
        // Probe a larger range again only after a run of successes, to avoid oscillating at a provider cap.
        if (this.window < this.opts.batchBlocks && ++this.streak >= 20) {
          this.streak = 0;
          const grown = this.window * 2n;
          this.window = grown > this.opts.batchBlocks ? this.opts.batchBlocks : grown;
        }
      }
      return this.lastIndexedBlock();
    } finally {
      this.running = false;
    }
  }

  private async blockTimestamp(blockNumber: bigint): Promise<number> {
    const cached = this.blockTimes.get(blockNumber);
    if (cached !== undefined) return cached;
    const block = await this.opts.client.getBlock({ blockNumber });
    const ts = Number(block.timestamp);
    this.blockTimes.set(blockNumber, ts);
    if (this.blockTimes.size > 1000) this.blockTimes.delete(this.blockTimes.keys().next().value!);
    return ts;
  }

  private async processLogs(rawLogs: Log[], toBlock: bigint) {
    const { db } = this.opts;
    const logs = parseEventLogs({ abi: qrushCheckoutAbi, logs: rawLogs, strict: true });
    logs.sort((a, b) =>
      a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
    );

    const timestamps = new Map<bigint, number>();
    for (const log of logs) {
      if (log.eventName === "PaymentReceived" && !timestamps.has(log.blockNumber)) {
        timestamps.set(log.blockNumber, await this.blockTimestamp(log.blockNumber));
      }
    }

    const emitted: PaymentEvent[] = [];
    db.transaction((tx) => {
      for (const log of logs) {
        const now = new Date();
        switch (log.eventName) {
          case "SellerRegistered": {
            const address = getAddress(log.args.seller);
            tx.insert(sellers)
              .values({ address, onchainRegistered: true, createdAt: now })
              .onConflictDoUpdate({ target: sellers.address, set: { onchainRegistered: true } })
              .run();
            break;
          }
          case "InvoiceCreated": {
            tx.update(invoices)
              .set({ status: "open", updatedAt: now })
              .where(and(eq(invoices.invoiceKey, log.args.invoiceId), eq(invoices.uses, 0)))
              .run();
            break;
          }
          case "InvoiceCancelled": {
            tx.update(invoices)
              .set({ status: "cancelled", updatedAt: now })
              .where(eq(invoices.invoiceKey, log.args.invoiceId))
              .run();
            break;
          }
          case "PaymentReceived": {
            const a = log.args;
            const receiptId = Number(a.receiptId);
            const invoice = tx.select().from(invoices).where(eq(invoices.invoiceKey, a.invoiceId)).get();
            const shop = invoice ? tx.select().from(shops).where(eq(shops.id, invoice.shopId)).get() : undefined;
            const shopHasGeo = shop?.latitude != null && shop?.longitude != null;
            const geo = shopHasGeo
              ? { latitude: shop!.latitude, longitude: shop!.longitude, city: shop!.city, country: shop!.country, source: "shop" as const }
              : invoice?.viewerLatitude != null
                ? {
                    latitude: invoice.viewerLatitude,
                    longitude: invoice.viewerLongitude,
                    city: invoice.viewerCity,
                    country: invoice.viewerCountry,
                    source: "request" as const,
                  }
                : { latitude: null, longitude: null, city: shop?.city ?? null, country: shop?.country ?? null, source: null };

            const inserted = tx
              .insert(payments)
              .values({
                receiptId,
                invoiceKey: a.invoiceId,
                seller: getAddress(a.seller),
                buyer: getAddress(a.buyer),
                tokenIn: getAddress(a.tokenIn),
                amountIn: a.amountIn.toString(),
                grossAmount: a.grossAmount.toString(),
                discount: a.discount.toString(),
                netAmount: a.netAmount.toString(),
                purchaseNumber: Number(a.purchaseNumber),
                txHash: log.transactionHash,
                blockNumber: Number(log.blockNumber),
                logIndex: log.logIndex,
                blockTimestamp: timestamps.get(log.blockNumber)!,
                latitude: geo.latitude,
                longitude: geo.longitude,
                city: geo.city,
                country: geo.country,
                geoSource: geo.source,
              })
              .onConflictDoNothing()
              .returning()
              .all();
            if (inserted.length === 0) break;

            if (invoice) {
              const uses = invoice.uses + 1;
              const completed = invoice.maxUses !== 0 && uses >= invoice.maxUses;
              tx.update(invoices)
                .set({ uses, status: completed ? "completed" : "open", updatedAt: now })
                .where(eq(invoices.id, invoice.id))
                .run();
            }
            const row = inserted[0]!;
            emitted.push({
              receiptId,
              invoiceKey: row.invoiceKey,
              shopId: invoice?.shopId ?? null,
              seller: row.seller,
              buyer: row.buyer,
              tokenIn: row.tokenIn,
              amountIn: row.amountIn,
              grossAmount: row.grossAmount,
              discount: row.discount,
              netAmount: row.netAmount,
              purchaseNumber: row.purchaseNumber,
              txHash: row.txHash,
              blockNumber: row.blockNumber,
              blockTimestamp: row.blockTimestamp,
              geo,
              payouts: [],
            });
            break;
          }
          case "PayoutSent": {
            const recipient = getAddress(log.args.recipient);
            const amount = log.args.amount.toString();
            tx.insert(payouts)
              .values({
                receiptId: Number(log.args.receiptId),
                recipient,
                amount,
                logIndex: log.logIndex,
                txHash: log.transactionHash,
              })
              .onConflictDoNothing()
              .run();
            emitted.find((e) => e.receiptId === Number(log.args.receiptId))?.payouts.push({ recipient, amount });
            break;
          }
          default:
            break;
        }
      }
      tx.insert(indexerState)
        .values({ id: STATE_ID, lastBlock: Number(toBlock) })
        .onConflictDoUpdate({ target: indexerState.id, set: { lastBlock: Number(toBlock) } })
        .run();
    });

    for (const event of emitted) this.opts.bus.emit("payment", event);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
