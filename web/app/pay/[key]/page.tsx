import type { Metadata } from "next";
import { PayClient } from "./PayClient";

export const metadata: Metadata = { title: "Pay", robots: { index: false } };

export default async function PayPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <PayClient invoiceKey={key} />;
}
