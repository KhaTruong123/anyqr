import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { paymentsToCsv } from "../src/csv.js";
import { MockSettlement } from "../src/gaian/settlement.js";
import type { DeliveryTarget } from "../src/config.js";
import type { OneClickClient, QuoteRequest, StatusResponse, Token } from "../src/oneclick.js";
import { STATUS_LABEL } from "../src/payment-types.js";
import { PaymentError, PaymentService } from "../src/payments.js";
import { SAMPLE_QRS } from "../src/sample-qrs.js";
import { PaymentStore } from "../src/store.js";

const TOKENS: Token[] = [
  { assetId: "nep141:bnb-usdt", blockchain: "bsc", symbol: "USDT", decimals: 18, price: 1 },
  { assetId: "nep245:stellar-usdc", blockchain: "stellar", symbol: "USDC", decimals: 7, price: 1 },
  { assetId: "nep141:near-usdc", blockchain: "near", symbol: "USDC", decimals: 6, price: 1 },
];
const OPERATOR = "anyqr-operator.near";
const EVM_REFUND = "0x2527D02599Ba641c19FEa793cD0F167589a0f10D";
const STELLAR = "GA2226DVH7XAGTRL7LELZ35V5QEAJDVQZLZOEKEIMXBGHB3CB5FCYYPH";
const vnQr = SAMPLE_QRS.find((s) => s.id === "vn")!.qr;
const thQr = SAMPLE_QRS.find((s) => s.id === "th")!.qr;

function fakeOneClick() {
  const quotes: QuoteRequest[] = [];
  let status: StatusResponse = { status: "PENDING_DEPOSIT", updatedAt: "", swapDetails: {} };
  const client = {
    findToken: async (b: string, s: string) => TOKENS.find((t) => t.blockchain === b && t.symbol === s),
    quote: async (req: QuoteRequest) => {
      quotes.push(req);
      return {
        amountIn: "9710000000000000000",
        amountInFormatted: "9.71",
        amountInUsd: "9.70",
        minAmountIn: "9610000000000000000",
        amountOut: req.amount,
        amountOutFormatted: "9.62",
        timeEstimate: 52,
        ...(req.dry ? {} : { depositAddress: "0xDEPOSIT000000000000000000000000000000001", deadline: req.deadline }),
      };
    },
    status: async () => status,
    submitDeposit: async () => ({}),
  };
  return { client: client as unknown as OneClickClient, quotes, setStatus: (s: StatusResponse) => (status = s) };
}

class CountingSettlement extends MockSettlement {
  payouts = 0;
  override async payout() {
    this.payouts++;
    return super.payout();
  }
}

function service(simulated: boolean, target: DeliveryTarget = "intents") {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "anyqr-")), "payments.json");
  const oc = fakeOneClick();
  const settlement = new CountingSettlement();
  const svc = new PaymentService(new PaymentStore(file), oc.client, settlement, {
    simulated,
    delivery: { target, recipient: target === "intents" ? OPERATOR : STELLAR },
    maxPaymentUsd: 20,
    slippageBps: 100,
    depositWindowMinutes: 30,
  });
  return { svc, oc, file, settlement };
}

test("default: asks 1Click for exactly the USDC amount, credited to the operator inside NEAR Intents", async () => {
  const { svc, oc } = service(true);
  const p = await svc.create({ qr: vnQr, origin: "bsc:USDT", refundTo: EVM_REFUND });
  // 250,000 VND at the demo rate of 26,000 plus 1% demo spread, rounded up to the cent.
  assert.equal(p.usdc, "9.72");
  assert.equal(p.status, "awaiting_deposit");
  const req = oc.quotes[0];
  assert.equal(req.dry, true);
  assert.equal(req.swapType, "EXACT_OUTPUT");
  assert.equal(req.amount, "9720000"); // USDC on NEAR has 6 decimals
  assert.equal(req.destinationAsset, "nep141:near-usdc");
  assert.equal(req.recipientType, "INTENTS");
  assert.equal(req.recipient, OPERATOR);
  assert.equal(req.refundTo, EVM_REFUND);
  assert.equal(req.refundType, "ORIGIN_CHAIN");
  assert.deepEqual(p.delivery, { target: "intents", recipient: OPERATOR, assetId: "nep141:near-usdc" });
});

