# AnyQR

Pay a merchant's bank QR code from any chain and token. The merchant gets local currency in the bank account printed in the QR.

Built for NEAR HACKATHON, track Real-World Money (`realworld`).

## The problem

In Southeast Asia and Latin America, shops show a bank QR code: VietQR in Vietnam, PromptPay in Thailand, QR Ph in the Philippines, QRIS in Indonesia, Pix in Brazil. A visitor who holds USDT on BNB Chain or SOL cannot pay it. Today the visitor has to find an exchange, sell, withdraw to a local bank account they do not have, then pay.

## What AnyQR does

1. The merchant (or the customer) pastes the QR. AnyQR reads it: country, currency, amount, bank account.
2. Gaian, a payments company that pays out to local bank accounts, prices the local amount in USDC on Stellar.
3. NEAR Intents 1Click quotes the customer's own token for exactly that USDC amount, delivered to the settlement account on Stellar. The customer gets a deposit address and an exact amount.
4. AnyQR polls 1Click until the swap is `SUCCESS`, `REFUNDED` or `FAILED`.
5. Only after `SUCCESS` does Gaian pay the bank account in the QR.
6. The merchant sees one status page (`awaiting deposit`, `processing`, `settling`, `paid`, `refunded`, `failed`, `expired`) with a link to every transaction, and downloads a CSV an accountant can open.

## How NEAR is used

- **NEAR Intents 1Click API** does the cross-chain, cross-asset swap. AnyQR asks for `EXACT_OUTPUT` quotes, so the merchant always receives the full USDC amount and the customer's slippage buffer is refunded. Code: `src/oneclick.ts`, `src/payments.ts`.
- **Refunds** go back to the customer on their own chain (`refundType: ORIGIN_CHAIN`). AnyQR shows `REFUNDED` with the amount and reason.
- **Proof links** come from 1Click status (`originChainTxHashes`, `nearTxHashes`, `destinationChainTxHashes`) and the NEAR Intents explorer.
- Customers can pay with: USDT on BNB Chain, USDC on Base, Arbitrum, Ethereum, Solana or NEAR, SOL, ETH and NEAR. Token ids are resolved from `/v0/tokens` at runtime.

## Try it in two minutes (no wallet, no money)

Requirements: Node.js 20 or newer.

```bash
git clone https://github.com/KhaTruong123/anyqr.git
cd anyqr
npm install
npm test            # 23 tests, all offline
npm run demo:dry    # real 1Click quotes for 5 demo merchants in 5 countries
```

Do `npm run demo:dry`. See five payments, one per country, each with a real 1Click quote (`dry: true`) and the status path `awaiting_deposit > processing > settling > paid`. The last line prints the path of the CSV file.

Then the web app:

```bash
npm start           # http://127.0.0.1:3020
```

1. Open http://127.0.0.1:3020. Click **Vietnam, VietQR, 250,000 VND**. Type any BNB Chain address as the refund address. Click **Get quote**. See how much USDT the customer sends for 250,000 VND, priced live by 1Click.
2. Click **Simulate the customer's deposit**. See the status move to **Paid** and the timeline fill in.
3. Click **Thailand, PromptPay** on the first page. The QR has no amount, so type `150` and pick **SOL**. See the quote in SOL.
4. Open **Merchant ledger** and click **Download CSV**. See one row per payment, with local amount, USDC settled, what the customer paid, and transaction links.

What is real and what is simulated in this mode:

| Step | Default mode |
|---|---|
| Reading the bank QR | Real |
| 1Click quote | Real, `dry: true` |
| Customer deposit and swap | Simulated, no deposit address is issued |
| Local currency payout | Demo rate, no money moves (`GAIAN_MODE=mock`) |

## Live mode (mainnet, real money)

NEAR Intents has no testnet. Live mode creates real deposit addresses on mainnet.

```bash
cp .env.example .env
# set INTENTS_MODE=live and SETTLEMENT_STELLAR_ADDRESS (your own Stellar account with a USDC trustline)
npm start
```

Each payment page then shows a deposit address with a QR code, the exact amount, and the deadline. Status changes come from 1Click. The local payout leg needs Gaian API credentials (`GAIAN_MODE=sandbox`); without them it stays in demo mode and every page says so.

### Mainnet test run

Pending. The links of one real payment with a small amount will be added here.

## Safety limits

- `MAX_PAYMENT_USD` (default 20) is checked before any quote is shown.
- The amount printed in a QR cannot be changed by the payer.
- Refund addresses are checked per chain. NEAR refund accounts are checked against NEAR RPC, because 1Click cannot refund to an account that does not exist.
- The payout runs only after 1Click reports `SUCCESS`. A refunded or failed swap never triggers a payout.
- The server listens on `127.0.0.1` by default. Keys live in `.env`, which git ignores.
- CSV cells that start with `=`, `+`, `-` or `@` are escaped, so a merchant name cannot run a spreadsheet formula.

## Findings from building on 1Click

- 1Click checks that the Stellar recipient trusts USDC before it quotes, and says so in the error. The settlement account must open the trustline first.
- Swaps from Tron have a $100 minimum right now, so Tron is not offered for small shop payments.
- A quote with a NEAR refund account that does not exist returns HTTP 500. AnyQR checks the account first and shows a clear error.

## What was built during the hackathon

The hackathon window opened on 2026-10-19. Two tags separate the work:

- `pre-hackathon`: a VietQR checksum helper and a Gaian API client written on 2026-10-17 for a private prototype. See `BASELINE.md`.
- `hackathon-submission`: everything else.

Diff: https://github.com/KhaTruong123/anyqr/compare/pre-hackathon...hackathon-submission

Built during the hackathon: the multi-country EMVCo QR reader (5 schemes), the 1Click integration, the payment lifecycle and poller, the status page, the merchant ledger, the CSV export, the dry-run demo and all tests except the two baseline test files.

## Project layout

```
src/emv-qr.ts           reads VietQR, PromptPay, QR Ph, QRIS and Pix codes
src/countries.ts        supported countries and currencies
src/oneclick.ts         NEAR Intents 1Click client
src/payments.ts         payment lifecycle: price, deposit, swap, payout
src/gaian/settlement.ts local-currency payout (mock or Gaian API)
src/csv.ts              accountant CSV
src/server.ts           HTTP API and pages
public/                 checkout, status page, merchant ledger
scripts/demo-dry.ts     one-command demo
```

## Libraries

express, dotenv, qrcode, @stellar/stellar-sdk, tsx, typescript. AI coding tools helped write this code.

## License

MIT, see `LICENSE`.
