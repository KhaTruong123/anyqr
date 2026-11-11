import type { TxRef } from "./oneclick.js";

// What the merchant sees. Terminal states: paid, refunded, failed, expired.
export type PaymentStatus = "awaiting_deposit" | "processing" | "settling" | "paid" | "refunded" | "failed" | "expired";

export const TERMINAL: PaymentStatus[] = ["paid", "refunded", "failed", "expired"];

export interface Payment {
  id: string;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  status: PaymentStatus;
  simulated: boolean; // dry quote, the deposit and swap are simulated
  demoPayout: boolean; // mock Gaian leg, no local currency moves

  merchant: {
    name: string;
    city: string;
    country: string;
    scheme: string;
    account: string; // masked, last 4 digits only
    bankId: string;
  };
  qr: string;
  amountLocal: number;
  currency: string;
  usdc: string;

  origin: { assetId: string; blockchain: string; symbol: string; label: string; decimals: number };
  refundTo: string;
  quote: {
    amountIn: string;
    amountInFormatted: string;
    amountInUsd: string;
    minAmountIn: string;
    timeEstimate: number;
    depositAddress?: string;
    depositMemo?: string;
    deadline: string;
  };

  swapStatus?: string;
  originTxs: TxRef[];
  destinationTxs: TxRef[];
  nearTxs: string[];
  refundedAmount?: string;
  refundReason?: string;

  gaianQuoteId?: string;
  gaianOrderId?: string;
  payoutTxHash?: string;
  error?: string;

  history: Array<{ at: string; status: PaymentStatus; note: string }>;
}