test("DELIVER_TO=stellar keeps the old route: USDC withdrawn on Stellar to the settlement account", async () => {
  const { svc, oc } = service(true, "stellar");
  const p = await svc.create({ qr: vnQr, origin: "bsc:USDT", refundTo: EVM_REFUND });
  const req = oc.quotes[0];
  assert.equal(req.amount, "97200000"); // USDC on Stellar has 7 decimals
  assert.equal(req.destinationAsset, "nep245:stellar-usdc");
  assert.equal(req.recipientType, "DESTINATION_CHAIN");
  assert.equal(req.recipient, STELLAR);
  assert.equal(p.delivery.target, "stellar");
  const done = await svc.simulateDeposit(p.id);
  assert.match(done.history.find((h) => h.status === "settling")!.note, /delivered on Stellar/);
});

test("dry run: simulated deposit walks to paid with a demo payout note", async () => {
  const { svc } = service(true);
  const p = await svc.create({ qr: vnQr, origin: "bsc:USDT", refundTo: EVM_REFUND });
  const done = await svc.simulateDeposit(p.id);
  assert.equal(done.status, "paid");
  assert.deepEqual(done.history.map((h) => h.status), ["awaiting_deposit", "processing", "settling", "paid"]);
  assert.match(done.history.find((h) => h.status === "settling")!.note, /NEAR Intents balance \(anyqr-operator\.near\)/);
  assert.match(done.history.at(-1)!.note, /mock, no money moved/);
});

test("live: merchant sees 'Customer deposit received' early, 'Paid' and the payout only after SUCCESS", async () => {
  const { svc, oc, settlement } = service(false);
  const p = await svc.create({ qr: vnQr, origin: "bsc:USDT", refundTo: EVM_REFUND });
  assert.equal(STATUS_LABEL[p.status], "Waiting for the customer's payment");

  oc.setStatus({ status: "INCOMPLETE_DEPOSIT", updatedAt: "", swapDetails: { depositedAmountFormatted: "1" } });
  await svc.pollAll();
  assert.equal(svc.get(p.id)!.status, "awaiting_deposit");
  assert.equal(svc.get(p.id)!.depositReceivedAt, undefined);

  for (const status of ["KNOWN_DEPOSIT_TX", "PROCESSING"] as const) {
    oc.setStatus({ status, updatedAt: "", swapDetails: {} });
    await svc.pollAll();
    const seen = svc.get(p.id)!;
    assert.equal(STATUS_LABEL[seen.status], "Customer deposit received");
    assert.ok(seen.depositReceivedAt);
    assert.equal(settlement.payouts, 0);
  }

  oc.setStatus({ status: "SUCCESS", updatedAt: "", swapDetails: { amountOutFormatted: "9.72" } });
  await svc.pollAll();
  const done = svc.get(p.id)!;
  assert.equal(STATUS_LABEL[done.status], "Paid");
  assert.equal(settlement.payouts, 1);
  assert.equal(done.history.filter((h) => h.status === "processing").length, 1);
});

test("live: REFUNDED after a deposit never triggers the payout", async () => {
  const { svc, oc, settlement } = service(false);
  const p = await svc.create({ qr: vnQr, origin: "bsc:USDT", refundTo: EVM_REFUND });
  oc.setStatus({ status: "PROCESSING", updatedAt: "", swapDetails: {} });
  await svc.pollAll();
  oc.setStatus({ status: "REFUNDED", updatedAt: "", swapDetails: { refundedAmountFormatted: "9.70" } });
  await svc.pollAll();
  assert.equal(svc.get(p.id)!.status, "refunded");
  assert.equal(settlement.payouts, 0);
});

test("a QR without an amount needs one typed in local currency", async () => {
  const { svc } = service(true);
  await assert.rejects(svc.create({ qr: thQr, origin: "bsc:USDT", refundTo: EVM_REFUND }), /enter the amount in THB/);
  const p = await svc.create({ qr: thQr, amount: 120, origin: "bsc:USDT", refundTo: EVM_REFUND });
  assert.equal(p.currency, "THB");
  assert.equal(p.amountLocal, 120);
});

