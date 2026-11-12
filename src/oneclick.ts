// NEAR Intents 1Click API: https://docs.near-intents.org/integration/distribution-channels/1click-api
import { config } from "./config.js";

export interface Token {
  assetId: string;
  blockchain: string;
  symbol: string;
  decimals: number;
  price: number;
}

export interface QuoteRequest {
  dry: boolean;
  swapType: "EXACT_OUTPUT" | "EXACT_INPUT";
  slippageTolerance: number;
  originAsset: string;
  // ORIGIN_CHAIN: the sender pays on its own chain. INTENTS: the sender already holds the
  // token inside NEAR Intents (used by the settle step).
  depositType: "ORIGIN_CHAIN" | "INTENTS";
  destinationAsset: string;
  amount: string;
  refundTo: string;
  refundType: "ORIGIN_CHAIN" | "INTENTS";
  recipient: string;
  // INTENTS: credit the recipient's balance inside NEAR Intents. DESTINATION_CHAIN: withdraw to that chain.
  recipientType: "DESTINATION_CHAIN" | "INTENTS";
  deadline: string;
  referral?: string;
}

export interface Quote {
  amountIn: string;
  amountInFormatted: string;
  amountInUsd: string;
  minAmountIn: string;
  amountOut: string;
  amountOutFormatted: string;
  timeEstimate: number;
  withdrawFee?: string;
  depositAddress?: string;
  depositMemo?: string;
  deadline?: string;
}

export interface TxRef {
  hash: string;
  explorerUrl: string;
}

export type SwapStatus =
  | "KNOWN_DEPOSIT_TX"
  | "PENDING_DEPOSIT"
  | "INCOMPLETE_DEPOSIT"
  | "PROCESSING"
  | "SUCCESS"
  | "REFUNDED"
  | "FAILED";

export interface StatusResponse {
  status: SwapStatus;
  updatedAt: string;
  swapDetails: {
    nearTxHashes?: string[];
    originChainTxHashes?: TxRef[];
    destinationChainTxHashes?: TxRef[];
    amountOutFormatted?: string;
    refundedAmountFormatted?: string;
    refundReason?: string;
    depositedAmountFormatted?: string;
  };
}

export class OneClickError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// Tron is left out: 1Click has a $100 minimum on swaps from Tron.
// The customer picks one of these. Each pair is resolved to a live assetId at runtime,
// because 1Click can move a token to a new bridge and change its id.
export const ORIGIN_CHOICES: Array<{ blockchain: string; symbol: string; label: string }> = [
  { blockchain: "bsc", symbol: "USDT", label: "USDT on BNB Chain" },
  { blockchain: "base", symbol: "USDC", label: "USDC on Base" },
  { blockchain: "arb", symbol: "USDC", label: "USDC on Arbitrum" },
  { blockchain: "eth", symbol: "USDC", label: "USDC on Ethereum" },
  { blockchain: "sol", symbol: "USDC", label: "USDC on Solana" },
  { blockchain: "near", symbol: "USDC", label: "USDC on NEAR" },
  { blockchain: "sol", symbol: "SOL", label: "SOL" },
  { blockchain: "eth", symbol: "ETH", label: "ETH on Ethereum" },
  { blockchain: "near", symbol: "wNEAR", label: "NEAR" },
];

export class OneClickClient {
  private tokens: { at: number; list: Token[] } | null = null;

  constructor(
    private readonly baseUrl = config.oneClickUrl,
    private readonly jwt = config.oneClickJwt,
  ) {}

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.jwt) headers.Authorization = `Bearer ${this.jwt}`;
    const res = await fetch(this.baseUrl + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = { message: text };
    }
    if (!res.ok) throw new OneClickError(`1Click ${path}: ${json?.message ?? res.statusText}`, res.status);
    return json as T;
  }

  async listTokens(): Promise<Token[]> {
    // The terms of use cap caching of API data at 24 hours. Ten minutes is plenty.
    if (this.tokens && Date.now() - this.tokens.at < 10 * 60_000) return this.tokens.list;
    const list = await this.call<Token[]>("GET", "/v0/tokens");
    this.tokens = { at: Date.now(), list };
    return list;
  }

  async findToken(blockchain: string, symbol: string): Promise<Token | undefined> {
    return (await this.listTokens()).find((t) => t.blockchain === blockchain && t.symbol === symbol);
  }

  async quote(req: QuoteRequest): Promise<Quote> {
    const res = await this.call<{ quote: Quote }>("POST", "/v0/quote", req);
    return res.quote;
  }

  status(depositAddress: string, depositMemo?: string): Promise<StatusResponse> {
    const q = new URLSearchParams({ depositAddress });
    if (depositMemo) q.set("depositMemo", depositMemo);
    return this.call("GET", `/v0/status?${q}`);
  }

  submitDeposit(depositAddress: string, txHash: string): Promise<unknown> {
    return this.call("POST", "/v0/deposit/submit", { depositAddress, txHash });
  }
}

export const intentsExplorerUrl = (depositAddress: string) =>
  `https://explorer.near-intents.org/transactions/${encodeURIComponent(depositAddress)}`;

export const nearTxUrl = (hash: string) => `https://nearblocks.io/txns/${hash}`;

// Converts a decimal string such as "1.25" to base units without floating point error.
export function toBaseUnits(amount: string, decimals: number): string {
  const [whole, frac = ""] = amount.split(".");
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(frac)) throw new Error(`Bad amount "${amount}"`);
  if (frac.length > decimals) throw new Error(`Amount "${amount}" has more than ${decimals} decimals`);
  return BigInt(whole + frac.padEnd(decimals, "0")).toString();
}
