// One row per payment, columns an accountant can read without a glossary.
import { deliveryLabel } from "./delivery.js";
import { intentsExplorerUrl, nearTxUrl } from "./oneclick.js";
import type { Payment } from "./payment-types.js";

const COLUMNS: Array<[string, (p: Payment) => string | number | undefined]> = [
  ["payment_id", (p) => p.id],
  ["created_utc", (p) => p.createdAt],
  ["deposit_received_utc", (p) => p.depositReceivedAt],
  ["paid_utc", (p) => p.paidAt],
  ["status", (p) => p.status],
  ["merchant", (p) => p.merchant.name],
  ["merchant_country", (p) => p.merchant.country],
  ["qr_scheme", (p) => p.merchant.scheme],
  ["merchant_account_last4", (p) => p.merchant.account.slice(-4)],
  ["amount_local", (p) => p.amountLocal],
  ["currency_local", (p) => p.currency],
  ["settled_usdc", (p) => p.usdc],
  ["settled_to", (p) => deliveryLabel(p.delivery.target)],
  ["settlement_recipient", (p) => p.delivery.recipient],
  ["customer_paid_amount", (p) => p.quote.amountInFormatted],
  ["customer_paid_token", (p) => p.origin.symbol],
  ["customer_paid_chain", (p) => p.origin.blockchain],
  ["customer_paid_usd", (p) => p.quote.amountInUsd],
  ["refunded_amount", (p) => p.refundedAmount],
  ["refund_reason", (p) => p.refundReason],
  ["customer_tx", (p) => p.originTxs.map((t) => t.explorerUrl || t.hash).join(" ")],
  ["near_intents_explorer", (p) => (p.quote.depositAddress ? intentsExplorerUrl(p.quote.depositAddress) : "")],
  ["near_tx", (p) => p.nearTxs.map(nearTxUrl).join(" ")],
  ["destination_tx", (p) => p.destinationTxs.map((t) => t.explorerUrl || t.hash).join(" ")],
  ["payout_reference", (p) => p.gaianOrderId],
  ["mode", (p) => [p.simulated ? "simulated deposit" : "mainnet", p.demoPayout ? "demo payout" : "gaian payout"].join(", ")],
];

function cell(v: string | number | undefined): string {
  const s = v === undefined || v === null ? "" : String(v);
  // Quote everything that could break a column, and neutralise spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) || safe !== s ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function paymentsToCsv(payments: Payment[]): string {
  const header = COLUMNS.map(([name]) => name).join(",");
  const rows = payments.map((p) => COLUMNS.map(([, get]) => cell(get(p))).join(","));
  return [header, ...rows].join("\r\n") + "\r\n";
}
