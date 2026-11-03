import { expect, test } from "@playwright/test";

/** Crawls every page reachable from the home page on a real deployment and checks the basics. */
const START = ["/", "/features", "/docs", "/live", "/app", "/app/products", "/app/orders", "/app/receipts", "/app/links", "/app/payouts", "/pay/0x" + "1".repeat(64), "/receipt/999999999", "/nope"];

for (const width of [1440, 360]) {
  test(`audit at ${width}`, async ({ page, request }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width, height: 900 });
    const problems: string[] = [];
    page.on("console", (m) => m.type() === "error" && !/404|Failed to load resource/.test(m.text()) && problems.push(`console ${page.url()}: ${m.text()}`));
    page.on("pageerror", (e) => problems.push(`crash ${page.url()}: ${e.message}`));
    const seen = new Set<string>();
    const external = new Set<string>();
    const queue = [...START];
    while (queue.length) {
      const path = queue.shift()!;
      if (seen.has(path)) continue;
      seen.add(path);
      const t = Date.now();
      await page.goto(path, { waitUntil: "load" });
      const ms = Date.now() - t;
      if (ms > 8000) problems.push(`slow ${path}: ${ms}ms`);
      await page.waitForTimeout(800);
      const r = await page.evaluate(() => {
        const W = document.documentElement.clientWidth;
        const overflow = document.documentElement.scrollWidth > W + 1;
        const noAlt = [...document.querySelectorAll("img:not([alt])")].length;
        const unnamed = [...document.querySelectorAll("button, a[href]")].filter((e) => {
          const el = e as HTMLElement;
          return el.offsetParent !== null && !(el.innerText.trim() || el.getAttribute("aria-label") || el.getAttribute("title") || el.querySelector("[aria-label],img[alt],svg title"));
        }).map((e) => e.outerHTML.slice(0, 80));
        const links = [...document.querySelectorAll("a[href]")].map((a) => (a as HTMLAnchorElement).href);
        return { overflow, noAlt, unnamed, links, lang: document.documentElement.lang, h1: document.querySelectorAll("h1").length };
      });
      if (r.overflow) problems.push(`horizontal overflow ${path}`);
      if (r.noAlt) problems.push(`img without alt ${path}: ${r.noAlt}`);
      if (r.unnamed.length) problems.push(`unnamed controls ${path}: ${r.unnamed.join(" | ")}`);
      if (!r.lang) problems.push(`no lang ${path}`);
      if (r.h1 === 0 && !path.startsWith("/app")) problems.push(`no h1 ${path}`);
      for (const href of r.links) {
        const u = new URL(href);
        if (u.origin === new URL(page.url()).origin) {
          if (!u.pathname.startsWith("/api") && !seen.has(u.pathname) && seen.size < 60) queue.push(u.pathname);
        } else if (u.protocol.startsWith("http")) external.add(u.href);
      }
    }
    for (const href of external) {
      const res = await request.get(href, { timeout: 20_000, failOnStatusCode: false }).catch(() => null);
      // Some sites refuse bots (403/429); only real breakage counts.
      if (!res || res.status() === 404 || res.status() >= 500) problems.push(`broken external ${href}: ${res?.status() ?? "no response"}`);
    }
    console.log(`checked ${seen.size} pages, ${external.size} external links`);
    expect(problems).toEqual([]);
  });
}
