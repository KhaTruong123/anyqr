import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number, got "${raw}"`);
  return value;
}

function str(name: string, fallback = ""): string {
  const raw = process.env[name];
  return raw === undefined || raw === "" ? fallback : raw;
}

// dry: real 1Click quotes with dry=true (no deposit address), deposits are simulated.
// live: real 1Click quotes with a deposit address on mainnet. Real money moves.
export type IntentsMode = "dry" | "live";
// mock: demo FX rates, no local currency moves. sandbox: Gaian sandbox API.
export type GaianMode = "mock" | "sandbox";
// intents: 1Click credits USDC to the operator's balance inside NEAR Intents (default).
// stellar: 1Click withdraws USDC on Stellar to SETTLEMENT_STELLAR_ADDRESS on every payment.
export type DeliveryTarget = "intents" | "stellar";

function oneOf<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const value = str(name, fallback);
  if (!allowed.includes(value as T)) throw new Error(`${name} must be one of ${allowed.join(", ")}, got "${value}"`);
  return value as T;
}

export const config = {
  port: num("PORT", 3020),
  host: str("HOST", "127.0.0.1"),
  dataFile: str("DATA_FILE", fileURLToPath(new URL("../data/payments.json", import.meta.url))),

  intentsMode: oneOf<IntentsMode>("INTENTS_MODE", ["dry", "live"], "dry"),
  oneClickUrl: str("ONECLICK_URL", "https://1click.chaindefuser.com"),
  oneClickJwt: str("ONECLICK_JWT"),
  slippageBps: num("SLIPPAGE_BPS", 100),
  depositWindowMinutes: num("DEPOSIT_WINDOW_MINUTES", 30),
  pollSeconds: num("POLL_SECONDS", 10),

  deliverTo: oneOf<DeliveryTarget>("DELIVER_TO", ["intents", "stellar"], "intents"),
  // NEAR account of the merchant operator. Its USDC balance inside NEAR Intents
  // (the intents.near contract) receives every payment when DELIVER_TO=intents.
  settlementNearAccount: str("SETTLEMENT_NEAR_ACCOUNT"),
  // Stellar account that receives USDC when DELIVER_TO=stellar, and funds the Gaian payout.
  // Must hold a USDC trustline, 1Click rejects the quote otherwise.
  settlementStellarAddress: str("SETTLEMENT_STELLAR_ADDRESS"),
  // The operator's own Stellar USDC account. `npm run settle` plans the batch withdrawal to it.
  operatorStellarAddress: str("OPERATOR_STELLAR_ADDRESS"),
  nearRpc: str("NEAR_RPC_URL", "https://rpc.mainnet.near.org"),

  // Hard limit per payment, checked before any quote is shown.
  maxPaymentUsd: num("MAX_PAYMENT_USD", 20),

  gaianMode: oneOf<GaianMode>("GAIAN_MODE", ["mock", "sandbox"], "mock"),
  gaianHost: str("GAIAN_HOST", "https://sandbox.gaian.network"),
  gaianKey: str("GAIAN_KEY"),
  gaianSecret: str("GAIAN_SECRET"),
  gaianUserId: str("GAIAN_USER_ID"),
  gaianChainId: num("GAIAN_CHAIN_ID", 148),
  stellarHorizon: str("STELLAR_HORIZON_URL", "https://horizon.stellar.org"),
  stellarPassphrase: str("STELLAR_PASSPHRASE", "Public Global Stellar Network ; September 2015"),
};

export const STELLAR_USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
