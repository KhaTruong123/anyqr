import { test } from "node:test";
import assert from "node:assert/strict";
import { intentsBalance, nearAccountExists } from "../src/near.js";

function withRpc(body: unknown, status = 200) {
  const real = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
  return () => (globalThis.fetch = real);
}

test("only UNKNOWN_ACCOUNT means a NEAR account does not exist", async () => {
  let restore = withRpc({ error: { name: "HANDLER_ERROR", cause: { name: "UNKNOWN_ACCOUNT" } } });
  assert.equal(await nearAccountExists("typo-shop.near"), false);
  restore();
  restore = withRpc({ result: { amount: "1" } });
  assert.equal(await nearAccountExists("shop.near"), true);
  restore();
});

test("an RPC outage is an error, not a missing account", async () => {
  let restore = withRpc({ error: { name: "INTERNAL_ERROR", cause: { name: "TIMEOUT_ERROR" } } });
  await assert.rejects(nearAccountExists("shop.near"), /could not check account/);
  restore();
  restore = withRpc({}, 429);
  await assert.rejects(nearAccountExists("shop.near"), /HTTP 429/);
  restore();
});

test("implicit accounts are not looked up", async () => {
  const restore = withRpc({}, 500);
  assert.equal(await nearAccountExists("a".repeat(64)), true);
  restore();
});

test("reads a NEAR Intents balance returned as a JSON string", async () => {
  const bytes = [...Buffer.from(JSON.stringify("12500000"))];
  const restore = withRpc({ result: { result: bytes } });
  assert.equal(await intentsBalance("shop.near", "nep141:usdc"), 12_500_000n);
  restore();
});
