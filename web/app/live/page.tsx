import type { Metadata } from "next";
import { LiveClient } from "./LiveClient";

export const metadata: Metadata = { title: "Live payments", description: "Every QRush payment on Base, as it settles, on a world map." };

export default function LivePage() {
  return <LiveClient />;
}
