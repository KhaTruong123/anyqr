// One payment, from a scanned bank QR to "paid".
// Money order is fixed on purpose:
//   1. price   : Gaian prices the local amount in USDC, 1Click prices the customer's token. Nothing moves.
//   2. deposit : the customer sends the token to the 1Click deposit address.
//   3. swap    : NEAR Intents credits USDC to the operator's NEAR Intents balance (or, in
//                DELIVER_TO=stellar mode, withdraws it to a Stellar account), or refunds the customer.
//   4. payout  : only after step 3 reports SUCCESS does Gaian pay the bank account in the QR.
// The operator moves its NEAR Intents balance to its own rail later, in batches (`npm run settle`).
import crypto from "node:crypto";
import { DELIVERY_ASSET, recipientType, type Delivery } from "./delivery.js";
import { maskAccount, parseEmvQr, QrError } from "./emv-qr.js";
import type { Settlement } from "./gaian/settlement.js";
import { ORIGIN_CHOICES, toBaseUnits, type OneClickClient, type StatusResponse } from "./oneclick.js";
import { nearAccountExists } from "./near.js";
import { TERMINAL, type Payment, type PaymentStatus } from "./payment-types.js";
import type { PaymentStore } from "./store.js";

export class PaymentError extends Error {
  constructor(
    message: string,
    readonly httpStatus = 400,
  ) {
    super(message);
  }
}

export interface CreatePaymentInput {
  qr: string;
  amount?: number; // local currency, required when the QR has no amount
  origin: string; // "bsc:USDT"
  refundTo: string;
}

const now = () => new Date().toISOString();

const ADDRESS_RULES: Record<string, RegExp> = {
  bsc: /^0x[0-9a-fA-F]{40}$/,
  base: /^0x[0-9a-fA-F]{40}$/,
  arb: /^0x[0-9a-fA-F]{40}$/,
  eth: /^0x[0-9a-fA-F]{40}$/,
  sol: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  tron: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  near: /^([a-z0-9]+[-_])*[a-z0-9]+(\.([a-z0-9]+[-_])*[a-z0-9]+)*$|^[0-9a-f]{64}$/,
};

export class PaymentService {
  constructor(
    private readonly store: PaymentStore,
    private readonly oneClick: OneClickClient,
    private readonly settlement: Settlement,
    private readonly opts: {
      simulated: boolean;
      delivery: Delivery;
      maxPaymentUsd: number;
      slippageBps: number;
      depositWindowMinutes: number;
    },
  ) {}

  private get delivered(): string {
    const { target, recipient } = this.opts.delivery;
    return target === "intents" ? `credited to the operator's NEAR Intents balance (${recipient})` : `delivered on Stellar to ${recipient}`;
  }

