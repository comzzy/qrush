import { createHmac, timingSafeEqual } from "node:crypto";

type Claims = { t: string; p: string; e: number };

const key = (secret: string) => createHmac("sha256", secret).update("qrush:download:v1").digest();

/** A signed link for one product of one confirmed payment. It expires and cannot be forged or guessed. */
export function signDownload(secret: string, txHash: string, productId: string, ttlSeconds: number) {
  const claims: Claims = { t: txHash.toLowerCase(), p: productId, e: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const sig = createHmac("sha256", key(secret)).update(body).digest("base64url");
  return { token: `${body}.${sig}`, expiresAt: new Date(claims.e * 1000).toISOString() };
}

export function readDownload(secret: string, token: string): { txHash: string; productId: string } | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  // Compare the exact text so a token has only one valid spelling.
  const want = Buffer.from(createHmac("sha256", key(secret)).update(body).digest("base64url"));
  const got = Buffer.from(sig);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString()) as Claims;
    if (typeof c.e !== "number" || c.e < Math.floor(Date.now() / 1000)) return null;
    return { txHash: c.t, productId: c.p };
  } catch {
    return null;
  }
}
