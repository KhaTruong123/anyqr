import { test } from "node:test";
import assert from "node:assert/strict";
import { intentsExplorerUrl, toBaseUnits } from "../src/oneclick.js";

test("converts decimal amounts to base units without float error", () => {
  assert.equal(toBaseUnits("9.72", 7), "97200000");
  assert.equal(toBaseUnits("0.1", 18), "100000000000000000");
  assert.equal(toBaseUnits("12", 6), "12000000");
  assert.throws(() => toBaseUnits("1.12345678", 7));
  assert.throws(() => toBaseUnits("-1", 7));
});

test("links a deposit address to the NEAR Intents explorer", () => {
  assert.equal(intentsExplorerUrl("0xabc"), "https://explorer.near-intents.org/transactions/0xabc");
});
