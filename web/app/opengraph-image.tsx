import { ImageResponse } from "next/og";

export const alt = "QRush — print a QR code, get paid in USDC on Base";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#141414";

function Qr() {
  // Decorative QR-style tile (not scannable), drawn from a fixed pattern.
  const rows = [
    "1111111010111111",
    "1000001001100001",
    "1011101011101101",
    "1011101000101101",
    "1000001010100001",
    "1111111010111111",
    "0000000011000000",
    "1101011100110110",
    "0110100101011011",
    "1011011010010101",
    "0000000010110011",
    "1111111001011010",
    "1000001011100101",
    "1011101010011110",
    "1000001001101001",
    "1111111010110111",
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", padding: 22, background: "#fff", border: `6px solid ${INK}`, borderRadius: 36, boxShadow: `0 10px 0 0 ${INK}` }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex" }}>
          {r.split("").map((c, j) => (
            <div key={j} style={{ width: 16, height: 16, background: c === "1" ? INK : "transparent", borderRadius: 3 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#fffbed", padding: 64, fontFamily: "sans-serif", color: INK, position: "relative" }}>
        <div style={{ position: "absolute", top: -120, right: -120, width: 420, height: 420, borderRadius: 999, background: "#ffb3ad" }} />
        <div style={{ position: "absolute", bottom: -160, left: 380, width: 360, height: 360, borderRadius: 999, background: "#9fe0c3" }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ width: 72, height: 72, borderRadius: 22, background: "#ffb3ad", border: `5px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44, fontWeight: 800 }}>Q</div>
            <div style={{ fontSize: 52, fontWeight: 800 }}>QRush</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2 }}>Print a QR code.</div>
            <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2, color: "#2775ca" }}>Get paid in USDC.</div>
            <div style={{ fontSize: 30, marginTop: 22, color: "#4a4540", maxWidth: 640 }}>Buyers pay with any token from any wallet. One transaction, settled on Base.</div>
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            {["Any token in", "USDC out", "No Coinbase account"].map((t) => (
              <div key={t} style={{ display: "flex", padding: "10px 22px", border: `4px solid ${INK}`, borderRadius: 999, background: "#f9d648", fontSize: 24, fontWeight: 700 }}>{t}</div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", transform: "rotate(4deg)" }}>
          <Qr />
        </div>
        <div style={{ position: "absolute", right: 64, bottom: 40, fontSize: 24, fontWeight: 700 }}>qrushpay.vercel.app</div>
      </div>
    ),
    size,
  );
}
