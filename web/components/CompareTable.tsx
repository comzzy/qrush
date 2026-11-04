const Y = "✓";
const COLS = ["QRush", "Daimo Pay", "Request Network", "Coinbase Commerce"];

export const COMPARE_SOURCES = [
  { label: "Daimo docs", href: "https://docs.daimo.com/introduction" },
  { label: "Request Network docs", href: "https://docs.request.network/" },
  { label: "Request Network protocol fees", href: "https://docs.request.network/api-features/protocol-fees" },
  { label: "Coinbase Help: Commerce to Business", href: "https://help.coinbase.com/en/transitioning-from-coinbase-commerce-to-coinbase-business" },
];

// "—" means the feature is not listed in that product's public docs (checked Nov 2026).
export const ROWS: [string, string, string, string, string][] = [
  ["Status", "Live on Base", "Live", "Live", "Closed March 31, 2026"],
  ["Set up by", "Shop owner, no code", "Developers (SDK + API key)", "Dashboard or API", "—"],
  ["Any token in, stablecoin out", `${Y} One transaction (Uniswap v3)`, `${Y} Any chain, any token`, `${Y} Cross-chain swap-to-pay`, "Hundreds of assets"],
  ["Fee", "No platform fee, gas only", "Not listed in docs", "Protocol fee on every payment", "1%"],
  ["Needs a Coinbase business account", "No", "No", "No", "Replaced by Coinbase Business (US and Singapore only)"],
  ["Card, bank and local payment methods", "No, crypto only", Y, "—", "—"],
  ["Order types: pickup code, delivery, booking, digital", Y, "—", "—", "—"],
  ["Digital delivery with PDF stamping and file fingerprints", Y, "—", "—", "—"],
  ["QR stickers with an onchain verified-shop panel", Y, "—", "—", "—"],
  ["Photo of a price list turns into products", Y, "—", "—", "—"],
  ["Passkey wallet for buyers", Y, "—", "—", "—"],
  ["Payment splits and onchain loyalty stamps", Y, "—", "—", "—"],
];

export function CompareTable() {
  return (
    <div className="card mt-10 overflow-hidden bg-white p-0">
      <div className="overflow-x-auto" role="region" aria-label="Feature comparison" tabIndex={0}>
        <table className="w-full min-w-[44rem] border-collapse text-left text-sm sm:text-base">
          <thead>
            <tr className="border-b-2 border-ink bg-cream-deep">
              <th className="p-4 font-bold">Feature</th>
              {COLS.map((c, i) => (
                <th key={c} className={`p-4 font-bold ${i === 0 ? "bg-sun" : ""}`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([f, ...cells]) => (
              <tr key={f} className="border-b border-ink/15 last:border-0">
                <th scope="row" className="p-4 font-semibold">{f}</th>
                {cells.map((c, i) => (
                  <td key={i} className={`p-4 align-top ${i === 0 ? "bg-sun/30 font-semibold" : "text-ink-soft"}`}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
