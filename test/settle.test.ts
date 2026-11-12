import { test } from "node:test";
import assert from "node:assert/strict";
import type { OneClickClient, QuoteRequest, Token } from "../src/oneclick.js";
import { formatUnits, planSettlement } from "../src/settle.js";

const TOKENS: Token[] = [
  { assetId: "nep141:near-usdc", blockchain: "near", symbol: "USDC", decimals: 6, price: 1 },
  { assetId: "nep245:stellar-usdc", blockchain: "stellar", symbol: "USDC", decimals: 7, price: 1 },
];

function fakeOneClick() {
  const quotes: QuoteRequest[] = [];
  const client = {
    findToken: async (b: string, s: string) => TOKENS.find((t) => t.blockchain === b && t.symbol === s),
    quote: async (req: QuoteRequest) => {
      quotes.push(req);
      return { amountIn: req.amount, amountInFormatted: "", amountInUsd: "", minAmountIn: req.amount, amountOut: "0", amountOutFormatted: "12.48", timeEstimate: 25, withdrawFee: "147001" };
    },
    // Present so a test fails loudly if the planner ever tries to move money.
    submitDeposit: async () => assert.fail("settle planner must not submit anything"),
  };
  return { client: client as unknown as OneClickClient, quotes };
}

const input = { account: "anyqr-operator.near", stellarAddress: "GOPERATOR", minUsdc: 1 };

test("formats base units without float error", () => {
  assert.equal(formatUnits(12_500_000n, 6), "12.5");
  assert.equal(formatUnits(0n, 6), "0");
  assert.equal(formatUnits(1n, 6), "0.000001");
});

test("a balance above the minimum is planned as one dry withdrawal of the whole balance to Stellar", async () => {
  const oc = fakeOneClick();
  const plan = await planSettlement(oc.client, { ...input, balance: 12_500_000n });
  assert.equal(plan.action, "withdraw");
  assert.equal(oc.quotes.length, 1);
  const req = oc.quotes[0];
  assert.equal(req.dry, true);
  assert.equal(req.swapType, "EXACT_INPUT");
  assert.equal(req.depositType, "INTENTS");
  assert.equal(req.originAsset, "nep141:near-usdc");
  assert.equal(req.amount, "12500000");
  assert.equal(req.destinationAsset, "nep245:stellar-usdc");
  assert.equal(req.recipientType, "DESTINATION_CHAIN");
  assert.equal(req.recipient, "GOPERATOR");
  assert.equal(req.refundType, "INTENTS");
  assert.equal(req.refundTo, "anyqr-operator.near");
  if (plan.action === "withdraw") {
    assert.equal(plan.amount, "12.5");
    assert.equal(plan.preview, false);
  }
});

test("an empty balance plans nothing and asks 1Click for nothing", async () => {
  const oc = fakeOneClick();
  const plan = await planSettlement(oc.client, { ...input, balance: 0n });
  assert.equal(plan.action, "none");
  assert.equal(oc.quotes.length, 0);
});

test("--preview prices a withdrawal when the balance is too small, and says it is a preview", async () => {
  const oc = fakeOneClick();
  const plan = await planSettlement(oc.client, { ...input, balance: 0n, previewUsdc: 10 });
  assert.equal(plan.action, "withdraw");
  assert.equal(oc.quotes[0].amount, "10000000");
  if (plan.action === "withdraw") assert.equal(plan.preview, true);
});
