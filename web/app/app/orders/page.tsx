"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { errorText } from "@/lib/tx";
import { BASESCAN, timeAgo } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { Fulfilment, Order } from "@/lib/types";
import {
  FLOWS,
  FULFILMENT_LABEL,
  StatusSteps,
} from "@/components/checkout/OrderTracker";
import { BuyerDetailsLine } from "@/components/app/BuyerDetailsLine";
import { Notice, Skeleton, Spinner } from "@/components/ui";

type Report = {
  id: number;
  invoiceKey: string;
  reason: string;
  details: string | null;
  contact: string | null;
  status: string;
  createdAt: string;
};
const TYPES: (Fulfilment | "")[] = [
  "",
  "pickup",
  "shipping",
  "service",
  "digital",
];

export default function OrdersPage() {
  const { me } = useSession();
  const [status, setStatus] = useState("");
  const [type, setType] = useState<Fulfilment | "">("");
  const [found, setFound] = useState<Order | null>(null);
  const qs = new URLSearchParams({
    ...(status && { status }),
    ...(type && { fulfilment: type }),
  }).toString();
  const { data, isLoading } = useQuery({
    queryKey: ["orders", me?.address, qs],
    queryFn: () => api<Order[]>(`/orders/mine${qs ? `?${qs}` : ""}`),
    enabled: Boolean(me),
    refetchInterval: 20_000,
  });
  const reports = useQuery({
    queryKey: ["reports", me?.address],
    queryFn: () => api<Report[]>("/orders/mine/reports"),
    enabled: Boolean(me),
  });
  const statuses = Array.from(
    new Set(
      (type ? FLOWS[type] : Object.values(FLOWS).flat()).map((s) => s.key),
    ),
  );

  return (
    <div className="space-y-5">
      <CodeLookup onFound={setFound} />
      <AnimatePresence>
        {found && (
          <motion.div
            key={found.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <OrderCard order={found} highlight onChange={setFound} />
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="flex flex-wrap items-center gap-2"
        data-testid="order-filters"
      >
        <select
          className="field !w-auto !py-1.5 text-sm"
          value={type}
          onChange={(e) => {
            setType(e.target.value as Fulfilment | "");
            setStatus("");
          }}
          aria-label="Filter by type"
          data-testid="filter-type"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t ? FULFILMENT_LABEL[t] : "All types"}
            </option>
          ))}
        </select>
        <select
          className="field !w-auto !py-1.5 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
          data-testid="filter-status"
        >
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <Skeleton className="h-48" />
      ) : !data?.length ? (
        <div
          className="card p-8 text-center text-ink-soft"
          data-testid="orders-empty"
        >
          Paid orders show up here with the buyer&apos;s details and a status
          you can update.
        </div>
      ) : (
        <ul className="space-y-3" data-testid="orders-list">
          {data.map((o) => (
            <li key={o.id}>
              <OrderCard order={o} />
            </li>
          ))}
        </ul>
      )}

      {Boolean(reports.data?.length) && (
        <div className="card p-5" data-testid="reports">
          <h3 className="text-lg font-bold">Reports about your products</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {reports.data!.map((r) => (
              <li key={r.id} className="rounded-xl bg-cream px-3 py-2">
                <span className="font-semibold capitalize">{r.reason}</span> ·{" "}
                <span className="text-ink-soft">
                  {timeAgo(r.createdAt)} · link {r.invoiceKey}
                </span>
                {r.details && <p className="break-words">{r.details}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CodeLookup({ onFound }: { onFound: (o: Order) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  const lookup = async (value: string) => {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      onFound(
        await api<Order>(
          `/orders/mine/by-code/${encodeURIComponent(value.trim())}`,
        ),
      );
      setCode("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get("code");
    if (fromLink) void Promise.resolve().then(() => lookup(fromLink));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startScan = () => {
    if (!("BarcodeDetector" in window) || !navigator.mediaDevices)
      return setError(
        "This browser cannot scan QR codes. Type the code instead.",
      );
    setScanning((v) => !v);
  };

  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (!video.current || stop) return;
        video.current.srcObject = stream;
        await video.current.play();
        // BarcodeDetector is not in the TS DOM lib yet.
        const Detector = (
          window as unknown as {
            BarcodeDetector: new (o: object) => {
              detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
            };
          }
        ).BarcodeDetector;
        const detector = new Detector({ formats: ["qr_code"] });
        const tick = async () => {
          if (stop || !video.current) return;
          const hits = await detector.detect(video.current).catch(() => []);
          if (hits[0]?.rawValue) {
            setScanning(false);
            void lookup(hits[0].rawValue);
            return;
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setError("Camera not available. Type the code instead.");
        setScanning(false);
      }
    })();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  return (
    <div className="card p-5" data-testid="code-lookup">
      <h3 className="text-lg font-bold">Serve a customer</h3>
      <p className="mt-1 text-sm text-ink-soft">
        Type the order code from their receipt, or scan its QR.
      </p>
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void lookup(code);
        }}
      >
        <input
          className="field min-w-0 flex-1 font-mono uppercase"
          placeholder="e.g. 7KQ2M9X"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label="Order code"
          maxLength={24}
          data-testid="code-input"
        />
        <button
          type="submit"
          className="btn btn-sun"
          disabled={busy}
          data-testid="code-find"
        >
          {busy ? <Spinner /> : "Find"}
        </button>
        (
        <button
          type="button"
          className="btn btn-cream"
          onClick={startScan}
          data-testid="code-scan"
        >
          {scanning ? "Stop" : "Scan"}
        </button>
      </form>
      {scanning && (
        <video
          ref={video}
          className="mt-3 aspect-square w-full max-w-xs rounded-2xl border-2 border-ink object-cover"
          muted
          playsInline
        />
      )}
      {error && (
        <div className="mt-2">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
    </div>
  );
}

function OrderCard({
  order,
  highlight,
  onChange,
}: {
  order: Order;
  highlight?: boolean;
  onChange?: (o: Order) => void;
}) {
  const qc = useQueryClient();
  const [tracking, setTracking] = useState(order.tracking ?? "");
  const [note, setNote] = useState(order.sellerNote ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const flow = FLOWS[order.fulfilment];
  const at = flow.findIndex((s) => s.key === order.status);

  const save = async (what: string, json: Record<string, string | null>) => {
    setBusy(what);
    setError(null);
    try {
      const next = await api<Order>(`/orders/mine/${order.id}`, {
        method: "PATCH",
        json,
      });
      onChange?.(next);
      await qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className={`card p-4 ${highlight ? "ring-4 ring-sun" : ""}`}
      data-testid="order-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p
            className="font-mono text-lg font-bold"
            data-testid="order-card-code"
          >
            {order.code}
          </p>
          <p className="text-xs text-ink-soft">
            {FULFILMENT_LABEL[order.fulfilment]} · paid{" "}
            {order.paidAt ? timeAgo(order.paidAt) : "—"}
            {order.receiptId ? ` · receipt #${order.receiptId}` : ""}
          </p>
        </div>
        {order.txHash && (
          <a
            className="text-sm underline"
            href={`${BASESCAN}/tx/${order.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            Basescan
          </a>
        )}
      </div>
      <div className="mt-3">
        <StatusSteps fulfilment={order.fulfilment} status={order.status} />
      </div>
      <BuyerDetailsLine d={order.details} />
      <div className="mt-3 flex flex-wrap gap-2">
        {flow.slice(1).map((s, i) => (
          <button
            key={s.key}
            type="button"
            disabled={Boolean(busy) || i + 1 <= at}
            onClick={() => save(s.key, { status: s.key })}
            className={`btn !px-3 !py-1.5 text-sm ${i + 1 === at + 1 ? "btn-sun" : "btn-cream"} disabled:opacity-50`}
            data-testid={`mark-${s.key}`}
          >
            {busy === s.key ? <Spinner /> : `Mark ${s.label.toLowerCase()}`}
          </button>
        ))}
      </div>
      <form
        className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          void save("notes", {
            tracking: tracking.trim() || null,
            sellerNote: note.trim() || null,
          });
        }}
      >
        {order.fulfilment === "shipping" && (
          <input
            className="field min-w-0 !py-1.5 text-sm"
            placeholder="Tracking number or link"
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            maxLength={300}
            aria-label="Tracking"
            data-testid="order-tracking"
          />
        )}
        <input
          className={`field min-w-0 !py-1.5 text-sm ${order.fulfilment === "shipping" ? "" : "sm:col-span-2"}`}
          placeholder="Note for the buyer"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          aria-label="Note for the buyer"
          data-testid="order-note"
        />
        <button
          type="submit"
          className="btn btn-cream !py-1.5 text-sm"
          disabled={Boolean(busy)}
        >
          {busy === "notes" ? <Spinner /> : "Save"}
        </button>
      </form>
      {error && (
        <div className="mt-2">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
    </div>
  );
}
