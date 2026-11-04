/** WebAuthn Related Origin Requests: lets qrush.online use passkeys made for qrushpay.vercel.app. */
export const dynamic = "force-static";

export function GET() {
  return Response.json(
    { origins: ["https://qrush.online", "https://www.qrush.online", "https://qrushpay.vercel.app"] },
    { headers: { "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" } },
  );
}
