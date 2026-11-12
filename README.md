# AnyQR

Pay a merchant's bank QR code from any chain and token. NEAR Intents swaps the payment into USDC on NEAR, and the merchant gets paid in its own currency in the bank account printed in the QR. The local payout runs in demo mode for now.

Built for NEAR HACKATHON, track Real-World Money (`realworld`).

## The problem

In Southeast Asia and Latin America, shops show a bank QR code: VietQR in Vietnam, PromptPay in Thailand, QR Ph in the Philippines, QRIS in Indonesia, Pix in Brazil. A visitor who holds USDT on BNB Chain or SOL cannot pay it. Today the visitor has to find an exchange, sell, withdraw to a local bank account they do not have, then pay.

## What AnyQR does

1. The merchant (or the customer) pastes the QR. AnyQR reads it: country, currency, amount, bank account.
2. The payout operator prices the local amount in USDC. In this build the operator is Gaian, a payments company that pays out to local bank accounts, and the price comes from a demo rate (see "What is real").
3. NEAR Intents 1Click quotes the customer's own token for exactly that USDC amount, credited as USDC on NEAR to the operator's balance inside NEAR Intents (`recipientType: INTENTS`). The customer gets a deposit address and an exact amount.
4. AnyQR polls 1Click. As soon as 1Click reports the deposit, the merchant sees **Customer deposit received**.
5. Only after 1Click reports `SUCCESS` does the operator pay the bank account in the QR. Then the merchant sees **Paid**. A refunded or failed swap never triggers a payout.
6. The merchant sees one status page with a link to every transaction, and downloads a CSV an accountant can open.
7. Separately, in batches, the operator moves its USDC balance out of NEAR Intents to its own rail (`npm run settle`, see below). No bridge runs per payment.

Status names: `awaiting_deposit`, `processing` (shown as "Customer deposit received"), `settling`, `paid`, `refunded`, `failed`, `expired`.

## How NEAR is used

- **NEAR Intents 1Click API** does the cross-chain, cross-asset swap. AnyQR asks for `EXACT_OUTPUT` quotes, so the merchant always receives the full USDC amount and the customer's slippage buffer is refunded. Code: `src/oneclick.ts`, `src/payments.ts`.
- **USDC lands on NEAR.** Every payment is credited to the operator's NEAR account inside the NEAR Intents contract (`intents.near`), as native USDC on NEAR. Code: `src/delivery.ts`. Because there is no bridge step per payment, 1Click's time estimates are about 15 seconds shorter than delivering to another chain (table below).
- **Batch settle from NEAR Intents.** `npm run settle` reads the operator's USDC balance from `intents.near` (`mt_balance_of`, NEAR RPC) and asks 1Click for a dry quote that withdraws it to the operator's Stellar USDC account (`depositType: INTENTS`). It prints the plan and signs nothing. Code: `src/settle.ts`, `src/near.ts`.
- **Refunds** go back to the customer on their own chain (`refundType: ORIGIN_CHAIN`). AnyQR shows `REFUNDED` with the amount and reason.
- **Proof links** come from 1Click status (`originChainTxHashes`, `nearTxHashes`, `destinationChainTxHashes`) and the NEAR Intents explorer.
- Customers can pay with: USDT on BNB Chain, USDC on Base, Arbitrum, Ethereum, Solana or NEAR, SOL, ETH and NEAR. Token ids are resolved from `/v0/tokens` at runtime.

## Try it in two minutes (no wallet, no money)

Requirements: Node.js 20 or newer.

```bash
git clone https://github.com/KhaTruong123/anyqr.git
cd anyqr
npm install
npm test            # 40 tests, all offline
npm run demo:dry    # real 1Click quotes for 5 demo merchants in 5 countries
```

Do `npm run demo:dry`. See five payments, one per country, each with a real 1Click quote (`dry: true`), settled as USDC on NEAR to the operator's NEAR Intents balance, and the status path `awaiting_deposit > processing > settling > paid`. The last line prints the path of the CSV file.

Then the settle step:

