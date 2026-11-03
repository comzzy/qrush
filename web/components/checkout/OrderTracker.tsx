"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { api, ApiError } from "@/lib/api";
import type { Fulfilment, OrderStatus } from "@/lib/types";
import { CopyButton, Spinner } from "@/components/ui";

export const FLOWS: Record<Fulfilment, { key: string; label: string }[]> = {
  pickup: [
    { key: "paid", label: "Paid" },
    { key: "collected", label: "Collected" },
  ],
  shipping: [
    { key: "paid", label: "Paid" },
    { key: "shipped", label: "Shipped" },
    { key: "delivered", label: "Delivered" },
  ],
  service: [
    { key: "paid", label: "Paid" },
    { key: "confirmed", label: "Confirmed" },
    { key: "done", label: "Done" },
  ],
  digital: [
    { key: "paid", label: "Paid" },
    { key: "delivered", label: "Delivered" },
  ],
};

export const FULFILMENT_LABEL: Record<Fulfilment, string> = {
  pickup: "In person / pickup",
  shipping: "Delivery / shipping",
  service: "Service / booking",
  digital: "Digital",
};

const NEXT_STEP: Record<Fulfilment, string> = {
  pickup: "Show this code or QR to the seller when you collect.",
  shipping:
    "The seller will ship to the address you gave. Check back here for updates.",
  service: "The seller will confirm your booking. Check back here for updates.",
  digital: "Your download is below.",
};

export const qrValue = (code: string) => `QRUSH-${code}`;

export function StatusSteps({
  fulfilment,
  status,
}: {
  fulfilment: Fulfilment;
  status: string;
}) {
  const steps = FLOWS[fulfilment];
  const at = Math.max(
    0,
    steps.findIndex((s) => s.key === status),
  );
  return (
    <ol className="flex items-center gap-1" aria-label="Order progress">
      {steps.map((s, i) => (
        <li key={s.key} className="flex min-w-0 flex-1 items-center gap-1">
          <motion.span
            initial={false}
            animate={{ scale: i === at ? 1.08 : 1 }}
            className={`truncate rounded-full border-2 border-ink px-2 py-0.5 text-center text-xs font-bold ${i <= at ? "bg-mint" : "bg-white text-ink-soft"}`}
            aria-current={i === at ? "step" : undefined}
          >
            {s.label}
          </motion.span>
          {i < steps.length - 1 && (
            <span
              className={`h-0.5 min-w-2 flex-1 ${i < at ? "bg-ink" : "bg-ink/20"}`}
            />
          )}
        </li>
      ))}
    </ol>
  );
}

/** The buyer's order code, QR and progress. Reads by the private order id kept in this browser. */
export function OrderTracker({
  orderId,
  receiptId,
}: {
  orderId: string;
  receiptId?: number;
}) {
  const [order, setOrder] = useState<OrderStatus | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      for (let i = 0; !stop; i++) {
        try {
          const o = await api<OrderStatus>(`/orders/${orderId}`, {
            auth: false,
          });
          if (stop) return;
          setOrder(o);
          await new Promise((r) => setTimeout(r, 15_000));
        } catch (e) {
          if (e instanceof ApiError && e.status === 404 && i > 40)
            return setGone(true);
          await new Promise((r) => setTimeout(r, 2500));
        }
      }
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [orderId]);

  if (gone) return null;
  if (!order) {
    return (
      <div
        className="rounded-2xl border-2 border-ink bg-white p-4 text-left text-sm text-ink-soft"
        data-testid="order-tracker"
      >
        <Spinner /> Getting your order code…
      </div>
    );
  }
  const link =
    typeof window !== "undefined" && (order.receiptId ?? receiptId)
      ? `${window.location.origin}/receipt/${order.receiptId ?? receiptId}?o=${encodeURIComponent(orderId)}`
      : "";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border-2 border-ink bg-white p-4 text-left"
      data-testid="order-tracker"
    >
      <div className="flex flex-wrap items-center gap-4">
        <div className="shrink-0 rounded-xl border-2 border-ink bg-white p-2">
          <QRCodeSVG
            value={qrValue(order.code)}
            size={96}
            aria-label={`QR for order ${order.code}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-ink-soft">Order code</p>
          <p
            className="font-mono text-2xl font-bold tracking-widest break-all"
            data-testid="order-code"
          >
            {order.code}
          </p>
          <p className="text-xs text-ink-soft">
            {FULFILMENT_LABEL[order.fulfilment]}
          </p>
        </div>
      </div>
      <div className="mt-3">
        <StatusSteps fulfilment={order.fulfilment} status={order.status} />
      </div>
      <p className="mt-2 text-sm" data-testid="order-status">
        {NEXT_STEP[order.fulfilment]}
      </p>
      {order.schedule && (
        <p className="mt-1 text-sm">
          Requested time: <b>{formatSchedule(order.schedule)}</b>
        </p>
      )}
      {order.tracking && (
        <p className="mt-1 text-sm break-words">
          Tracking: <b>{order.tracking}</b>
        </p>
      )}
      {order.sellerNote && (
        <p className="mt-1 rounded-xl bg-cream p-2 text-sm break-words">
          From the seller: {order.sellerNote}
        </p>
      )}
      {link && (
        <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
          <CopyButton value={link} label="Copy tracking link" />
          <span className="text-xs text-ink-soft">
            Keep it to check progress later.
          </span>
        </div>
      )}
    </motion.div>
  );
}

export function formatSchedule(v: string) {
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
