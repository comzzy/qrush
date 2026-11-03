import Link from "next/link";
import { QrTileSticker } from "@/components/art/Stickers";
import { Float } from "@/components/art/Float";

export default function NotFound() {
  return (
    <div className="section flex flex-col items-center py-20 text-center">
      <Float rotate={-8} distance={12}><QrTileSticker size={140} /></Float>
      <h1 className="h-display mt-6 text-4xl sm:text-6xl">Nothing to scan here</h1>
      <p className="mt-3 text-ink-soft">This page doesn&apos;t exist. Maybe the link was cut short.</p>
      <Link href="/" className="btn btn-ink mt-6">Back home</Link>
    </div>
  );
}
