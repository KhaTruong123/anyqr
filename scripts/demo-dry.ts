// One command, no wallet, no money: real 1Click dry quotes for demo merchants in five
// countries, each walked to "paid" with a simulated deposit and the mock Gaian payout.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "../src/config.js";
import { paymentsToCsv } from "../src/csv.js";
import { MockSettlement } from "../src/gaian/settlement.js";
import { OneClickClient } from "../src/oneclick.js";
import { PaymentService } from "../src/payments.js";
import { SAMPLE_QRS } from "../src/sample-qrs.js";
import { PaymentStore } from "../src/store.js";
import { deliveryLabel, resolveDelivery } from "../src/delivery.js";

const RUNS: Array<{ sample: string; origin: string; refundTo: string; amount?: number }> = [
  { sample: "vn", origin: "bsc:USDT", refundTo: "0x2527D02599Ba641c19FEa793cD0F167589a0f10D" },
  { sample: "th", origin: "sol:SOL", refundTo: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", amount: 150 },
  { sample: "ph", origin: "base:USDC", refundTo: "0x2527D02599Ba641c19FEa793cD0F167589a0f10D" },
  { sample: "id", origin: "near:wNEAR", refundTo: "intents.near" },
  { sample: "br", origin: "arb:USDC", refundTo: "0x2527D02599Ba641c19FEa793cD0F167589a0f10D" },
];

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "anyqr-demo-"));
const service = new PaymentService(new PaymentStore(path.join(dir, "payments.json")), new OneClickClient(), new MockSettlement(), {
  simulated: true,
  // Always dry here: a placeholder recipient is fine when no money can move.
  delivery: await resolveDelivery({ target: config.deliverTo, live: false, nearAccount: config.settlementNearAccount, stellarAddress: config.settlementStellarAddress }),
  maxPaymentUsd: config.maxPaymentUsd,
  slippageBps: config.slippageBps,
  depositWindowMinutes: config.depositWindowMinutes,
});

console.log("AnyQR dry run: real NEAR Intents 1Click quotes (dry: true), simulated deposits, demo payout.");
console.log(`USDC goes to: ${deliveryLabel(config.deliverTo)}\n`);
for (const run of RUNS) {
  const sample = SAMPLE_QRS.find((s) => s.id === run.sample)!;
  try {
    const p = await service.create({ qr: sample.qr, origin: run.origin, refundTo: run.refundTo, amount: run.amount });
    await service.simulateDeposit(p.id);
    const done = service.get(p.id)!;
    console.log(`${sample.label}`);
    console.log(`  merchant gets ${done.amountLocal} ${done.currency}, settled as ${done.usdc} ${deliveryLabel(done.delivery.target)} to ${done.delivery.recipient}`);
    console.log(`  customer pays ${done.quote.amountInFormatted} ${done.origin.symbol} (${done.origin.label}, about $${Number(done.quote.amountInUsd).toFixed(2)}), swap time about ${done.quote.timeEstimate}s`);
    console.log(`  status: ${done.history.map((h) => h.status).join(" > ")}\n`);
  } catch (err) {
    console.log(`${sample.label}\n  FAILED: ${err instanceof Error ? err.message : err}\n`);
    process.exitCode = 1;
  }
}

const csvFile = path.join(dir, "anyqr-payments.csv");
fs.writeFileSync(csvFile, paymentsToCsv(service.list()));
console.log(`CSV for the accountant: ${csvFile}`);
