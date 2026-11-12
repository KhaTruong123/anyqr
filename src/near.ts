// Read-only calls to NEAR mainnet RPC. Nothing here signs or sends a transaction.
import { config } from "./config.js";

export const INTENTS_CONTRACT = "intents.near";

async function rpc<T>(params: unknown, url: string): Promise<{ result?: T; error?: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "anyqr", method: "query", params }),
  });
  return (await res.json()) as { result?: T; error?: unknown };
}

// Implicit accounts (64 hex characters) exist as soon as they hold funds, so only named
// accounts are checked against NEAR RPC.
export async function nearAccountExists(account: string, url = config.nearRpc): Promise<boolean> {
  if (/^[0-9a-f]{64}$/.test(account)) return true;
  const body = await rpc({ request_type: "view_account", finality: "final", account_id: account }, url);
  return Boolean(body.result);
}

// Balance of one token inside NEAR Intents, in base units. Tokens held in NEAR Intents
// live in the intents.near contract ledger, not in the account itself.
export async function intentsBalance(account: string, tokenId: string, url = config.nearRpc): Promise<bigint> {
  const args = Buffer.from(JSON.stringify({ account_id: account, token_id: tokenId })).toString("base64");
  const body = await rpc<{ result: number[] }>(
    { request_type: "call_function", finality: "final", account_id: INTENTS_CONTRACT, method_name: "mt_balance_of", args_base64: args },
    url,
  );
  if (!body.result) throw new Error(`NEAR RPC could not read the ${tokenId} balance of ${account}: ${JSON.stringify(body.error)}`);
  return BigInt(JSON.parse(Buffer.from(body.result.result).toString("utf8")) as string);
}

export const nearAccountUrl = (account: string) => `https://nearblocks.io/address/${encodeURIComponent(account)}`;
