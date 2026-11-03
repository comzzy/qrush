import { EventEmitter } from "node:events";

export type PaymentEvent = {
  receiptId: number;
  invoiceKey: string;
  shopId: string | null;
  seller: string;
  buyer: string;
  tokenIn: string;
  amountIn: string;
  grossAmount: string;
  discount: string;
  netAmount: string;
  purchaseNumber: number;
  txHash: string;
  blockNumber: number;
  blockTimestamp: number;
  geo: { latitude: number | null; longitude: number | null; city: string | null; country: string | null; source: string | null };
  payouts: { recipient: string; amount: string }[];
};

export class PaymentBus extends EventEmitter<{ payment: [PaymentEvent] }> {
  constructor() {
    super();
    this.setMaxListeners(0);
  }
}
