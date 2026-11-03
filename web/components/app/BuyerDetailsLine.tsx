import type { BuyerDetails } from "@/lib/types";
import { formatSchedule } from "@/components/checkout/OrderTracker";

/** Seller-only: what the buyer typed at checkout. */
export function BuyerDetailsLine({ d }: { d: BuyerDetails }) {
  const parts = [
    d.name && { k: "Name", v: d.name },
    d.email && { k: "Email", v: d.email, href: `mailto:${d.email}` },
    d.phone && {
      k: "Phone",
      v: d.phone,
      href: `https://wa.me/${d.phone.replace(/[^0-9]/g, "")}`,
    },
    d.schedule && { k: "Time", v: formatSchedule(d.schedule) },
  ].filter(Boolean) as { k: string; v: string; href?: string }[];
  if (!parts.length && !d.note && !d.address) return null;
  return (
    <div
      className="col-span-full mt-1 min-w-0 rounded-xl bg-cream px-3 py-2 text-sm"
      data-testid="buyer-details"
    >
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((p) => (
          <span key={p.k} className="min-w-0 break-all">
            <span className="text-ink-soft">{p.k}: </span>
            {p.href ? (
              <a
                className="underline"
                href={p.href}
                target={p.k === "Phone" ? "_blank" : undefined}
                rel="noreferrer"
              >
                {p.v}
              </a>
            ) : (
              p.v
            )}
          </span>
        ))}
      </div>
      {d.address && (
        <p className="mt-1 break-words whitespace-pre-line">
          <span className="text-ink-soft">Address: </span>
          {d.address}
        </p>
      )}
      {d.note && (
        <p className="mt-1 break-words">
          <span className="text-ink-soft">Note: </span>
          {d.note}
        </p>
      )}
    </div>
  );
}
