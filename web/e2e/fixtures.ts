import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";

/** Console errors and page crashes fail the test. */
export function watchConsole(page: Page, errors: string[], allow: RegExp[] = []) {
  page.on("console", (m) => {
    if (m.type() === "error" && !allow.some((r) => r.test(m.text()))) errors.push(`${page.url()} :: ${m.text()} ${m.location().url}`);
  });
  page.on("pageerror", (e) => errors.push(`${page.url()} :: ${e.message}`));
}

export async function asAccount(context: BrowserContext, index: 0 | 1) {
  await context.addInitScript((i) => window.localStorage.setItem("qrush.testAccount", String(i)), index);
}

export const test = base.extend<{ errors: string[] }>({
  errors: async ({}, provide) => {
    const errors: string[] = [];
    await provide(errors);
    expect(errors, "console errors").toEqual([]);
  },
});
export { expect };
