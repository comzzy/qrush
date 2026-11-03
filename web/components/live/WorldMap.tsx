"use client";

import { useMemo } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import type { Topology, GeometryCollection } from "topojson-specification";
import world from "world-atlas/countries-110m.json";
import type { FeedItem } from "@/lib/types";

const W = 960;
const H = 500;

export function WorldMap({ items, highlight }: { items: FeedItem[]; highlight?: number }) {
  const reduce = useReducedMotion();
  const { d, projection } = useMemo(() => {
    const topo = world as unknown as Topology<{ countries: GeometryCollection }>;
    const land = feature(topo, topo.objects.countries) as unknown as FeatureCollection<Geometry>;
    const projection = geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], { type: "Sphere" });
    return { d: geoPath(projection)(land) ?? "", projection };
  }, []);
  const pins = items
    .filter((i) => i.latitude !== null && i.longitude !== null)
    .map((i) => ({ i, p: projection([i.longitude!, i.latitude!]) }))
    .filter((x): x is { i: FeedItem; p: [number, number] } => Boolean(x.p));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`World map with ${pins.length} recent payment locations`}>
      <path d={geoPath(projection)({ type: "Sphere" }) ?? ""} fill="#a9d4ff" opacity="0.35" />
      <path d={d} fill="#fff3dc" stroke="#141414" strokeWidth="0.8" strokeLinejoin="round" />
      <AnimatePresence>
        {pins.map(({ i, p }) => {
          const hot = i.receiptId === highlight;
          return (
            <motion.g key={i.receiptId} transform={`translate(${p[0]} ${p[1]})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {!reduce && (
                <motion.circle r="6" fill="none" stroke="#f78f86" strokeWidth="2" animate={{ r: [6, 22], opacity: [0.9, 0] }} transition={{ duration: 1.8, repeat: Infinity, delay: (i.receiptId % 7) * 0.25 }} />
              )}
              <motion.circle r={hot ? 8 : 5.5} fill={hot ? "#f9d648" : "#f78f86"} stroke="#141414" strokeWidth="2" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 14 }} />
              <title>{`${i.shopName ?? "Shop"} · ${(Number(i.netAmount) / 1e6).toFixed(2)} USDC${i.city ? ` · ${i.city}` : ""}`}</title>
            </motion.g>
          );
        })}
      </AnimatePresence>
    </svg>
  );
}
