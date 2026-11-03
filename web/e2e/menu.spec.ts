import { expect, test } from "@playwright/test";

const LINKS = [
  { name: "Home", path: "/" },
  { name: "Features", path: "/features" },
  { name: "Live map", path: "/live" },
  { name: "Docs", path: "/docs" },
  { name: "Start selling", path: "/app" },
];

for (const width of [360, 390]) {
  test.describe(`mobile menu at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true });

    test("shows every link, full height, and each one navigates and closes the menu", async ({ page }) => {
      for (const link of LINKS) {
        await page.goto("/features");
        await page.getByRole("button", { name: "Open menu" }).tap();
        const menu = page.getByRole("dialog", { name: "Menu" });
        await expect(menu).toBeVisible();
        const box = (await menu.boundingBox())!;
        expect(box.height).toBeGreaterThan(600);
        for (const l of LINKS) {
          const el = menu.getByRole("link", { name: l.name, exact: true });
          await expect(el).toBeVisible();
          await expect(el).toBeInViewport();
        }
        expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe("hidden");
        if (link.name === "Docs" && width === 390) await page.screenshot({ path: "../screens/menu-open-390.png" });
        await menu.getByRole("link", { name: link.name, exact: true }).tap();
        await expect(page).toHaveURL(new RegExp(`${link.path === "/" ? "/$" : link.path}`));
        await expect(menu).toBeHidden();
      }
    });
  });
}
