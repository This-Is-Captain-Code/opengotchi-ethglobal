// Live crypto market data via x402 — the pet pays $0.001 USDC per call from its
// Dynamic wallet to a standard x402 endpoint on Base mainnet (Coinbase-facilitated).

import { payX402 } from './x402.js';

const URL = process.env.MARKETS_URL || 'https://x402.ottoai.services/hyperliquid-market';

/** Pay x402 for live perp market prices. */
export async function getMarkets(deviceHash) {
  const res = await payX402(deviceHash, URL, { method: 'GET' });
  return res.json();
}
