import { test, expect } from "@playwright/test";

/** Same passkey must always open the same wallet, even after logout and on a "new device" (empty storage). */
const BASE = process.env.BASE_URL ?? "https://qrush.online";

test("passkey wallet address is identical after logout and login", async ({ page }) => {
  test.setTimeout(120_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  await page.goto(`${BASE}/app`);
  const addr = page.getByTestId("wallet-address");
  const full = async () => (await addr.getAttribute("aria-label"))!.replace("Copy address ", "");

  await page.getByTestId("passkey-create").click();
  await expect(addr).toBeVisible({ timeout: 60_000 });
  const first = await full();
  expect(first).toMatch(/^0x[0-9a-fA-F]{40}$/);

  // Log out, sign in again with the same passkey.
  await page.getByRole("button", { name: "Disconnect" }).click();
  await page.getByTestId("passkey-login").click();
  await expect(addr).toBeVisible({ timeout: 60_000 });
  expect(await full()).toBe(first);

  // Log out and wipe all site storage, as on a new browser: the passkey alone must give the same wallet.
  await page.getByRole("button", { name: "Disconnect" }).click();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId("passkey-login").click();
  await expect(addr).toBeVisible({ timeout: 60_000 });
  expect(await full()).toBe(first);
});

test("wallet made on qrushpay.vercel.app opens the same on qrush.online", async ({ page, request }) => {
  test.skip(!BASE.includes("qrush.online"), "production only");
  test.setTimeout(120_000);
  const wk = await request.get("https://qrushpay.vercel.app/.well-known/webauthn", { maxRedirects: 0 });
  expect(wk.status()).toBe(200);
  expect(wk.headers()["content-type"]).toContain("application/json");
  expect((await wk.json()).origins).toContain("https://qrush.online");

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  const addr = page.getByTestId("wallet-address");
  const full = async () => (await addr.getAttribute("aria-label"))!.replace("Copy address ", "");
  await page.goto("https://qrushpay.vercel.app/app");
  await page.getByTestId("passkey-create").click();
  await expect(addr).toBeVisible({ timeout: 60_000 });
  const made = await full();
  const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
  expect(credentials[0]?.rpId).toBe("qrushpay.vercel.app");

  await page.goto("https://qrush.online/app");
  await page.getByTestId("passkey-login").click();
  await expect(addr).toBeVisible({ timeout: 60_000 });
  expect(await full()).toBe(made);
});
