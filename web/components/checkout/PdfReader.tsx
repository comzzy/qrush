"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Notice, Spinner } from "@/components/ui";

/**
 * Reads the buyer's stamped copy in the page. The file is streamed from our own API,
 * so it works on phones whose browsers will not show PDFs inline.
 */
export function PdfReader({
  url,
  title,
  onClose,
}: {
  url: string;
  title: string;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let live = true;
    let loading: { destroy: () => Promise<void> } | null = null;
    (async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "Could not open the file");
        }
        const data = new Uint8Array(await res.arrayBuffer());
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const task = pdfjs.getDocument({ data });
        loading = task;
        const loaded = await task.promise;
        if (live) setDoc(loaded);
      } catch (e) {
        if (live)
          setError(e instanceof Error ? e.message : "Could not open the file");
      }
    })();
    return () => {
      live = false;
      void loading?.destroy();
    };
  }, [url]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!doc || !canvas.current || !width) return;
    let task: { cancel: () => void } | null = null;
    let live = true;
    (async () => {
      const p = await doc.getPage(page);
      if (!live || !canvas.current) return;
      const base = p.getViewport({ scale: 1 });
      const scale = width / base.width;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const vp = p.getViewport({ scale: scale * ratio });
      const c = canvas.current;
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      c.style.width = `${Math.floor(vp.width / ratio)}px`;
      c.style.height = `${Math.floor(vp.height / ratio)}px`;
      const r = p.render({ canvas: c, viewport: vp });
      task = r;
      await r.promise.catch(() => undefined);
    })();
    return () => {
      live = false;
      task?.cancel();
    };
  }, [doc, page, width]);

  const pages = doc?.numPages ?? 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 rounded-2xl border-2 border-ink bg-cream p-2 sm:p-3"
      data-testid="pdf-reader"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-bold">{title}</p>
        <button
          type="button"
          className="btn btn-cream !px-3 !py-1 text-sm"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <div ref={box} className="w-full overflow-hidden rounded-xl bg-white">
        {error ? (
          <div className="p-3">
            <Notice tone="error">{error}</Notice>
          </div>
        ) : !doc ? (
          <p className="p-6 text-center text-sm text-ink-soft">
            <Spinner /> Opening your copy…
          </p>
        ) : null}
        <canvas
          ref={canvas}
          className={doc ? "block select-none" : "hidden"}
          aria-label={`${title}, page ${page} of ${pages}`}
        />
      </div>
      {pages > 0 && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            className="btn btn-cream !px-3 !py-1 text-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            data-testid="reader-prev"
          >
            ← Prev
          </button>
          <span className="text-xs text-ink-soft" data-testid="reader-page">
            Page {page} of {pages}
          </span>
          <button
            type="button"
            className="btn btn-cream !px-3 !py-1 text-sm"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
            data-testid="reader-next"
          >
            Next →
          </button>
        </div>
      )}
    </motion.div>
  );
}
