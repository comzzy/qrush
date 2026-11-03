import { expect, test } from "@playwright/test";

test("security headers are set on pages and the API", async ({ request }) => {
  for (const path of ["/", "/pay/0x" + "0".repeat(64), "/api/health"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    const h = res.headers();
    const csp = h["content-security-policy"] ?? "";
    expect(csp, path).toContain("frame-ancestors 'none'");
    expect(csp, path).toContain("object-src 'none'");
    expect(csp, path).toContain("default-src 'self'");
    expect(h["strict-transport-security"], path).toContain("max-age=63072000");
    expect(h["x-frame-options"], path).toBe("DENY");
    expect(h["x-content-type-options"], path).toBe("nosniff");
  }
});

test("a forged or altered download link is refused", async ({ request }) => {
  const res = await request.get("/api/downloads/eyJ0IjoiMHgwMCIsInAiOiJ4IiwiZSI6OTk5OTk5OTk5OX0.forged", { maxRedirects: 0 });
  expect(res.status()).toBe(403);
  expect(res.headers()["location"]).toBeUndefined();
});

test("an unknown pay link shows not found, not someone else's shop", async ({ page }) => {
  await page.goto("/pay/0x" + "1".repeat(64));
  await expect(page.getByText("Link not found")).toBeVisible();
});
