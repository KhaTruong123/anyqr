// The batch step, separate from every payment: the operator's USDC sits in its NEAR Intents
// balance, and once in a while it moves to the operator's own rail (USDC on Stellar here).
// This module only plans. It reads the balance and asks 1Click for a dry quote. It never signs.
import { DELIVERY_ASSET } from "./delivery.js";
import type { OneClickClient, Quote, Token } from "./oneclick.js";

export interface SettlePlanInput {
  account: string; // operator's NEAR account, owner of the NEAR Intents balance
  stellarAddress: string; // operator's Stellar USDC account
  balance: bigint; // USDC inside NEAR Intents, base units
  minUsdc: number; // below this, a withdrawal is not worth the fee
  previewUsdc?: number; // price a withdrawal of this size even if the balance is lower
}

export type SettlePlan =
  | { action: "none"; reason: string; balance: string; usdcToken: Token }
  | { action: "withdraw"; balance: string; amount: string; usdcToken: Token; stellarToken: Token; quote: Quote; preview: boolean };

export const formatUnits = (value: bigint, decimals: number) => {
  const s = value.toString().padStart(decimals + 1, "0");
  const frac = s.slice(-decimals).replace(/0+$/, "");
  return frac ? `${s.slice(0, -decimals)}.${frac}` : s.slice(0, -decimals);
};

export async function planSettlement(oneClick: OneClickClient, input: SettlePlanInput, deadlineMinutes = 30): Promise<SettlePlan> {
  const [usdcToken, stellarToken] = await Promise.all([
    oneClick.findToken(DELIVERY_ASSET.intents.blockchain, DELIVERY_ASSET.intents.symbol),
    oneClick.findToken(DELIVERY_ASSET.stellar.blockchain, DELIVERY_ASSET.stellar.symbol),
  ]);
  if (!usdcToken || !stellarToken) throw new Error("NEAR Intents does not list USDC on NEAR or USDC on Stellar right now");

  const balance = formatUnits(input.balance, usdcToken.decimals);
  const preview = input.previewUsdc !== undefined && Number(balance) < input.minUsdc;
  if (Number(balance) < input.minUsdc && !preview) {
    return { action: "none", reason: `Balance ${balance} USDC is below the ${input.minUsdc} USDC minimum for a withdrawal`, balance, usdcToken };
  }

  const amountBase = preview ? BigInt(Math.round(input.previewUsdc! * 10 ** usdcToken.decimals)) : input.balance;
  const quote = await oneClick.quote({
    dry: true,
    swapType: "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset: usdcToken.assetId,
    depositType: "INTENTS",
    destinationAsset: stellarToken.assetId,
    amount: amountBase.toString(),
    refundTo: input.account,
    refundType: "INTENTS",
    recipient: input.stellarAddress,
    recipientType: "DESTINATION_CHAIN",
    deadline: new Date(Date.now() + deadlineMinutes * 60_000).toISOString(),
  });
  return { action: "withdraw", balance, amount: formatUnits(amountBase, usdcToken.decimals), usdcToken, stellarToken, quote, preview };
}
