# QRush

**Take crypto payments with a QR code.** QRush lets a shop on Base set up a storefront in a couple of minutes, print a QR code or share a pay link, and get paid in USDC. Buyers can pay with USDC, ETH or most ERC20 tokens. Anything that isn't USDC is swapped to USDC in the same transaction, so the seller always receives dollars.

**Live app:** https://qrushpay.vercel.app
**Contract (verified):** [`0x6E41C4C993f0C2967eB9F8a3B27E9AD1E0dDb12e`](https://basescan.org/address/0x6E41C4C993f0C2967eB9F8a3B27E9AD1E0dDb12e) on Base mainnet

## Features

- **Wallet sign-in:** sign in with a browser wallet, WalletConnect (scan from a phone), or a passkey wallet that needs no extension or seed phrase.
- **Shops and products:** add products by hand, or snap a photo of a price list and have it turned into products.
- **Pay links and QR posters:** one-off invoices or reusable links, each with a printable QR code.
- **Pay in any token:** USDC directly, or ETH and ERC20 tokens routed through Uniswap v3 into USDC, with slippage protection and refunds of unused input.
- **Revenue splits:** payouts can be split between up to 10 recipients onchain.
- **Loyalty:** repeat buyers get a discount you configure.
- **Receipts and live feed:** every payment emits a receipt event. A public map shows payments as they happen.
- **Basenames:** sellers and buyers are shown by their Base name when they have one.

## How it works

1. A seller signs in, creates a shop and registers it on the QRush contract once. This costs a tiny Base network fee, usually under one cent.
2. The seller creates a pay link and shows its QR code.
3. The buyer scans it, picks a token and pays. The contract swaps to USDC if needed, splits the payout and emits a receipt.
4. The API indexes the receipt, and the dashboard and live feed update.

## Architecture

```
contracts/   Foundry project: QRushCheckout contract, unit and Base fork tests, deploy script
api/         TypeScript API (Hono, viem, SQLite + drizzle): auth, shops, invoices, indexer, feed
web/         Next.js app: landing page, seller dashboard, pay page, receipts, live map
```

The web app serves the API under `/api` when deployed, so a single Vercel project hosts both.

## Contract: `QRushCheckout`

| Concern | Behaviour |
| --- | --- |
| Seller registry | `registerSeller(name, recipients, bps)`, `updateSellerName`, `setSplits` (≤10 recipients, sum 10 000 bps; empty = 100 % to seller; last recipient receives rounding dust) |
| Invoices / pay links | `createInvoice` (seller tx) or EIP-712 signed invoice published by the buyer via `publishInvoice`. Invoice key = `keccak256(seller, id)`, so ids cannot be squatted by other sellers. `maxUses` 0 = reusable pay link, `expiresAt` 0 = no expiry. Optional line items are hashed and emitted. |
| Signatures | ECDSA first (works for EIP-7702 delegated EOAs), then ERC-1271 for smart-contract sellers |
| Payment | `payWithUSDC`, `payWithToken(path, maxIn, deadline)`, `payWithETH(path, deadline)` — exact-output swaps on SwapRouter02 `0x2626…e481`, unused input refunded, approvals reset, `amountInMaximum` + deadline as slippage protection |
| Loyalty | `setLoyalty(threshold, discountBps ≤ 5000)`: after `threshold` purchases from a seller, the buyer pays `amount × (1 − bps)` |
| Events | `InvoiceCreated`, `InvoiceCancelled`, `PaymentReceived` (receipt id, buyer, tokenIn, amountIn, gross, discount, net, purchase #), `PayoutSent`, seller/split/loyalty config events |
| Safety | OZ `ReentrancyGuard`, `SafeERC20`, `Multicall` (publish + pay in one tx), ETH only accepted from WETH |

## API

All amounts are decimal USDC strings (`"12.25"`) in JSON. Auth is `Authorization: Bearer <jwt>` from SIWE.

| Route | Purpose |
| --- | --- |
| `GET /auth/nonce`, `POST /auth/verify`, `GET /auth/me` | Sign-In with Ethereum (EIP-4361; ERC-1271/6492 smart wallets verified through viem) |
| `GET/POST/PATCH/DELETE /shops[/:id]`, `/shops/:id/products[/:productId]`, `GET /shops/by-slug/:slug` | Shop + product CRUD (bulk product create accepts an array), public storefront |
| `GET /seller/onchain`, `POST /seller/onchain/register`, `GET/PUT /seller/splits`, `GET/PUT /seller/loyalty` | Reads onchain config; writes return ready-to-send tx calldata |
| `POST /invoices`, `GET /invoices[/:id]`, `POST /invoices/:id/signature`, `POST /invoices/:id/cancel` | Create from products or a fixed amount; returns EIP-712 typed data, `createInvoice` calldata, pay URL and QR |
| `GET /pay/:key`, `/pay/:key/qr.png`, `/pay/:key/qr.svg`, `/pay/:key/receipts` | Public pay page data (records viewer geo), QR images |
| `GET /pay/:key/checkout?buyer=&token=usdc\|eth\|0x…&slippageBps=` | Quotes (QuoterV2, best of direct + via-WETH routes, loyalty applied) and returns `transactions` for EOAs and a `calls` batch for smart wallets |
| `GET /receipts/mine`, `GET /receipts/:id`, `GET /loyalty/:seller/:buyer` | Receipts with line items and payouts; loyalty progress |
| `GET /feed/live` (SSE, `?seller=`/`?shopId=`), `GET /feed/recent` | Live payment stream and recent geotagged payments for a map |
| `GET /basenames/resolve/:name`, `GET /basenames/reverse/:address` | Basenames forward / reverse (ENSIP-19 L2 reverse registrar, forward-verified) |
| `POST /ai/shop-setup` | Photo of a menu/price list (multipart `image`, or JSON `imageUrl`/`imageBase64`) → products; optional `shopId` saves them. Non-USD lists are flagged, not saved. |
| `GET /aa/config`, `POST /aa/paymaster`, `POST /aa/bundler` | ERC-4337 (EntryPoint v0.7) passkey smart-wallet support: ERC-7677 paymaster proxy that only sponsors checkout payments and `approve(checkout)`, and an allow-listed bundler proxy |

The indexer polls `QRushCheckout` logs, writes invoices/payments/payouts to SQLite in one transaction per
batch, and pushes payment events to the SSE feed after commit.


## Local setup

Requirements: Node 24, pnpm 9+ and [Foundry](https://book.getfoundry.sh/).

```bash
git clone https://github.com/comzzy/qrush.git && cd qrush
pnpm install

# contract dependencies (not committed)
cd contracts
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts --no-git
forge build
cd ..

# environment
cp api/.env.example api/.env              # fill in RPC_URL, JWT_SECRET, ...
cp web/.env.example web/.env.local
cp contracts/.env.example contracts/.env  # only needed to deploy

pnpm --filter qrush-api dev   # API on http://localhost:8787 (see PORT)
pnpm --filter qrush-web dev   # web on http://localhost:3000
```

Never commit `.env` files or private keys. The `.gitignore` already excludes them.

## Tests

```bash
cd contracts && forge test                  # unit tests
forge test --fork-url $BASE_RPC_URL         # Base mainnet fork tests
pnpm --filter qrush-api test                # API (vitest)
pnpm --filter qrush-web e2e                 # browser tests (Playwright)
```

## Deploying the contract

```bash
cd contracts
source .env     # BASE_RPC_URL, BASESCAN_API_KEY, DEPLOYER_PRIVATE_KEY
./deploy-base.sh
```

## Known limitations

- Paying with ETH against a signed-but-unpublished invoice takes two EOA transactions (publish, then
  pay), because `Multicall` is non-payable. Smart wallets batch both in one user operation. USDC/ERC20
  payments publish and pay in a single transaction.
- Prices are USDC-denominated. Photo-imported price lists in other currencies are returned flagged and not saved.
- Live geolocation relies on CDN headers (Vercel / Cloudflare / `x-geo-*`); payments fall back to the
  shop's location.
- The paymaster/bundler proxies are tested against a mock upstream; plug in a real provider URL for production.
- SQLite is single-node; run one API instance per database file.

## License

MIT, see [LICENSE](LICENSE).
