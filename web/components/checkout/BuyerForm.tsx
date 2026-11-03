"use client";

import type { BuyerDetails, BuyerFieldKey, BuyerFields } from "@/lib/types";

export const FIELD_META: Record<
  BuyerFieldKey,
  {
    label: string;
    type: string;
    placeholder: string;
    autoComplete: string;
    max: number;
  }
> = {
  name: {
    label: "Your name",
    type: "text",
    placeholder: "Ada Obi",
    autoComplete: "name",
    max: 120,
  },
  email: {
    label: "Email",
    type: "email",
    placeholder: "you@example.com",
    autoComplete: "email",
    max: 200,
  },
  phone: {
    label: "Phone or WhatsApp",
    type: "tel",
    placeholder: "+234 801 234 5678",
    autoComplete: "tel",
    max: 40,
  },
  address: {
    label: "Delivery address",
    type: "text",
    placeholder: "Street, area, city",
    autoComplete: "street-address",
    max: 500,
  },
  schedule: {
    label: "Preferred date and time",
    type: "datetime-local",
    placeholder: "",
    autoComplete: "off",
    max: 120,
  },
  note: {
    label: "Note for the seller",
    type: "text",
    placeholder: "Anything they should know",
    autoComplete: "off",
    max: 1000,
  },
};
export const FIELD_KEYS: BuyerFieldKey[] = [
  "name",
  "email",
  "phone",
  "address",
  "schedule",
  "note",
];

export const asksForAnything = (f?: BuyerFields | null) =>
  Boolean(f && FIELD_KEYS.some((k) => (f[k] ?? "off") !== "off"));

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9 ()-]{6,24}$/;

/** Mirrors the server's checks so buyers see problems before they open their wallet. */
export function detailsProblem(
  fields: BuyerFields,
  d: BuyerDetails,
): string | null {
  for (const k of FIELD_KEYS) {
    const v = (d[k] ?? "").trim();
    if (fields[k] === "required" && !v)
      return `${FIELD_META[k].label} is required`;
    if (v && k === "email" && !EMAIL.test(v)) return "Enter a valid email";
    if (v && k === "phone" && !PHONE.test(v))
      return "Enter a valid phone number";
  }
  return null;
}

export function BuyerForm({
  fields,
  value,
  onChange,
  disabled,
}: {
  fields: BuyerFields;
  value: BuyerDetails;
  onChange: (v: BuyerDetails) => void;
  disabled?: boolean;
}) {
  const shown = FIELD_KEYS.filter((k) => (fields[k] ?? "off") !== "off");
  if (!shown.length) return null;
  return (
    <fieldset
      className="space-y-3 rounded-2xl border-2 border-ink bg-cream p-4"
      data-testid="buyer-form"
      disabled={disabled}
    >
      <legend className="px-1 text-sm font-bold">Your details</legend>
      <p className="-mt-1 text-xs text-ink-soft">
        Shared only with the seller. Never stored on chain.
      </p>
      {shown.map((k) => {
        const m = FIELD_META[k];
        const id = `buyer-${k}`;
        const common = {
          id,
          name: k,
          className: "field",
          maxLength: m.max,
          required: fields[k] === "required",
          value: value[k] ?? "",
          placeholder: m.placeholder,
          autoComplete: m.autoComplete,
          "data-testid": id,
        };
        return (
          <div key={k}>
            <label className="label" htmlFor={id}>
              {m.label}{" "}
              {fields[k] === "optional" && (
                <span className="font-normal text-ink-soft">(optional)</span>
              )}
            </label>
            {k === "note" || k === "address" ? (
              <textarea
                {...common}
                rows={2}
                onChange={(e) => onChange({ ...value, [k]: e.target.value })}
              />
            ) : (
              <input
                {...common}
                className="field min-w-0"
                type={m.type}
                inputMode={
                  k === "phone" ? "tel" : k === "email" ? "email" : undefined
                }
                onChange={(e) => onChange({ ...value, [k]: e.target.value })}
              />
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
