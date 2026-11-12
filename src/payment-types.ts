import type { DeliveryTarget } from "./config.js";
import type { TxRef } from "./oneclick.js";

// What the merchant sees. Terminal states: paid, refunded, failed, expired.
export type PaymentStatus = "awaiting_deposit" | "processing" | "settling" | "paid" | "refunded" | "failed" | "expired";

export const TERMINAL: PaymentStatus[] = ["paid", "refunded", "failed", "expired"];

// The words the merchant reads. "Paid" appears only once the local payout is done, which
// itself starts only after 1Click reports SUCCESS.
export const STATUS_LABEL: Record<PaymentStatus, string> = {
  awaiting_deposit: "Waiting for the customer's payment",
  processing: "Customer deposit received",
  settling: "USDC received, paying the merchant's bank",
  paid: "Paid",
  refunded: "Refunded to the customer",
  failed: "Failed",
  expired: "Expired, nothing was charged",
};

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
  // Where 1Click delivers the USDC: the operator's NEAR Intents balance, or a Stellar account.
  delivery: { target: DeliveryTarget; recipient: string; assetId: string };

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
  depositReceivedAt?: string;
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