test("the amount printed in a QR cannot be changed", async () => {
  const { svc } = service(true);
  await assert.rejects(svc.create({ qr: vnQr, amount: 1000, origin: "bsc:USDT", refundTo: EVM_REFUND }), /cannot be changed/);
});

test("refuses a payment above the per-payment limit before any quote", async () => {
  const { svc, oc } = service(true);
  await assert.rejects(svc.create({ qr: thQr, amount: 5000, origin: "bsc:USDT", refundTo: EVM_REFUND }), /above the 20 USDC limit/);
  assert.equal(oc.quotes.length, 0);
});

test("refuses a refund address from the wrong chain", async () => {
  const { svc } = service(true);
  await assert.rejects(svc.create({ qr: vnQr, origin: "bsc:USDT", refundTo: STELLAR }), PaymentError);
});

test("live: 1Click SUCCESS leads to payout and paid, with tx links kept", async () => {
  const { svc, oc } = service(false);
  const p = await svc.create({ qr: vnQr, origin: "bsc:USDT", refundTo: EVM_REFUND });
  assert.ok(p.quote.depositAddress);
  oc.setStatus({ status: "PROCESSING", updatedAt: "", swapDetails: { originChainTxHashes: [{ hash: "0xabc", explorerUrl: "https://bscscan.com/tx/0xabc" }] } });
  await svc.pollAll();
  assert.equal(svc.get(p.id)!.status, "processing");
  oc.setStatus({
    status: "SUCCESS",
    updatedAt: "",
    swapDetails: {
      originChainTxHashes: [{ hash: "0xabc", explorerUrl: "https://bscscan.com/tx/0xabc" }],
      destinationChainTxHashes: [{ hash: "s1", explorerUrl: "https://stellar.expert/explorer/public/tx/s1" }],
      nearTxHashes: ["n1"],
      amountOutFormatted: "9.72",
    },
  });
  await svc.pollAll();
  const done = svc.get(p.id)!;
  assert.equal(done.status, "paid");
  assert.equal(done.destinationTxs[0].hash, "s1");
  assert.deepEqual(done.nearTxs, ["n1"]);
});

test("live: REFUNDED is shown to the merchant with the refunded amount", async () => {
  const { svc, oc } = service(false);
  const p = await svc.create({ qr: vnQr, origin: "bsc:USDT", refundTo: EVM_REFUND });
  oc.setStatus({ status: "REFUNDED", updatedAt: "", swapDetails: { refundedAmountFormatted: "9.70", refundReason: "PARTIAL_DEPOSIT" } });
  await svc.pollAll();
  const r = svc.get(p.id)!;
  assert.equal(r.status, "refunded");
  assert.equal(r.refundedAmount, "9.70");
  await svc.pollAll(); // terminal, no further change
  assert.equal(svc.get(p.id)!.history.length, r.history.length);
});

test("payments survive a restart", async () => {
  const { svc, file } = service(true);
  const p = await svc.create({ qr: vnQr, origin: "bsc:USDT", refundTo: EVM_REFUND });
  assert.equal(new PaymentStore(file).get(p.id)?.usdc, "9.72");
  assert.equal(new PaymentStore(file).get(p.id)?.delivery.recipient, OPERATOR);
});

test("CSV: one header, one row per payment, formulas neutralised", async () => {
  const { svc } = service(true);
  const p = await svc.create({ qr: vnQr, origin: "bsc:USDT", refundTo: EVM_REFUND });
  await svc.simulateDeposit(p.id);
  const evil = { ...svc.get(p.id)!, merchant: { ...svc.get(p.id)!.merchant, name: "=HYPERLINK(\"x\")" } };
  const lines = paymentsToCsv([svc.get(p.id)!, evil]).trim().split("\r\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^payment_id,created_utc,deposit_received_utc,paid_utc,status,merchant/);
  assert.match(lines[0], /,settled_usdc,settled_to,settlement_recipient,/);
  assert.match(lines[1], /,paid,PHO GIA TRUYEN,VN,VietQR \(NAPAS 247\),4567,250000,VND,9\.72,USDC on NEAR \(NEAR Intents balance\),anyqr-operator\.near,/);
  assert.match(lines[2], /"'=HYPERLINK\(""x""\)"/);
});
