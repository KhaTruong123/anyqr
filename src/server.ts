import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import QRCode from "qrcode";
import { config } from "./config.js";
import { paymentsToCsv } from "./csv.js";
import { makeSettlement } from "./gaian/settlement.js";
import { intentsExplorerUrl, nearTxUrl, OneClickClient, OneClickError, ORIGIN_CHOICES } from "./oneclick.js";
import type { Payment } from "./payment-types.js";
import { PaymentError, PaymentService } from "./payments.js";
import { SAMPLE_QRS } from "./sample-qrs.js";
import { PaymentStore } from "./store.js";
import { deliveryFromConfig, deliveryLabel } from "./delivery.js";
import { nearAccountUrl } from "./near.js";
import { STATUS_LABEL } from "./payment-types.js";

export function buildApp(service: PaymentService) {
  const app = express();
  app.use(express.json({ limit: "16kb" }));
  app.use(express.static(fileURLToPath(new URL("../public", import.meta.url)), { extensions: ["html"] }));

  const view = (p: Payment) => {
    const { qr: _qr, refundTo, ...rest } = p;
    return {
      ...rest,
      refundTo: refundTo.length > 12 ? `${refundTo.slice(0, 6)}…${refundTo.slice(-4)}` : refundTo,
      statusLabel: STATUS_LABEL[p.status],
      deliveryLabel: deliveryLabel(p.delivery.target),
      links: {
        recipient: p.delivery.target === "intents" ? nearAccountUrl(p.delivery.recipient) : `https://stellar.expert/explorer/public/account/${p.delivery.recipient}`,
        intentsExplorer: p.quote.depositAddress ? intentsExplorerUrl(p.quote.depositAddress) : null,
        customerTxs: p.originTxs.map((t) => t.explorerUrl),
        nearTxs: p.nearTxs.map(nearTxUrl),
        stellarTxs: p.destinationTxs.map((t) => t.explorerUrl),
        payoutTx: p.payoutTxHash ? `https://stellar.expert/explorer/public/tx/${p.payoutTxHash}` : null,
      },
    };
  };

  const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

  app.get("/pay/:id", (_req, res) => res.sendFile(fileURLToPath(new URL("../public/pay.html", import.meta.url))));

  app.get("/api/options", (_req, res) => {
    res.json({
      intentsMode: config.intentsMode,
      deliverTo: config.deliverTo,
      gaianMode: config.gaianMode,
      maxPaymentUsd: config.maxPaymentUsd,
      tokens: ORIGIN_CHOICES.map((c) => ({ id: `${c.blockchain}:${c.symbol}`, label: c.label })),
      samples: SAMPLE_QRS,
    });
  });

  app.post(
    "/api/payments",
    wrap(async (req, res) => {
      const { qr, amount, origin, refundTo } = req.body ?? {};
      if (typeof qr !== "string" || typeof origin !== "string" || typeof refundTo !== "string") {
        throw new PaymentError("qr, origin and refundTo are required");
      }
      const p = await service.create({ qr, origin, refundTo, amount: amount === undefined || amount === "" ? undefined : Number(amount) });
      res.status(201).json(view(p));
    }),
  );

  app.get("/api/payments", (_req, res) => res.json(service.list().map(view)));

  app.get("/api/payments.csv", (_req, res) => {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="anyqr-payments-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send("﻿" + paymentsToCsv(service.list()));
  });

  app.get("/api/payments/:id", (req, res) => {
    const p = service.get(req.params.id);
    if (!p) return res.status(404).json({ error: "Payment not found" });
    res.json(view(p));
  });

  app.get(
    "/api/payments/:id/deposit-qr.svg",
    wrap(async (req, res) => {
      const p = service.get(req.params.id);
      if (!p?.quote.depositAddress) return res.status(404).end();
      res.type("image/svg+xml").send(await QRCode.toString(p.quote.depositAddress, { type: "svg", margin: 1 }));
    }),
  );

  app.post(
    "/api/payments/:id/simulate-deposit",
    wrap(async (req, res) => res.json(view(await service.simulateDeposit(req.params.id)))),
  );

  app.post(
    "/api/payments/:id/deposit-tx",
    wrap(async (req, res) => {
      const txHash = req.body?.txHash;
      if (typeof txHash !== "string" || !txHash.trim()) throw new PaymentError("txHash is required");
      res.json(view(await service.submitDepositTx(req.params.id, txHash)));
    }),
  );

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof PaymentError) return res.status(err.httpStatus).json({ error: err.message });
    if (err instanceof OneClickError) return res.status(502).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  });

  return app;
}

function startPoller(service: PaymentService) {
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await service.pollAll();
    } finally {
      running = false;
    }
  }, config.pollSeconds * 1000);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const live = config.intentsMode === "live";
  const delivery = await deliveryFromConfig();
  const service = new PaymentService(new PaymentStore(config.dataFile), new OneClickClient(), makeSettlement(), {
    simulated: !live,
    delivery,
    maxPaymentUsd: config.maxPaymentUsd,
    slippageBps: config.slippageBps,
    depositWindowMinutes: config.depositWindowMinutes,
  });
  startPoller(service);
  buildApp(service).listen(config.port, config.host, () => {
    console.log(`AnyQR on http://${config.host}:${config.port}`);
    console.log(`NEAR Intents: ${config.intentsMode === "live" ? "LIVE, mainnet deposits move real money" : "dry quotes, deposits are simulated"}`);
    console.log(`USDC goes to: ${deliveryLabel(delivery.target)}, recipient ${delivery.recipient}`);
    console.log(`Local payout: ${config.gaianMode === "sandbox" ? "Gaian API" : "mock, no local currency moves"}`);
  });
}
