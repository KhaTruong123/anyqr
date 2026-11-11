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

export const config = {
  port: num("PORT", 3020),
  host: str("HOST", "127.0.0.1"),
  dataFile: str("DATA_FILE", fileURLToPath(new URL("../data/payments.json", import.meta.url))),

  intentsMode: str("INTENTS_MODE", "dry") as IntentsMode,
  oneClickUrl: str("ONECLICK_URL", "https://1click.chaindefuser.com"),
  oneClickJwt: str("ONECLICK_JWT"),
  slippageBps: num("SLIPPAGE_BPS", 100),
  depositWindowMinutes: num("DEPOSIT_WINDOW_MINUTES", 30),
  pollSeconds: num("POLL_SECONDS", 10),

  // Stellar account that receives USDC from 1Click and funds the Gaian payout.
  // Must hold a USDC trustline, 1Click rejects the quote otherwise.
  settlementStellarAddress: str("SETTLEMENT_STELLAR_ADDRESS"),

  // Hard limit per payment, checked before any quote is shown.
  maxPaymentUsd: num("MAX_PAYMENT_USD", 20),

  gaianMode: str("GAIAN_MODE", "mock") as GaianMode,
  gaianHost: str("GAIAN_HOST", "https://sandbox.gaian.network"),
  gaianKey: str("GAIAN_KEY"),
  gaianSecret: str("GAIAN_SECRET"),
  gaianUserId: str("GAIAN_USER_ID"),
  gaianChainId: num("GAIAN_CHAIN_ID", 148),
  stellarHorizon: str("STELLAR_HORIZON_URL", "https://horizon.stellar.org"),
  stellarPassphrase: str("STELLAR_PASSPHRASE", "Public Global Stellar Network ; September 2015"),
};

export const STELLAR_USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
