import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "QRush — QR payments in USDC",
    short_name: "QRush",
    description: "Print a QR code, get paid in USDC on Base. Buyers pay with any token from any wallet.",
    start_url: "/",
    display: "standalone",
    background_color: "#fffbed",
    theme_color: "#fffbed",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