  async create(input: CreatePaymentInput): Promise<Payment> {
    let parsed;
    try {
      parsed = parseEmvQr(input.qr);
    } catch (err) {
      throw new PaymentError(err instanceof QrError ? err.message : "Could not read this QR");
    }

    const amountLocal = parsed.amount ?? input.amount;
    if (!amountLocal || !(amountLocal > 0)) throw new PaymentError(`This QR has no amount, enter the amount in ${parsed.country.currency}`);
    if (parsed.amount !== null && input.amount && input.amount !== parsed.amount) {
      throw new PaymentError(`The QR asks for ${parsed.amount} ${parsed.country.currency}, it cannot be changed`);
    }

    const choice = ORIGIN_CHOICES.find((c) => `${c.blockchain}:${c.symbol}` === input.origin);
    if (!choice) throw new PaymentError(`Unsupported token "${input.origin}"`);
    const rule = ADDRESS_RULES[choice.blockchain];
    if (rule && !rule.test(input.refundTo.trim())) throw new PaymentError(`Refund address is not a valid ${choice.label} address`);
    if (choice.blockchain === "near" && !(await nearAccountExists(input.refundTo.trim()))) {
      throw new PaymentError(`NEAR account ${input.refundTo.trim()} does not exist, refunds would have nowhere to go`);
    }
    if (!this.opts.delivery.recipient) throw new PaymentError("No settlement recipient is configured", 500);

    const local = await this.settlement.quote(input.qr, parsed, amountLocal);
    if (Number(local.usdc) > this.opts.maxPaymentUsd) {
      throw new PaymentError(`Payment is ${local.usdc} USDC, above the ${this.opts.maxPaymentUsd} USDC limit per payment`);
    }

    const [originToken, usdcToken] = await Promise.all([
      this.oneClick.findToken(choice.blockchain, choice.symbol),
      this.oneClick.findToken(DELIVERY_ASSET[this.opts.delivery.target].blockchain, DELIVERY_ASSET[this.opts.delivery.target].symbol),
    ]);
    if (!originToken || !usdcToken) throw new PaymentError("NEAR Intents does not list this token right now", 503);

    const deadline = new Date(Date.now() + this.opts.depositWindowMinutes * 60_000).toISOString();
    const quote = await this.oneClick.quote({
      dry: this.opts.simulated,
      swapType: "EXACT_OUTPUT",
      slippageTolerance: this.opts.slippageBps,
      originAsset: originToken.assetId,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: usdcToken.assetId,
      amount: toBaseUnits(local.usdc, usdcToken.decimals),
      refundTo: input.refundTo.trim(),
      refundType: "ORIGIN_CHAIN",
      recipient: this.opts.delivery.recipient,
      recipientType: recipientType(this.opts.delivery.target),
      deadline,
    });
    if (!this.opts.simulated && !quote.depositAddress) throw new PaymentError("1Click returned no deposit address", 502);

    const payment: Payment = {
      id: crypto.randomUUID(),
      createdAt: now(),
      updatedAt: now(),
      status: "awaiting_deposit",
      simulated: this.opts.simulated,
      demoPayout: local.demo,
      merchant: {
        name: parsed.merchantName || "Merchant",
        city: parsed.merchantCity,
        country: parsed.country.code,
        scheme: parsed.scheme,
        account: maskAccount(parsed.account),
        bankId: parsed.bankId,
      },
      qr: input.qr.trim(),
      amountLocal,
      currency: parsed.country.currency,
      usdc: local.usdc,
      delivery: { ...this.opts.delivery, assetId: usdcToken.assetId },
      origin: { assetId: originToken.assetId, blockchain: choice.blockchain, symbol: choice.symbol, label: choice.label, decimals: originToken.decimals },
      refundTo: input.refundTo.trim(),
      quote: {
        amountIn: quote.amountIn,
        amountInFormatted: quote.amountInFormatted,
        amountInUsd: quote.amountInUsd,
        minAmountIn: quote.minAmountIn,
        timeEstimate: quote.timeEstimate,
        depositAddress: quote.depositAddress,
        depositMemo: quote.depositMemo,
        deadline: quote.deadline ?? deadline,
      },
      originTxs: [],
      destinationTxs: [],
      nearTxs: [],
      gaianQuoteId: local.gaianQuoteId,
      history: [],
    };
    this.move(payment, "awaiting_deposit", this.opts.simulated ? "Dry quote from 1Click. No deposit address, the deposit can be simulated." : "Quote ready, waiting for the customer's deposit.");
    return payment;
  }

  get(id: string): Payment | undefined {
    return this.store.get(id);
  }

  list(): Payment[] {
    return this.store.all();
  }

  // Speeds up 1Click: it starts looking for the deposit as soon as it knows the hash.
  async submitDepositTx(id: string, txHash: string): Promise<Payment> {
    const p = this.require(id);
    if (p.simulated || !p.quote.depositAddress) throw new PaymentError("This payment has no real deposit address");
    await this.oneClick.submitDeposit(p.quote.depositAddress, txHash.trim());
    this.note(p, `Customer reported deposit tx ${txHash.trim()}`);
    return p;
  }

  // Dry mode only: walks the same states a real payment goes through, without tx links.
  async simulateDeposit(id: string): Promise<Payment> {
    const p = this.require(id);
    if (!p.simulated) throw new PaymentError("Only dry-run payments can be simulated", 409);
    if (p.status !== "awaiting_deposit") throw new PaymentError(`Payment is already ${p.status}`, 409);
    this.depositReceived(p, "Simulated: customer deposit received. NEAR Intents is swapping it to USDC.");
    p.swapStatus = "SUCCESS";
    this.move(p, "settling", `Simulated: swap done, ${p.usdc} USDC ${this.delivered}.`);
    await this.payout(p);
    return p;
  }

