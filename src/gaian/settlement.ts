// The local-currency leg. Gaian prices the QR amount in USDC on Stellar, and once the
// USDC has arrived it pays the bank account in the QR.
// mock mode uses round demo rates and moves no money; every payment is labelled demo.
import { Horizon, Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { config } from "../config.js";
import type { ParsedQr } from "../emv-qr.js";
import { GaianClient, quoteUsdcAmount } from "./client.js";

export const DEMO_SPREAD = 0.01;

export interface LocalQuote {
  usdc: string; // two decimals, rounded up so the merchant is never short
  gaianQuoteId?: string;
  demo: boolean;
}

export type PayoutState = "pending" | "processing" | "completed" | "failed";

export interface PayoutResult {
  state: PayoutState;
  gaianOrderId?: string;
  stellarTxHash?: string;
  error?: string;
}

const ceilCents = (n: number) => (Math.ceil(n * 100 - 1e-9) / 100).toFixed(2);

export interface Settlement {
  readonly demo: boolean;
  quote(qr: string, parsed: ParsedQr, amountLocal: number): Promise<LocalQuote>;
  payout(gaianQuoteId: string | undefined): Promise<PayoutResult>;
  refresh(gaianOrderId: string): Promise<PayoutState>;
}

export class MockSettlement implements Settlement {
  readonly demo = true;

  async quote(_qr: string, parsed: ParsedQr, amountLocal: number): Promise<LocalQuote> {
    return { usdc: ceilCents((amountLocal / parsed.country.demoRatePerUsdc) * (1 + DEMO_SPREAD)), demo: true };
  }

  async payout(): Promise<PayoutResult> {
    return { state: "completed" };
  }

  async refresh(): Promise<PayoutState> {
    return "completed";
  }
}

export class GaianSandboxSettlement implements Settlement {
  readonly demo = false;
  private readonly client = new GaianClient({ host: config.gaianHost, key: config.gaianKey, secret: config.gaianSecret });

  async quote(qr: string, parsed: ParsedQr, amountLocal: number): Promise<LocalQuote> {
    const checked = await this.client.parseQr(qr, config.gaianUserId);
    if (!checked.isValid) throw new Error("Gaian could not read this QR");
    const q = await this.client.quote({
      qrString: qr,
      amount: amountLocal,
      chainId: config.gaianChainId,
      walletAddress: config.settlementStellarAddress,
      country: parsed.country.code,
    });
    const usdc = quoteUsdcAmount(q);
    if (!usdc) throw new Error("Gaian quote did not include a USDC amount");
    return { usdc: ceilCents(usdc), gaianQuoteId: q.quoteId, demo: false };
  }

  // Runs only after 1Click reported SUCCESS, so the settlement account holds the USDC.
  async payout(gaianQuoteId: string | undefined): Promise<PayoutResult> {
    if (!gaianQuoteId) return { state: "failed", error: "No Gaian quote to fund" };
    try {
      const order = await this.client.placeOrder(gaianQuoteId);
      if (!order.encodedTransaction) return { state: "failed", gaianOrderId: order.orderId, error: "Gaian order has no funding transaction" };
      const stellarTxHash = await signAndSubmit(order.encodedTransaction);
      const verified = await this.client.verifyOrder(order.orderId, stellarTxHash);
      return { state: verified.status === "failed" ? "failed" : "processing", gaianOrderId: order.orderId, stellarTxHash };
    } catch (err) {
      return { state: "failed", error: err instanceof Error ? err.message : String(err) };
    }
  }

  async refresh(gaianOrderId: string): Promise<PayoutState> {
    const o = await this.client.getOrder(gaianOrderId);
    return o.status === "completed" || o.status === "failed" ? o.status : "processing";
  }
}

async function signAndSubmit(xdr: string): Promise<string> {
  const secret = process.env.SETTLEMENT_STELLAR_SECRET;
  if (!secret) throw new Error("SETTLEMENT_STELLAR_SECRET is not set");
  const tx = TransactionBuilder.fromXDR(xdr, config.stellarPassphrase);
  tx.sign(Keypair.fromSecret(secret));
  const res = await new Horizon.Server(config.stellarHorizon).submitTransaction(tx);
  return res.hash;
}

export function makeSettlement(): Settlement {
  if (config.gaianMode === "sandbox") {
    // The sandbox order is funded with a Stellar transaction from the settlement account,
    // so the USDC must land on Stellar for each payment.
    if (config.deliverTo !== "stellar") throw new Error("GAIAN_MODE=sandbox funds each order on Stellar, set DELIVER_TO=stellar");
    if (!config.gaianKey || !config.gaianSecret || !config.gaianUserId) throw new Error("GAIAN_MODE=sandbox needs GAIAN_KEY, GAIAN_SECRET and GAIAN_USER_ID");
    return new GaianSandboxSettlement();
  }
  return new MockSettlement();
}
