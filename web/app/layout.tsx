import type { Metadata, Viewport } from "next";
import { Fredoka, Shrikhand } from "next/font/google";
import { Providers } from "@/components/Providers";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import "./globals.css";

const fredoka = Fredoka({ subsets: ["latin"], variable: "--font-fredoka", weight: ["400", "500", "600", "700"] });
const shrikhand = Shrikhand({ subsets: ["latin"], variable: "--font-shrikhand", weight: "400" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://qrushpay.vercel.app"),
  title: { default: "QRush — QR payments in USDC on Base", template: "%s · QRush" },
  description:
    "Print a QR code, get paid in USDC. Buyers pay with any token from any wallet; sellers get split payouts, onchain receipts and loyalty rewards.",
  openGraph: { title: "QRush", description: "QR payments in USDC on Base.", type: "website" },
  icons: { icon: "/icon.svg" },
  twitter: { card: "summary_large_image", site: "@kane_120", creator: "@kane_120", title: "QRush", description: "QR payments in USDC on Base." },
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://qrushpay.vercel.app";
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "QRush",
  url: SITE_URL,
  description: "QR and pay-link checkout on Base. Buyers pay with crypto from any wallet; sellers receive USDC.",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  sameAs: ["https://github.com/comzzy/qrush", "https://x.com/kane_120"],
};

export const viewport: Viewport = { themeColor: "#fffbed", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fredoka.variable} ${shrikhand.variable}`}>
      <body className="min-h-dvh overflow-x-clip">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
        <Providers>
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 btn btn-sun">
            Skip to content
          </a>
          <Nav />
          <main id="main" className="relative">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
