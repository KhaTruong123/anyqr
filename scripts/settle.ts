// npm run settle [-- --preview 10]
// Reads the operator's USDC balance inside NEAR Intents and prints the withdrawal to the
// operator's own Stellar USDC account that it would make. Dry only: nothing is signed or sent.
import { config } from "../src/config.js";
import { DEMO_RECIPIENT } from "../src/delivery.js";
import { intentsBalance, INTENTS_CONTRACT } from "../src/near.js";
import { OneClickClient } from "../src/oneclick.js";
import { formatUnits, planSettlement } from "../src/settle.js";

const previewArg = process.argv.indexOf("--preview");
const previewUsdc = previewArg > 0 ? Number(process.argv[previewArg + 1]) : undefined;
if (previewUsdc !== undefined && !(previewUsdc > 0)) throw new Error("--preview needs a USDC amount, for example --preview 10");

const account = config.settlementNearAccount || DEMO_RECIPIENT.intents;
const stellarAddress = config.operatorStellarAddress || DEMO_RECIPIENT.stellar;
const oneClick = new OneClickClient();
const usdc = await oneClick.findToken("near", "USDC");
if (!usdc) throw new Error("NEAR Intents does not list USDC on NEAR right now");

const balance = await intentsBalance(account, usdc.assetId);
const plan = await planSettlement(oneClick, { account, stellarAddress, balance, minUsdc: 1, previewUsdc });

console.log("AnyQR settle (dry run, nothing is signed)\n");
console.log(`Operator NEAR account : ${account}${config.settlementNearAccount ? "" : "  (placeholder, set SETTLEMENT_NEAR_ACCOUNT)"}`);
console.log(`Balance in NEAR Intents: ${formatUnits(balance, usdc.decimals)} USDC (token ${usdc.assetId}, held by ${INTENTS_CONTRACT})`);
console.log(`Withdraw to            : ${stellarAddress} on Stellar${config.operatorStellarAddress ? "" : "  (placeholder, set OPERATOR_STELLAR_ADDRESS)"}\n`);

if (plan.action === "none") {
  console.log(`Plan: no withdrawal. ${plan.reason}.`);
  console.log("Run with --preview 10 to price a 10 USDC withdrawal anyway.");
} else {
  const q = plan.quote;
  if (plan.preview) console.log(`Preview: the balance is too small, pricing a ${plan.amount} USDC withdrawal instead.`);
  console.log(`Plan: move ${plan.amount} USDC from NEAR Intents to USDC on Stellar through 1Click.`);
  console.log(`  arrives on Stellar : ${q.amountOutFormatted} USDC (fees included${q.withdrawFee ? `, bridge fee ${formatUnits(BigInt(q.withdrawFee), plan.stellarToken.decimals)} USDC` : ""})`);
  console.log(`  time estimate      : ${q.timeEstimate} s`);
  console.log("  to run it for real : the operator signs one NEAR Intents transfer of that USDC to a 1Click deposit address.");
  console.log("                       AnyQR does not do this step yet.");
}
