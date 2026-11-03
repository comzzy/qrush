import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, watchConsole } from "./fixtures";

const OUT = "../screens";
const WIDTHS = [360, 390, 768, 1024, 1440];

test.describe("responsive screens", () => {
  test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

  const pages: [string, () => string][] = [
    ["home", () => "/"],
    ["features", () => "/features"],
    ["docs", () => "/docs"],
    ["live", () => "/live"],
    ["app", () => "/app"],
    ["pay", () => readFileSync("test-results/pay-path.txt", "utf8")],
    ["receipt", () => readFileSync("test-results/receipt-path.txt", "utf8")],
    ["not-found", () => "/nope"],
  ];

  for (const [name, path] of pages) {
    test(name, async ({ browser, errors }) => {
      for (const width of WIDTHS) {
        const page = await browser.newPage({ viewport: { width, height: width < 768 ? 800 : 900 } });
        watchConsole(page, errors, name === "not-found" ? [/404/] : []);
        await page.goto(path());
        await page.waitForLoadState("networkidle");
        // Scroll through so in-view animations play before the full-page capture.
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 300) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
          window.scrollTo(0, document.body.scrollHeight);
          await new Promise((r) => setTimeout(r, 800));
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(1200);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        const culprits = overflow > 0 ? await page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).slice(-6).map((e) => `${e.tagName}.${String((e as HTMLElement).className).slice(0, 80)} r=${Math.round(e.getBoundingClientRect().right)}`)) : [];
        expect(overflow, `${name} @${width} horizontal overflow ${culprits.join(" | ")}`).toBeLessThanOrEqual(0);
        await page.screenshot({ path: `${OUT}/${name}-${width}.png`, fullPage: true });
        await page.close();
      }
    });
  }
});