```bash
npm run settle                  # reads the operator's USDC balance in NEAR Intents, prints the plan
npm run settle -- --preview 10  # prices a 10 USDC withdrawal to Stellar even if the balance is empty
```

Do `npm run settle -- --preview 10`. See the operator account, its USDC balance inside NEAR Intents, and the withdrawal plan: how much USDC arrives on Stellar, the bridge fee, and the time estimate. Nothing is signed.

Then the web app:

```bash
npm start           # http://127.0.0.1:3020
```

1. Open http://127.0.0.1:3020. Click **Vietnam, VietQR, 250,000 VND**. Type any BNB Chain address as the refund address. Click **Get quote**. See how much USDT the customer sends for 250,000 VND, priced live by 1Click, and "Settled as 9.72 USDC on NEAR (NEAR Intents balance)".
2. Click **Simulate the customer's deposit**. See the timeline show "Customer deposit received", then the USDC credited to the operator's NEAR Intents balance, then **Paid**.
3. Click **Thailand, PromptPay** on the first page. The QR has no amount, so type `150` and pick **SOL**. See the quote in SOL.
4. Open **Merchant ledger** and click **Download CSV**. See one row per payment, with local amount, USDC settled, where it was settled (`settled_to`, `settlement_recipient`), what the customer paid, and transaction links.

What is real and what is simulated in this mode:

| Step | Default mode |
|---|---|
| Reading the bank QR | Real |
| 1Click quote | Real, `dry: true` |
| Customer deposit and swap | Simulated, no deposit address is issued |
| USDC recipient | Placeholder `anyqr-demo.near` unless `SETTLEMENT_NEAR_ACCOUNT` is set, only used to get a price |
| Operator balance read (`npm run settle`) | Real, NEAR mainnet RPC |
| Withdrawal from NEAR Intents | Dry quote only, never signed |
| Local currency payout | Mock: demo rate, no money moves (`GAIAN_MODE=mock`) |

The local payout is a mock in every mode of this build. It stands for the operator's existing bank payout service, which is not part of the hackathon work.

Swap time estimates from 1Click, same 5 payments, read on 2026-11-12:

| Payment | USDC on NEAR (default) | USDC on Stellar (`DELIVER_TO=stellar`) |
|---|---|---|
| Vietnam, 250,000 VND, USDT on BNB Chain | 35 s | 50 s |
| Thailand, 150 THB, SOL | 22 s | 37 s |
| Philippines, 450 PHP, USDC on Base | 35 s | 50 s |
| Indonesia, 75,000 IDR, NEAR | 22 s | 37 s |
| Brazil, 32.50 BRL, USDC on Arbitrum | 25 s | 40 s |

These are 1Click's estimates, not end-to-end measurements.

## Live mode (mainnet, real money)

NEAR Intents has no testnet. Live mode creates real deposit addresses on mainnet.

```bash
cp .env.example .env
# set INTENTS_MODE=live and SETTLEMENT_NEAR_ACCOUNT (the operator's NEAR account, it must exist)
npm start
```

Each payment page then shows a deposit address with a QR code, the exact amount, and the deadline. Status changes come from 1Click. The USDC is credited to `SETTLEMENT_NEAR_ACCOUNT` inside NEAR Intents. Live mode refuses to start without a real recipient.

### Optional: deliver to Stellar on every payment

`DELIVER_TO=stellar` switches back to the first design: 1Click withdraws USDC on Stellar to `SETTLEMENT_STELLAR_ADDRESS` (a Stellar account with a USDC trustline) for each payment. The Gaian sandbox payout (`GAIAN_MODE=sandbox`) needs this mode, because it funds each order with a Stellar transaction.

### Mainnet test run

One real payment on 2026-11-12, made with live mode and a personal wallet:

