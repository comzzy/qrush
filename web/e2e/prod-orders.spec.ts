import { expect, test } from "@playwright/test";

/** Checks the order, delivery and privacy surfaces of a real build, with no wallet. */
test.describe("orders and delivery are private", () => {
  test("seller-only and token-gated endpoints refuse strangers", async ({ request }) => {
    expect((await request.get("/api/orders/mine")).status()).toBe(401);
    expect((await request.get("/api/orders/mine/reports")).status()).toBe(401);
    expect((await request.get("/api/orders/mine/by-code/ABCDEFG")).status()).toBe(401);
    expect((await request.patch("/api/orders/mine/x", { data: { status: "paid" } })).status()).toBe(401);
    expect((await request.get("/api/orders/not-a-real-order-id")).status()).toBe(404);
    expect((await request.get(`/api/files/${"0".repeat(64)}`)).status()).toBe(404);
    expect((await request.get("/api/downloads/forged.token")).status()).toBe(403);
    const feed = await request.get("/api/feed/recent");
    expect(feed.status()).toBe(200);
    expect(await feed.text()).not.toMatch(/"(email|phone|address|note)"/);
  });
});

for (const width of [1440, 360]) {
  test.describe(`order pages at ${width}`, () => {
    test.use({ viewport: { width, height: 800 }, isMobile: width < 768, hasTouch: width < 768 });

    test("orders tab asks the seller to sign in, with no overflow", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("/app/orders");
      await expect(page.getByTestId("connect-wallet")).toBeVisible({ timeout: 10_000 });
      const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(sw).toBe(0);
      await page.screenshot({ path: `../screens/orders-${width < 768 ? "mobile" : "desktop"}.png` });
      expect(errors).toEqual([]);
    });

    test("an unknown receipt and pay link fail cleanly", async ({ page }) => {
      await page.goto("/receipt/999999999");
      await expect(page.locator("main")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      const res = await page.goto("/pay/not-a-real-link");
      expect(res?.status()).toBeLessThan(500);
    });
  });
}
