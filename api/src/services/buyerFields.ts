import { z } from "zod";
import type { BuyerFieldsRow, FieldMode, Fulfilment } from "../db/schema.js";

export const FIELD_KEYS = ["name", "email", "phone", "address", "schedule", "note"] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

export const NO_FIELDS: Required<BuyerFieldsRow> = { name: "off", email: "off", phone: "off", address: "off", schedule: "off", note: "off" };

/** Sensible starting points per kind of product. Sellers can change any of them. */
export const DEFAULT_FIELDS: Record<Fulfilment, Required<BuyerFieldsRow>> = {
  pickup: { ...NO_FIELDS, name: "optional", note: "optional" },
  shipping: { ...NO_FIELDS, name: "required", phone: "required", address: "required", email: "optional", note: "optional" },
  service: { ...NO_FIELDS, name: "required", phone: "required", schedule: "required", note: "optional" },
  digital: { ...NO_FIELDS, email: "optional" },
};

/** Fields a product asks for: its own choice, or the defaults for its type. */
export const productFields = (p: { buyerFields: BuyerFieldsRow | null; fulfilment: Fulfilment | null }) =>
  p.buyerFields ?? (p.fulfilment ? DEFAULT_FIELDS[p.fulfilment] : null);

/** One order follows one flow; anything physical wins over a download. */
export function orderFulfilment(types: (Fulfilment | null)[]): Fulfilment {
  for (const t of ["shipping", "service", "pickup"] as const) if (types.includes(t)) return t;
  return types.length && types.every((t) => t === "digital") ? "digital" : "pickup";
}

export const FLOWS: Record<Fulfilment, string[]> = {
  pickup: ["paid", "collected"],
  shipping: ["paid", "shipped", "delivered"],
  service: ["paid", "confirmed", "done"],
  digital: ["paid", "delivered"],
};
const RANK: Record<FieldMode, number> = { off: 0, optional: 1, required: 2 };

const mode = z.enum(["off", "optional", "required"]);
export const buyerFieldsInput = z.object({
  name: mode.default("off"),
  email: mode.default("off"),
  phone: mode.default("off"),
  address: mode.default("off"),
  schedule: mode.default("off"),
  note: mode.default("off"),
});

/** Strictest setting wins: the shop's defaults, raised by any product on the invoice that asks for more. */
export function mergeFields(...sets: (BuyerFieldsRow | null | undefined)[]): Required<BuyerFieldsRow> {
  const out: Required<BuyerFieldsRow> = { ...NO_FIELDS };
  for (const s of sets) {
    if (!s) continue;
    for (const k of FIELD_KEYS) {
      const v = s[k] ?? "off";
      if (RANK[v] > RANK[out[k]]) out[k] = v;
    }
  }
  return out;
}

export const asksForAnything = (f: BuyerFieldsRow) => FIELD_KEYS.some((k) => (f[k] ?? "off") !== "off");

const LIMITS: Record<FieldKey, number> = { name: 120, email: 200, phone: 40, address: 500, schedule: 120, note: 1000 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9 ()-]{6,24}$/;

export type BuyerDetails = Partial<Record<FieldKey, string>>;

/** Returns cleaned details, or a human-readable error. Fields the seller does not ask for are dropped. */
export function validateDetails(fields: Required<BuyerFieldsRow>, input: unknown): { ok: true; details: BuyerDetails } | { ok: false; error: string } {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const details: BuyerDetails = {};
  const label: Record<FieldKey, string> = {
    name: "Name",
    email: "Email",
    phone: "Phone or WhatsApp",
    address: "Delivery address",
    schedule: "Preferred date and time",
    note: "Note",
  };
  for (const k of FIELD_KEYS) {
    if (fields[k] === "off") continue;
    const v = typeof raw[k] === "string" ? (raw[k] as string).trim() : "";
    if (!v) {
      if (fields[k] === "required") return { ok: false, error: `${label[k]} is required` };
      continue;
    }
    if (v.length > LIMITS[k]) return { ok: false, error: `${label[k]} is too long` };
    if (k === "email" && !EMAIL.test(v)) return { ok: false, error: "Enter a valid email" };
    if (k === "phone" && !PHONE.test(v)) return { ok: false, error: "Enter a valid phone number" };
    details[k] = v;
  }
  return { ok: true, details };
}
