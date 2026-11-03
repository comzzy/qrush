import { writeFileSync } from "node:fs";
import { asAccount, expect, test, watchConsole } from "./fixtures";

const SELLER = process.env.E2E_SELLER!;
const BUYER = process.env.E2E_BUYER!;
let payPath = "";

test.describe.serial("seller to buyer", () => {
  test("seller signs in, opens a shop, registers onchain, adds products and a pay link", async ({ browser, errors }) => {
    const context = await browser.newContext({ geolocation: { latitude: 6.5244, longitude: 3.3792 }, permissions: ["geolocation"] });
    await asAccount(context, 0);
    const page = await context.newPage();
    watchConsole(page, errors);

    await page.goto("/app");
    await page.getByRole("button", { name: /Test wallet/ }).click();
    await expect(page.getByTestId("wallet-address").first()).toHaveText(`${SELLER.slice(0, 6)}…${SELLER.slice(-4)}`);
    await page.getByRole("button", { name: "Sign in with wallet" }).click();

    await page.locator("#shop-name").fill("Mama Put Kitchen");
    await page.locator("#shop-desc").fill("Jollof, plantain and cold drinks.");
    await page.locator("#shop-city").fill("Lagos");
    await page.locator("#shop-country").fill("NG");
    await page.getByRole("button", { name: "Add my location to the live map" }).click();
    await expect(page.getByRole("button", { name: "Location added ✓" })).toBeVisible();
    await page.getByRole("button", { name: "Create shop" }).click();
    await expect(page.getByTestId("shop-name")).toHaveText("Mama Put Kitchen");

    await page.getByTestId("register-onchain").click();
    await expect(page.getByTestId("registered")).toBeVisible();

    await page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: "Products", exact: true }).click();
    for (const [name, price] of [["Jollof rice", "4.50"], ["Chapman", "2.00"]]) {
      await page.locator("#p-name").fill(name);
      await page.locator("#p-price").fill(price);
      await page.getByRole("button", { name: "Add product" }).click();
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }

    await page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: "Payouts", exact: true }).click();
    await page.locator("#loy-n").fill("1");
    await page.locator("#loy-p").fill("10");
    await page.getByRole("button", { name: "Save loyalty" }).click();
    await expect(page.getByText("Loyalty saved onchain.")).toBeVisible();

    await page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: "Pay links", exact: true }).click();
    await page.getByRole("tab", { name: "From products" }).click();
    await page.getByRole("button", { name: "More Jollof rice" }).click();
    await page.getByRole("button", { name: "More Jollof rice" }).click();
    await page.getByRole("button", { name: "More Chapman" }).click();
    await expect(page.getByText("Total $11.00")).toBeVisible();
    await page.locator("#l-memo").fill("Table 4");
    await page.getByTestId("create-link").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Scan Here").first()).toBeVisible();
    const download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: /Download/ }).click();
    expect((await download).suggestedFilename()).toMatch(/\.png$/);
    await page.keyboard.press("Escape");
    const link = page.getByTestId("pay-link").first();
    await expect(link.getByText("Ready")).toBeVisible();
    payPath = new URL((await link.getByRole("link", { name: "Open" }).getAttribute("href"))!, "http://x").pathname;
    expect(payPath).toMatch(/^\/pay\/0x[0-9a-f]{64}$/);
    writeFileSync("test-results/pay-path.txt", payPath);
    await context.close();
  });

  test("buyer pays in USDC and gets a receipt", async ({ browser, errors }) => {
    const context = await browser.newContext();
    await asAccount(context, 1);
    const page = await context.newPage();
    watchConsole(page, errors);
    await page.goto(payPath);
    await expect(page.getByTestId("pay-shop")).toHaveText("Mama Put Kitchen");
    await expect(page.getByTestId("pay-amount")).toHaveText("$11.00");
    await expect(page.getByTestId("verified-badge")).toBeVisible();
    await expect(page.getByTestId("trust-seller")).toHaveText(SELLER);
    await expect(page.getByTestId("trust-domain")).toHaveText(new URL(page.url()).host);
    await expect(page.getByTestId("trust-warning")).toHaveCount(0);
    // Query values on a pay link are ignored; price and payee come from the server and the contract.
    await page.goto(`${payPath}?amount=0.01&seller=${BUYER}&recipient=${BUYER}&token=0x0000000000000000000000000000000000000001`);
    await expect(page.getByTestId("pay-amount")).toHaveText("$11.00");
    await expect(page.getByTestId("trust-seller")).toHaveText(SELLER);
    await page.getByRole("button", { name: /Test wallet/ }).click();
    await expect(page.getByTestId("wallet-address").first()).toHaveText(`${BUYER.slice(0, 6)}…${BUYER.slice(-4)}`);
    await page.getByTestId("token-usdc").click();
    await expect(page.getByTestId("pay-button")).toHaveText("Pay $11.00");
    await page.getByTestId("pay-button").click();
    await expect(page.getByTestId("pay-success")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("view-receipt").click();
    await expect(page.getByTestId("receipt-total")).toHaveText("$11.00");
    await expect(page.getByTestId("receipt").getByText("2× Jollof rice")).toBeVisible();
    await context.close();
  });

  test("returning buyer pays in ETH with the loyalty discount", async ({ browser, errors }) => {
    const context = await browser.newContext();
    await asAccount(context, 1);
    const page = await context.newPage();
    watchConsole(page, errors);
    await page.goto(payPath);
    await page.getByRole("button", { name: /Test wallet/ }).click();
    await page.getByTestId("token-eth").click();
    await expect(page.getByText(/Loyalty reward: \$1\.10 off \$11\.00/)).toBeVisible();
    await expect(page.getByText(/You pay about/)).toBeVisible();
    await expect(page.getByTestId("pay-button")).toHaveText("Pay $9.90");
    await page.getByTestId("pay-button").click();
    await expect(page.getByTestId("pay-success")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("view-receipt").click();
    await expect(page.getByTestId("receipt-total")).toHaveText("$9.90");
    writeFileSync("test-results/receipt-path.txt", new URL(page.url()).pathname);
    await expect(page.getByText("Loyalty discount")).toBeVisible();
    await context.close();
  });

  test("payments show on the live feed and in the seller's receipts", async ({ browser, errors }) => {
    const live = await browser.newPage();
    watchConsole(live, errors);
    await live.goto("/live");
    await expect(live.getByTestId("feed-item")).toHaveCount(2);
    await expect(live.getByTestId("feed-item").first()).toContainText("Mama Put Kitchen");
    await expect(live.locator("svg[aria-label^='World map with 2']")).toBeVisible();
    await live.close();

    const context = await browser.newContext();
    await asAccount(context, 0);
    const page = await context.newPage();
    watchConsole(page, errors);
    await page.goto("/app/receipts");
    await page.getByRole("button", { name: /Test wallet/ }).click();
    await page.getByRole("button", { name: "Sign in with wallet" }).click();
    await expect(page.getByTestId("receipt-row")).toHaveCount(2);
    await context.close();
  });
});
