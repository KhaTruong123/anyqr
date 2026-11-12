import { test } from "node:test";
import assert from "node:assert/strict";
import { DEMO_RECIPIENT, resolveDelivery } from "../src/delivery.js";

const base = { nearAccount: "", stellarAddress: "", accountExists: async () => true };

test("dry mode without a recipient uses a placeholder, for prices only", async () => {
  assert.deepEqual(await resolveDelivery({ ...base, target: "intents", live: false }), { target: "intents", recipient: DEMO_RECIPIENT.intents });
  assert.deepEqual(await resolveDelivery({ ...base, target: "stellar", live: false }), { target: "stellar", recipient: DEMO_RECIPIENT.stellar });
});

test("live mode never falls back to a placeholder", async () => {
  await assert.rejects(resolveDelivery({ ...base, target: "intents", live: true }), /needs SETTLEMENT_NEAR_ACCOUNT/);
  await assert.rejects(resolveDelivery({ ...base, target: "stellar", live: true }), /needs SETTLEMENT_STELLAR_ADDRESS/);
});

test("live mode refuses a NEAR account that does not exist", async () => {
  const opts = { ...base, target: "intents" as const, live: true, nearAccount: "typo-shop.near" };
  await assert.rejects(resolveDelivery({ ...opts, accountExists: async () => false }), /does not exist/);
  assert.equal((await resolveDelivery(opts)).recipient, "typo-shop.near");
});

test("the env flag picks the route, intents is the default target", async () => {
  const both = { ...base, live: true, nearAccount: "shop.near", stellarAddress: "GSTELLAR" };
  assert.equal((await resolveDelivery({ ...both, target: "intents" })).recipient, "shop.near");
  assert.equal((await resolveDelivery({ ...both, target: "stellar" })).recipient, "GSTELLAR");
});
