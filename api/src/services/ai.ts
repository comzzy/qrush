import { z } from "zod";
import { getVercelOidcToken } from "@vercel/oidc";
import { parseUsdc } from "../lib/money.js";

const extractedSchema = z.object({
  currency: z.string().nullable(),
  products: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().nullable(),
        price: z.number().nonnegative(),
        category: z.string().nullable(),
      }),
    )
    .max(500),
});

const responseFormat = {
  type: "json_schema",
  json_schema: {
    name: "price_list",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["currency", "products"],
      properties: {
        currency: { type: ["string", "null"], description: "ISO 4217 code of prices shown, if identifiable" },
        products: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "description", "price", "category"],
            properties: {
              name: { type: "string" },
              description: { type: ["string", "null"] },
              price: { type: "number", description: "Unit price as shown, in the list's currency" },
              category: { type: ["string", "null"] },
            },
          },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT =
  "You extract product catalogs from photos of menus, price lists, and shelf labels. " +
  "Return every distinct sellable item with its unit price exactly as printed. " +
  "Ignore headings, phone numbers, and decorative text. If an item has several sizes, emit one product per size " +
  "with the size in the name. Never invent items or prices that are not visible.";

export type ExtractedProduct = {
  name: string;
  description: string | null;
  category: string | null;
  price: string;
  priceUsdc: string;
};

export type AiConfig = { apiKey: string | undefined; baseUrl: string; model: string; fetch?: typeof fetch };

export class AiNotConfiguredError extends Error {
  constructor() {
    super("AI is not configured: set AI_API_KEY or AI_GATEWAY_API_KEY, or deploy on Vercel with OIDC enabled");
  }
}

export async function extractProductsFromImage(
  cfg: AiConfig,
  image: { dataUrl: string } | { url: string },
): Promise<{ currency: string | null; products: ExtractedProduct[]; model: string }> {
  const apiKey = await resolveApiKey(cfg);
  if (!apiKey) throw new AiNotConfiguredError();
  const doFetch = cfg.fetch ?? fetch;
  const imageUrl = "dataUrl" in image ? image.dataUrl : image.url;

  const res = await doFetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0,
      response_format: responseFormat,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract the products and prices from this price list." },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`Vision API error ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  const body = (await res.json()) as { model?: string; choices?: { message?: { content?: string | null } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("Vision API returned no content");

  const json = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  const parsed = extractedSchema.parse(json);
  return {
    currency: parsed.currency,
    model: body.model ?? cfg.model,
    products: parsed.products.map((p) => {
      const price = p.price.toFixed(6).replace(/\.?0+$/, "");
      return {
        name: p.name.trim(),
        description: p.description,
        category: p.category,
        price,
        priceUsdc: parseUsdc(price).toString(),
      };
    }),
  };
}

/** Explicit key first, then a Vercel AI Gateway key, then the Vercel OIDC token (only on Vercel, only for the gateway). */
async function resolveApiKey(cfg: AiConfig): Promise<string | undefined> {
  if (cfg.apiKey) return cfg.apiKey;
  if (!cfg.baseUrl.includes("ai-gateway.vercel.sh")) return undefined;
  if (process.env.AI_GATEWAY_API_KEY) return process.env.AI_GATEWAY_API_KEY;
  if (!process.env.VERCEL) return undefined;
  try {
    return await getVercelOidcToken();
  } catch {
    return undefined;
  }
}
