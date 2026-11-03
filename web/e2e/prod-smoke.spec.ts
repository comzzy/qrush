import { expect, test } from "@playwright/test";

/** Runs against a real build with no mock wallet and no injected provider. */
const PAGES = ["/", "/features", "/docs", "/live", "/app"];

for (const width of [1440, 390]) {
  test.describe(`clean browser at ${width}`, () => {
    test.use({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });

    test("pages load with zero console errors", async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(e.message));
      for (const p of PAGES) {
        const res = await page.goto(p, { waitUntil: "networkidle" });
        expect(res?.status(), p).toBeLessThan(400);
      }
      expect(errors).toEqual([]);
    });

    test("home CTAs navigate", async ({ page }) => {
      for (const [name, url] of [["Start selling", /\/app$/], ["See live payments", /\/live$/], ["Read the guide", /\/docs$/]] as const) {
        await page.goto("/");
        await page.locator("main").getByRole("link", { name }).first().click();
        await expect(page).toHaveURL(url);
      }
    });

    test("/app resolves to the connect screen within 5s with no wallet", async ({ page }) => {
      await page.goto("/app", { waitUntil: "commit" });
      await expect(page.getByTestId("connect-wallet")).toBeVisible({ timeout: 5000 });
    });

    test("/app cards are centred with no horizontal overflow", async ({ page }) => {
      await page.goto("/app");
      const box = page.getByTestId("connect-wallet");
      await expect(box).toBeVisible();
      const m = await page.evaluate(() => {
        const W = document.documentElement.clientWidth;
        const r = document.querySelector("[data-testid=connect-wallet]")!.parentElement!.getBoundingClientRect();
        return { W, sw: document.documentElement.scrollWidth, left: r.left, right: W - r.right };
      });
      expect(m.sw).toBe(m.W);
      if (m.W < 768) expect(Math.abs(m.left - m.right)).toBeLessThan(2);
    });

    test("connect modal opens with real options and clear errors", async ({ page }) => {
      await page.goto("/app");
      const box = page.getByTestId("connect-wallet");
      await expect(box.getByRole("button", { name: /Passkey wallet/ })).toBeVisible();
      const browser = box.getByRole("button", { name: /Browser wallet/ });
      await expect(browser).toBeVisible();
      await expect(box.getByRole("button", { name: /Test wallet/ })).toHaveCount(0);
      await browser.click();
      await expect(page.getByText("No browser wallet found")).toBeVisible();
      await page.screenshot({ path: `../screens/connect-${width < 768 ? "mobile" : "desktop"}.png`, fullPage: false });
    });
  });
}
