import { test, expect } from "@playwright/test";
const BASE = process.env.BASE_URL ?? "https://qrushpay.vercel.app";
for (const [w, h, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]] as const) {
  test(`walletconnect QR ${tag}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    const errs: string[] = [];
    page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
    page.on("pageerror", e => errs.push(String(e)));
    await page.goto(BASE + "/app");
    await page.getByTestId("connect-wallet").first().click({ timeout: 5000 }).catch(() => {});
    const wc = page.getByRole("button", { name: /WalletConnect/i }).first();
    await expect(wc).toBeVisible({ timeout: 10000 });
    await wc.click();
    const modal = page.locator("wcm-modal, w3m-modal");
    await expect(modal.first()).toBeAttached({ timeout: 15000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `../screens/walletconnect-${tag}.png` });
    expect(errs, errs.join("\n")).toEqual([]);
  });
}