  // Asks 1Click and Gaian for news on every open payment.
  async pollAll(): Promise<void> {
    for (const p of this.store.all()) {
      if (TERMINAL.includes(p.status)) continue;
      try {
        await this.poll(p);
      } catch (err) {
        p.error = err instanceof Error ? err.message : String(err);
        this.store.save(p);
      }
    }
  }

  async poll(p: Payment): Promise<void> {
    if (p.status === "settling" && p.gaianOrderId) {
      const state = await this.settlement.refresh(p.gaianOrderId);
      if (state === "completed") this.markPaid(p);
      if (state === "failed") this.move(p, "failed", "Gaian payout failed. The USDC stays with the operator.");
      return;
    }
    if (p.simulated || !p.quote.depositAddress) return;
    const s = await this.oneClick.status(p.quote.depositAddress, p.quote.depositMemo);
    await this.applySwapStatus(p, s);
  }

  async applySwapStatus(p: Payment, s: StatusResponse): Promise<void> {
    const d = s.swapDetails ?? {};
    p.swapStatus = s.status;
    p.originTxs = d.originChainTxHashes ?? p.originTxs;
    p.destinationTxs = d.destinationChainTxHashes ?? p.destinationTxs;
    p.nearTxs = d.nearTxHashes ?? p.nearTxs;

    switch (s.status) {
      case "PENDING_DEPOSIT":
        if (Date.now() > Date.parse(p.quote.deadline) + 10 * 60_000) this.move(p, "expired", "No deposit before the deadline. Nothing was charged.");
        else this.store.save(p);
        return;
      case "INCOMPLETE_DEPOSIT":
        this.note(p, `Deposit too small (${d.depositedAmountFormatted ?? "?"} ${p.origin.symbol}). 1Click refunds it after the deadline unless the rest arrives.`);
        return;
      case "KNOWN_DEPOSIT_TX":
      case "PROCESSING":
        if (p.status === "awaiting_deposit") this.depositReceived(p, "Customer deposit received. NEAR Intents is swapping it to USDC.");
        else this.store.save(p);
        return;
      case "SUCCESS":
        if (p.status === "awaiting_deposit" || p.status === "processing") {
          p.depositReceivedAt ??= now();
          this.move(p, "settling", `Swap done, ${d.amountOutFormatted ?? p.usdc} USDC ${this.delivered}.`);
          await this.payout(p);
        }
        return;
      case "REFUNDED":
        p.refundedAmount = d.refundedAmountFormatted;
        p.refundReason = d.refundReason;
        this.move(p, "refunded", `Swap did not complete. ${d.refundedAmountFormatted ?? ""} ${p.origin.symbol} refunded to ${p.refundTo}.`.replace(/\s+/g, " "));
        return;
      case "FAILED":
        this.move(p, "failed", "1Click reported FAILED. Check the NEAR Intents explorer link.");
        return;
    }
  }

  private async payout(p: Payment): Promise<void> {
    const r = await this.settlement.payout(p.gaianQuoteId);
    p.gaianOrderId = r.gaianOrderId ?? p.gaianOrderId;
    p.payoutTxHash = r.stellarTxHash ?? p.payoutTxHash;
    if (r.state === "completed") return this.markPaid(p);
    if (r.state === "failed") {
      p.error = r.error;
      return this.move(p, "failed", `Gaian payout failed: ${r.error ?? "unknown error"}. The USDC stays with the operator.`);
    }
    this.note(p, "Gaian is paying the bank account.");
  }

  private markPaid(p: Payment): void {
    p.paidAt = now();
    const where = `${p.merchant.scheme} account ${p.merchant.account}`;
    const amount = `${p.amountLocal.toLocaleString("en-US")} ${p.currency}`;
    this.move(p, "paid", p.demoPayout ? `Demo payout: ${amount} to ${where} (mock, no money moved).` : `${amount} paid to ${where}.`);
  }

  private require(id: string): Payment {
    const p = this.store.get(id);
    if (!p) throw new PaymentError("Payment not found", 404);
    return p;
  }

  private depositReceived(p: Payment, note: string): void {
    p.depositReceivedAt = now();
    this.move(p, "processing", note);
  }

  private move(p: Payment, status: PaymentStatus, note: string): void {
    p.status = status;
    this.note(p, note);
  }

  private note(p: Payment, note: string): void {
    p.updatedAt = now();
    p.history.push({ at: p.updatedAt, status: p.status, note });
    this.store.save(p);
  }
}
