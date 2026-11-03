export type Geo = { latitude: number | null; longitude: number | null; city: string | null; country: string | null };

function num(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Approximate viewer location from edge/CDN geolocation headers (Vercel, Cloudflare, Fastly-style). */
export function geoFromHeaders(get: (name: string) => string | undefined): Geo {
  const city = get("x-vercel-ip-city") ?? get("cf-ipcity") ?? get("x-geo-city");
  return {
    latitude: num(get("x-vercel-ip-latitude") ?? get("cf-iplatitude") ?? get("x-geo-latitude")),
    longitude: num(get("x-vercel-ip-longitude") ?? get("cf-iplongitude") ?? get("x-geo-longitude")),
    city: city ? decodeURIComponent(city) : null,
    country: get("x-vercel-ip-country") ?? get("cf-ipcountry") ?? get("x-geo-country") ?? null,
  };
}
