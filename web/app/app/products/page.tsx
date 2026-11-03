"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useProducts } from "@/lib/hooks";
import { errorText } from "@/lib/tx";
import { usd } from "@/lib/format";
import type { Product, Shop } from "@/lib/types";
import { NeedShop } from "@/components/app/NeedShop";
import { Notice, Skeleton, Spinner } from "@/components/ui";
import { ReceiptSticker } from "@/components/art/Stickers";

export default function ProductsPage() {
  return <NeedShop>{(shop) => <Products shop={shop} />}</NeedShop>;
}

function Products({ shop }: { shop: Shop }) {
  const { data, isLoading } = useProducts(shop.id);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="card min-w-0 p-5 sm:p-6">
        <h2 className="text-xl font-bold">Products</h2>
        {isLoading ? (
          <Skeleton className="mt-4 h-40" />
        ) : data?.length ? (
          <ul className="mt-4 space-y-2">
            <AnimatePresence initial={false}>
              {data.map((p) => <ProductRow key={p.id} shop={shop} product={p} />)}
            </AnimatePresence>
          </ul>
        ) : (
          <div className="mt-6 flex flex-col items-center gap-3 py-6 text-center text-ink-soft">
            <ReceiptSticker size={80} />
            <p>No products yet. Add your first one, or upload a photo of your menu or price list.</p>
          </div>
        )}
      </div>
      <div className="space-y-6">
        <AddProduct shop={shop} />
        <PhotoSetup shop={shop} />
      </div>
    </div>
  );
}

function ProductRow({ shop, product }: { shop: Shop; product: Product }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const mutate = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["products", shop.id] });
    } finally {
      setBusy(false);
    }
  };
  return (
    <motion.li layout initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} className={`flex flex-wrap items-center gap-3 rounded-2xl border-2 border-ink bg-cream p-3 ${product.active ? "" : "opacity-60"}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{product.name}</p>
        {product.description && <p className="truncate text-sm text-ink-soft">{product.description}</p>}
      </div>
      <span className="font-bold">{usd(product.price)}</span>
      <div className="flex gap-2">
        <button type="button" disabled={busy} className="btn btn-cream !px-3 !py-1 text-sm" onClick={() => mutate(() => api(`/shops/${shop.id}/products/${product.id}`, { method: "PATCH", json: { active: !product.active } }))}>
          {product.active ? "Hide" : "Show"}
        </button>
        <button type="button" disabled={busy} aria-label={`Delete ${product.name}`} className="btn btn-pink !px-3 !py-1 text-sm" onClick={() => mutate(() => api(`/shops/${shop.id}/products/${product.id}`, { method: "DELETE" }))}>
          Delete
        </button>
      </div>
    </motion.li>
  );
}

function AddProduct({ shop }: { shop: Shop }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/shops/${shop.id}/products`, { json: { name: name.trim(), price, description: description.trim() || null } });
      setName("");
      setPrice("");
      setDescription("");
      await qc.invalidateQueries({ queryKey: ["products", shop.id] });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="card space-y-3 p-5">
      <h3 className="text-lg font-bold">Add a product</h3>
      <div>
        <label className="label" htmlFor="p-name">Name</label>
        <input id="p-name" className="field" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Iced latte" />
      </div>
      <div>
        <label className="label" htmlFor="p-price">Price in USDC</label>
        <input id="p-price" className="field" required inputMode="decimal" pattern="^\d+(\.\d{1,6})?$" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="4.50" />
      </div>
      <div>
        <label className="label" htmlFor="p-desc">Description (optional)</label>
        <input id="p-desc" className="field" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <button type="submit" className="btn btn-ink w-full" disabled={busy}>{busy ? <Spinner /> : "Add product"}</button>
    </form>
  );
}

function PhotoSetup({ shop }: { shop: Shop }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const upload = async (file: File) => {
    setBusy(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.set("image", await toPngOrJpeg(file));
      form.set("shopId", shop.id);
      const res = await api<{ created: Product[]; products: unknown[]; requiresCurrencyConversion: boolean; currency: string | null }>("/ai/shop-setup", { method: "POST", body: form });
      if (res.requiresCurrencyConversion) setMsg({ tone: "info", text: `Prices are in ${res.currency}. Add them manually in USDC.` });
      else setMsg({ tone: "ok", text: `Added ${res.created.length} product${res.created.length === 1 ? "" : "s"} from your photo.` });
      await qc.invalidateQueries({ queryKey: ["products", shop.id] });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof ApiError && e.status === 503 ? "Photo import is not switched on for this server yet. Add products by hand for now." : errorText(e) });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div className="card bg-sky/40 p-5">
      <h3 className="text-lg font-bold">Import from a photo</h3>
      <p className="mt-1 text-sm text-ink-soft">Snap your menu or price board. QRush reads the item names and prices and adds them for you to check.</p>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif" className="sr-only" id="menu-photo" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <label htmlFor="menu-photo" className={`btn btn-cream mt-4 w-full cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
        {busy ? <><Spinner /> Reading your photo…</> : "Choose a photo"}
      </label>
      {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
    </div>
  );
}

/** The vision model takes PNG or JPEG only, so anything else (WebP, GIF, HEIC where the browser can decode it) is re-encoded as JPEG. */
async function toPngOrJpeg(file: File): Promise<File> {
  if (file.type === "image/png" || file.type === "image/jpeg") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This browser can't read that image. Save it as JPEG or PNG and try again.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not convert the image");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  if (!blob) throw new Error("Could not convert the image");
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}
