// Where 1Click delivers the customer's payment, as USDC.
//   intents (default): the operator's balance inside NEAR Intents, on NEAR. No bridge per payment.
//                      The operator moves the balance to its own rail in batches (`npm run settle`).
//   stellar:           a withdrawal to a Stellar account on every payment (the first design).
import { config, type DeliveryTarget } from "./config.js";
import { nearAccountExists } from "./near.js";

export interface Delivery {
  target: DeliveryTarget;
  recipient: string;
}

export const DELIVERY_ASSET: Record<DeliveryTarget, { blockchain: string; symbol: string }> = {
  intents: { blockchain: "near", symbol: "USDC" },
  stellar: { blockchain: "stellar", symbol: "USDC" },
};

export const deliveryLabel = (target: DeliveryTarget) => (target === "intents" ? "USDC on NEAR (NEAR Intents balance)" : "USDC on Stellar");

export const recipientType = (target: DeliveryTarget) => (target === "intents" ? "INTENTS" : "DESTINATION_CHAIN") as "INTENTS" | "DESTINATION_CHAIN";

// Dry quotes move no money, so a placeholder recipient is enough to get a price.
// 1Click checks that a Stellar recipient already trusts USDC, so the Stellar placeholder
// is a public account with a USDC trustline.
export const DEMO_RECIPIENT: Record<DeliveryTarget, string> = {
  intents: "anyqr-demo.near",
  stellar: "GA2226DVH7XAGTRL7LELZ35V5QEAJDVQZLZOEKEIMXBGHB3CB5FCYYPH",
};

const ENV_NAME: Record<DeliveryTarget, string> = { intents: "SETTLEMENT_NEAR_ACCOUNT", stellar: "SETTLEMENT_STELLAR_ADDRESS" };

// Live mode refuses to run without a real recipient: money must never go to a placeholder.
export async function resolveDelivery(opts: {
  target: DeliveryTarget;
  live: boolean;
  nearAccount: string;
  stellarAddress: string;
  accountExists?: (account: string) => Promise<boolean>;
}): Promise<Delivery> {
  const configured = opts.target === "intents" ? opts.nearAccount : opts.stellarAddress;
  if (!configured) {
    if (opts.live) throw new Error(`INTENTS_MODE=live with DELIVER_TO=${opts.target} needs ${ENV_NAME[opts.target]}`);
    return { target: opts.target, recipient: DEMO_RECIPIENT[opts.target] };
  }
  if (opts.target === "intents" && opts.live && !(await (opts.accountExists ?? nearAccountExists)(configured))) {
    throw new Error(`SETTLEMENT_NEAR_ACCOUNT ${configured} does not exist on NEAR mainnet`);
  }
  return { target: opts.target, recipient: configured };
}

export const deliveryFromConfig = () =>
  resolveDelivery({
    target: config.deliverTo,
    live: config.intentsMode === "live",
    nearAccount: config.settlementNearAccount,
    stellarAddress: config.settlementStellarAddress,
  });
