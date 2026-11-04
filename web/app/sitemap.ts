import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://qrush.online";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/features`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/docs`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/live`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
  ];
}
