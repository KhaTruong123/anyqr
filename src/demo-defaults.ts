// 1Click checks that the Stellar recipient already trusts USDC before it quotes.
// Dry quotes move no money, so any public account with a USDC trustline works as the
// price target. Live mode refuses to start without SETTLEMENT_STELLAR_ADDRESS.
export const DEMO_SETTLEMENT_ADDRESS = "GA2226DVH7XAGTRL7LELZ35V5QEAJDVQZLZOEKEIMXBGHB3CB5FCYYPH";
