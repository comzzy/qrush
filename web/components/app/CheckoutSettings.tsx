"use client";

import { useRef, useState } from "react";
import { motion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { upload } from "@vercel/blob/client";
import { api, getToken } from "@/lib/api";
import { errorText } from "@/lib/tx";
import type {
  BuyerFieldKey,
  BuyerFields,
  FieldMode,
  Fulfilment,
  Product,
  Shop,
} from "@/lib/types";
import { FIELD_KEYS } from "@/components/checkout/BuyerForm";
import { Notice, Spinner } from "@/components/ui";

const LABELS: Record<BuyerFieldKey, string> = {
  name: "Name",
  email: "Email",
  phone: "Phone / WhatsApp",
  address: "Address",
  schedule: "Date & time",
  note: "Note",
};
const MODES: { v: FieldMode; label: string }[] = [
  { v: "off", label: "Off" },
  { v: "optional", label: "Optional" },
  { v: "required", label: "Required" },
];
const NONE: BuyerFields = {
  name: "off",
  email: "off",
  phone: "off",
  address: "off",
  schedule: "off",
  note: "off",
};
/** Same starting points as the server. The seller can change any of them. */
export const DEFAULT_FIELDS: Record<Fulfilment, BuyerFields> = {
  pickup: { ...NONE, name: "optional", note: "optional" },
  shipping: {
    ...NONE,
    name: "required",
    phone: "required",
    address: "required",
    email: "optional",
    note: "optional",
  },
  service: {
    ...NONE,
    name: "required",
    phone: "required",
    schedule: "required",
    note: "optional",
  },
  digital: { ...NONE, email: "optional" },
};
const TYPES: { v: Fulfilment; label: string; hint: string }[] = [
  {
    v: "pickup",
    label: "In person",
    hint: "Shops, food, salons. Buyer shows a code.",
  },
  {
    v: "shipping",
    label: "Delivery",
    hint: "Buyer gives an address. You ship it.",
  },
  {
    v: "service",
    label: "Booking",
    hint: "Buyer picks a time. You confirm it.",
  },
  {
    v: "digital",
    label: "Digital",
    hint: "A file or link, sent right after payment.",
  },
];
const MAX_BYTES = 50 * 1024 * 1024;

export function FieldPicker({
  value,
  onChange,
  disabled,
  idPrefix,
}: {
  value: BuyerFields;
  onChange: (v: BuyerFields) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  return (
    <div className="space-y-2">
      {FIELD_KEYS.map((k) => (
        <div
          key={k}
          className="flex flex-wrap items-center justify-between gap-2"
        >
          <span className="text-sm font-semibold" id={`${idPrefix}-${k}`}>
            {LABELS[k]}
          </span>
          <div
            role="radiogroup"
            aria-labelledby={`${idPrefix}-${k}`}
            className="flex rounded-full border-2 border-ink bg-white p-0.5"
          >
            {MODES.map((m) => (
              <button
                key={m.v}
                type="button"
                role="radio"
                aria-checked={(value[k] ?? "off") === m.v}
                disabled={disabled}
                onClick={() => onChange({ ...value, [k]: m.v })}
                data-testid={`${idPrefix}-${k}-${m.v}`}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${(value[k] ?? "off") === m.v ? (m.v === "required" ? "bg-pink text-ink" : m.v === "optional" ? "bg-sun" : "bg-ink text-cream") : "text-ink-soft"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Shop-wide defaults: what every buyer is asked at checkout. */
export function ShopFieldsCard({ shop }: { shop: Shop }) {
  const qc = useQueryClient();
  const [value, setValue] = useState<BuyerFields>(shop.buyerFields ?? NONE);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(
    null,
  );
  const save = async (next: BuyerFields) => {
    setValue(next);
    setBusy(true);
    setMsg(null);
    try {
      await api(`/shops/${shop.id}`, {
        method: "PATCH",
        json: { buyerFields: next },
      });
      await qc.invalidateQueries({ queryKey: ["shops"] });
      setMsg({ tone: "ok", text: "Saved" });
    } catch (e) {
      setMsg({ tone: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card p-5" data-testid="shop-fields">
      <h3 className="text-lg font-bold">Ask buyers for</h3>
      <p className="mt-1 mb-4 text-sm text-ink-soft">
        Shown on every pay page for this shop. Only you see the answers, next to
        each payment.
      </p>
      <FieldPicker
        value={value}
        onChange={save}
        disabled={busy}
        idPrefix="shop-field"
      />
      <div className="mt-3 min-h-6 text-sm">
        {busy ? (
          <span className="text-ink-soft">
            <Spinner /> Saving…
          </span>
        ) : msg ? (
          <span
            className={msg.tone === "ok" ? "text-ink-soft" : "text-pink-deep"}
          >
            {msg.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Per-product extras: more buyer fields, and the file or link the buyer gets after paying. */
export function ProductExtras({
  shop,
  product,
}: {
  shop: Shop;
  product: Product;
}) {
  const qc = useQueryClient();
  const [type, setType] = useState<Fulfilment | null>(
    product.fulfilment ?? (product.delivery ? "digital" : null),
  );
  const [fields, setFields] = useState<BuyerFields>({
    ...NONE,
    ...(product.buyerFields ?? (type ? DEFAULT_FIELDS[type] : NONE)),
  });
  const [rights, setRights] = useState(Boolean(product.delivery));
  const [url, setUrl] = useState(
    product.delivery?.kind === "url" ? (product.delivery.url ?? "") : "",
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["products", shop.id] });
  const base = `/shops/${shop.id}/products/${product.id}`;

  const run = async (what: string, fn: () => Promise<unknown>) => {
    setBusy(what);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const saveFields = (next: BuyerFields) => {
    setFields(next);
    void run("fields", () =>
      api(base, { method: "PATCH", json: { buyerFields: next } }),
    );
  };

  const pickType = (next: Fulfilment) => {
    setType(next);
    const nextFields = DEFAULT_FIELDS[next];
    setFields(nextFields);
    void run("type", () =>
      api(base, {
        method: "PATCH",
        json: { fulfilment: next, buyerFields: nextFields },
      }),
    );
  };

  const uploadFile = (file: File) =>
    run("file", async () => {
      if (!rights)
        throw new Error(
          "Tick the box to confirm you own the rights to sell this file",
        );
      if (file.size > MAX_BYTES) throw new Error("Files can be up to 50 MB");
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-120) || "file";
      const blob = await upload(
        `deliveries/${shop.id}/${product.id}/${safe}`,
        file,
        {
          access: "private",
          handleUploadUrl: `/api${base}/upload`,
          headers: { authorization: `Bearer ${getToken() ?? ""}` },
          multipart: file.size > 8 * 1024 * 1024,
          contentType: file.type || undefined,
          onUploadProgress: (p) => setProgress(p.percentage),
        },
      );
      await api(`${base}/delivery`, {
        method: "PUT",
        json: {
          kind: "file",
          pathname: blob.pathname,
          fileName: file.name.slice(0, 200),
          rightsConfirmed: true,
        },
      });
      if (fileInput.current) fileInput.current.value = "";
    });

  const d = product.delivery;
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="w-full overflow-hidden"
      data-testid="product-extras"
    >
      <div className="mt-1 border-t-2 border-dashed border-ink/20 pt-3">
        <p className="text-sm font-bold" id={`type-${product.id}`}>
          How does the buyer get it?
        </p>
        <div
          role="radiogroup"
          aria-labelledby={`type-${product.id}`}
          className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4"
        >
          {TYPES.map((t) => (
            <button
              key={t.v}
              type="button"
              role="radio"
              aria-checked={type === t.v}
              disabled={Boolean(busy)}
              onClick={() => pickType(t.v)}
              data-testid={`fulfilment-${t.v}`}
              className={`min-w-0 rounded-2xl border-2 border-ink p-2 text-left transition ${type === t.v ? "bg-sun shadow-[3px_3px_0_#161616]" : "bg-white"}`}
            >
              <span className="block text-sm font-bold">{t.label}</span>
              <span className="block text-xs text-ink-soft">{t.hint}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {(type === "digital" || d) && (
          <div className="min-w-0">
            <p className="text-sm font-bold">Instant delivery</p>
            <p className="mb-2 text-xs text-ink-soft">
              Upload an ebook (PDF or EPUB) or any file. Buyers can download it,
              and read PDFs in the browser, once their payment confirms. Each
              PDF copy is stamped with the buyer&apos;s name and order code.
            </p>
            {d ? (
              <div
                className="space-y-1 rounded-xl bg-white p-2 text-sm"
                data-testid="delivery-current"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    {d.kind === "file"
                      ? `File: ${d.fileName}`
                      : `Link: ${d.url}`}
                  </span>
                  <button
                    type="button"
                    className="btn btn-cream !px-3 !py-1 text-xs"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      run("remove", () =>
                        api(`${base}/delivery`, { method: "DELETE" }),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
                {d.sha256 && (
                  <p
                    className="text-xs text-ink-soft"
                    data-testid="delivery-proof"
                  >
                    Original upload{" "}
                    {d.firstUploadedAt
                      ? new Date(d.firstUploadedAt).toLocaleString()
                      : ""}
                    .{" "}
                    <a
                      className="underline"
                      href={`/api/files/${d.sha256}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Proof of ownership
                    </a>
                    <span className="block break-all font-mono">
                      SHA-256 {d.sha256}
                    </span>
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-ink-soft">Nothing attached yet.</p>
            )}
            <label className="mt-2 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={rights}
                onChange={(e) => setRights(e.target.checked)}
                data-testid="delivery-rights"
              />
              <span>I own the rights to sell this</span>
            </label>
            <input
              ref={fileInput}
              id={`file-${product.id}`}
              type="file"
              className="sr-only"
              disabled={!rights}
              onChange={(e) =>
                e.target.files?.[0] && uploadFile(e.target.files[0])
              }
              data-testid="delivery-file"
            />
            <label
              htmlFor={`file-${product.id}`}
              aria-disabled={!rights}
              className={`btn btn-sun mt-2 w-full cursor-pointer !py-1.5 text-sm ${busy || !rights ? "pointer-events-none opacity-60" : ""}`}
            >
              {busy === "file" ? (
                <>
                  <Spinner /> Uploading
                  {progress !== null ? ` ${Math.round(progress)}%` : "…"}
                </>
              ) : d?.kind === "file" ? (
                "Replace file (up to 50 MB)"
              ) : (
                "Upload a file (up to 50 MB)"
              )}
            </label>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!rights)
                  return setError(
                    "Tick the box to confirm you own the rights to sell this",
                  );
                void run("url", () =>
                  api(`${base}/delivery`, {
                    method: "PUT",
                    json: { kind: "url", url: url.trim() },
                  }),
                );
              }}
            >
              <input
                className="field min-w-0 !py-1.5 text-sm"
                type="url"
                required
                placeholder="or paste a link: https://…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                aria-label="Delivery link"
                data-testid="delivery-url"
              />
              <button
                type="submit"
                className="btn btn-cream !px-3 !py-1.5 text-sm"
                disabled={Boolean(busy)}
              >
                {busy === "url" ? <Spinner /> : "Save"}
              </button>
            </form>
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-bold">Ask the buyer for</p>
          <p className="mb-2 text-xs text-ink-soft">
            Defaults suit the type you picked. Change any of them. Shop-wide
            settings still apply.
          </p>
          <FieldPicker
            value={fields}
            onChange={saveFields}
            disabled={busy === "fields"}
            idPrefix={`pf-${product.id.slice(0, 8)}`}
          />
        </div>
      </div>
      {error && (
        <div className="mt-2">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
    </motion.div>
  );
}