- Merchant QR: a VietQR for 26,000 VND (demo shop, the local payout is mock).
- Customer sent 1.021274 USDT on BNB Chain: [BscScan](https://bscscan.com/tx/0x69023a321d64f553b96cbcefd3fe0edc9b7387f0a9492895a3da05a8cddfa243)
- 1Click swap: [NEAR Intents explorer](https://explorer.near-intents.org/transactions/0x45b5c954867f4AD198024bf62b4bEfc9565EBddf)
- The operator account received 1.01 USDC on NEAR inside NEAR Intents: [NEAR transaction](https://nearblocks.io/txns/6f1cXSpD3efP8U6ovJhr4S3h1fMkkvw3H8FxYat95zka), [NEAR transaction](https://nearblocks.io/txns/EVPVgnvgaPvmP9qni4jVsBbSPxo2xdJyLGbgvp8Ghs95), [operator account](https://nearblocks.io/address/f9277d65f4edff529c6d682397f5786daa7624dd5da10e2c94094613ffa03649)
- 1Click saw the deposit at 16:31:39 UTC and reported SUCCESS at 16:31:49 UTC.

## Safety limits

- `MAX_PAYMENT_USD` (default 20) is checked before any quote is shown.
- The amount printed in a QR cannot be changed by the payer.
- Refund addresses are checked per chain. NEAR refund accounts are checked against NEAR RPC, because 1Click cannot refund to an account that does not exist.
- The payout runs only after 1Click reports `SUCCESS`. A refunded or failed swap never triggers a payout.
- Live mode never uses a placeholder recipient, and checks that a named `SETTLEMENT_NEAR_ACCOUNT` exists on NEAR mainnet.
- `npm run settle` only reads and quotes. It has no code path that signs.
- The server listens on `127.0.0.1` by default. Keys live in `.env`, which git ignores.
- CSV cells that start with `=`, `+`, `-` or `@` are escaped, so a merchant name cannot run a spreadsheet formula.

## Findings from building on 1Click

- With `recipientType: INTENTS`, 1Click accepts any NEAR account name as the recipient, even one that does not exist. AnyQR checks the account itself in live mode.
- 1Click checks that a Stellar recipient trusts USDC before it quotes, and says so in the error. In `DELIVER_TO=stellar` mode the settlement account must open the trustline first.
- 1Click can pause a route for a while. On 2026-11-12 at 16:16 UTC every pair from Solana answered "Quoting for this pair is not available", twenty minutes after it had quoted fine. `npm run demo:dry` then prints `FAILED` for that country, carries on with the others, and exits with code 1.
- Swaps from Tron have a $100 minimum right now, so Tron is not offered for small shop payments.
- A quote with a NEAR refund account that does not exist returns HTTP 500. AnyQR checks the account first and shows a clear error.

## What was built during the hackathon

The hackathon window opened on 2026-10-19. Two tags separate the work:

- `pre-hackathon`: a VietQR checksum helper and a Gaian API client written on 2026-10-17 for a private prototype. See `BASELINE.md`.
- `hackathon-submission`: everything else.

Diff: https://github.com/KhaTruong123/anyqr/compare/pre-hackathon...hackathon-submission

Built during the hackathon: the multi-country EMVCo QR reader (5 schemes), the 1Click integration with USDC credited inside NEAR Intents, the settle planner, the payment lifecycle and poller, the status page, the merchant ledger, the CSV export, the dry-run demo and all tests except the two baseline test files.

## Project layout

```
src/emv-qr.ts           reads VietQR, PromptPay, QR Ph, QRIS and Pix codes
src/countries.ts        supported countries and currencies
src/oneclick.ts         NEAR Intents 1Click client
src/delivery.ts         where 1Click delivers the USDC (NEAR Intents balance or Stellar)
src/near.ts             read-only NEAR RPC: account check, NEAR Intents balance
src/settle.ts           plans the batch withdrawal from NEAR Intents
src/payments.ts         payment lifecycle: price, deposit, swap, payout
src/gaian/settlement.ts local-currency payout (mock or Gaian API)
src/csv.ts              accountant CSV
src/server.ts           HTTP API and pages
public/                 checkout, status page, merchant ledger
scripts/demo-dry.ts     one-command demo
scripts/settle.ts       npm run settle
```

## Libraries

express, dotenv, qrcode, @stellar/stellar-sdk, tsx, typescript. AI coding tools helped write this code.

## License

MIT, see `LICENSE`.
