# QRush

QRush lets a shop take payment in digital dollars with a QR code, and the money goes straight to the shop's own wallet.

## The problem

Say you run a small shop in Lagos. Some of your customers would like to pay you in crypto. Taking it usually means you need to know about wallets, networks and exchange rates. If a customer sends the wrong coin, you may end up holding something whose price moves every hour. Most small shops decide it isn't worth the trouble.

## What QRush does

QRush gives your shop a page and a QR code. A customer scans it and pays. Whatever they pay with, you get USDC, a digital dollar that stays at $1. The payment goes straight to your wallet. QRush never holds your money.

## For sellers

1. Open https://qrushpay.vercel.app/app.
2. Choose how to sign in. "Passkey wallet" is the easiest. It uses your phone's fingerprint or face unlock, and you don't have to write down any words. You can also use a wallet app you already have.
3. Create your shop with its name and city.
4. Add your products. Type them in, or take a photo of your price list and QRush will fill them in for you. Check them before you save.
5. Register your shop on Base. You only do this once. It needs a tiny amount of ETH in your wallet for the network fee (about $0.20 is more than enough). The dashboard shows your address and a QR code so you can top it up.
6. Make a pay link for a product or an amount. Print its QR code, or share the link on WhatsApp or anywhere else.
7. When someone pays, it shows up on your dashboard with a receipt.

You can also split each payment between partners (for example 70% to you, 30% to a supplier), and give repeat customers a discount.

## For buyers

1. Scan the shop's QR code with your phone camera, or open the link they sent you.
2. Connect your wallet.
3. Pay with USDC, ETH or another common token. If it isn't USDC, it is swapped to USDC in the same payment, so the shop gets the exact price.
4. You get a receipt you can open again later.

## What it costs

QRush charges no fee. Each payment costs a small Base network fee, paid by whoever sends it (usually under one cent). Sellers pay the same kind of fee once, to register their shop.

## Questions

**Do I need crypto experience?**
No. With a passkey wallet you sign in with your fingerprint or face. The only crypto step is adding a little ETH to your wallet once to pay network fees.

**What is USDC?**
A digital dollar. One USDC is meant to be worth one US dollar, so your takings don't go up and down like other crypto.

**What is Base?**
The network the payments run on. It is fast and very cheap to use, which is why the fees are fractions of a cent.

**Is my money safe?**
Payments go from the buyer straight to your wallet through a public contract. QRush can't hold, freeze or move your money. Look after your wallet and its passkey, because whoever controls it controls the funds.

**Do I need a seed phrase?**
Not with the passkey wallet. It is tied to your device's passkey. If you use another wallet app, that app's usual backup rules apply.

## Links

- App: https://qrushpay.vercel.app
- Contract on Basescan (verified): [0x6E41C4C993f0C2967eB9F8a3B27E9AD1E0dDb12e](https://basescan.org/address/0x6E41C4C993f0C2967eB9F8a3B27E9AD1E0dDb12e)

---

## For developers

### Layout

```
contracts/   Foundry project: QRushCheckout contract, tests, deploy script
api/         TypeScript API (Hono, viem, SQLite + drizzle): sign-in, shops, invoices, indexer, feed
web/         Next.js app: landing page, seller dashboard, pay page, receipts, live map
```

In production the web app serves the API under `/api`, so one Vercel project runs both.

The contract handles seller registration, payout splits, invoices and pay links (including EIP-712 signed ones), and payments in USDC, ETH or ERC20. Non-USDC payments are exact-output swaps on Uniswap v3 with a deadline and a max input, and unused input is refunded. Every payment emits a receipt event that the API indexes.

### Setup

You need Node 24, pnpm and [Foundry](https://book.getfoundry.sh/).

```bash
git clone https://github.com/comzzy/qrush.git && cd qrush
pnpm install

cd contracts
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts --no-git
forge build
cd ..

cp api/.env.example api/.env              # RPC_URL, JWT_SECRET, CHECKOUT_ADDRESS, ...
cp web/.env.example web/.env.local        # site URL, WalletConnect project id
cp contracts/.env.example contracts/.env  # only needed to deploy

pnpm --filter qrush-api dev   # API on port 8787
pnpm --filter qrush-web dev   # web on port 3000
```

Don't commit `.env` files or keys. They are already in `.gitignore`.

### Tests

```bash
cd contracts && forge test                    # contract unit tests
forge test --fork-url $BASE_RPC_URL           # Base mainnet fork tests
pnpm --filter qrush-api test                  # API tests
pnpm --filter qrush-web e2e                   # browser tests
```

### Deploying the contract

```bash
cd contracts
source .env     # BASE_RPC_URL, BASESCAN_API_KEY, DEPLOYER_PRIVATE_KEY
./deploy-base.sh
```

### Known limits

- Paying in ETH for a signed invoice that isn't published yet takes two transactions from a normal wallet. Smart wallets do it in one.
- Prices are in USDC. Photo-imported price lists in other currencies are flagged, not saved.
- SQLite is single-node. Run one API instance per database file.

## License

MIT. See [LICENSE](LICENSE).
