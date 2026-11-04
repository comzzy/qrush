import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffb3ad" }}>
        <div style={{ width: 92, height: 92, borderRadius: 999, border: "16px solid #141414", display: "flex" }} />
      </div>
    ),
    size,
  );
}
