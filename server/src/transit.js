// transit402 (https://transit402.dev) — x402-paid live NYC transit data.
// Each call costs $0.02 USDC on Base, paid via x402 from the device's wallet.

import { payX402 } from './x402.js';

const BASE = process.env.TRANSIT_BASE_URL || 'https://transit402.dev';

/** Nearest subway stations + live arrivals to a lat/lng (paid via x402). */
export async function nearestSubway(deviceHash, lat, lng, limit = 3) {
  const res = await payX402(deviceHash, `${BASE}/subway/nearest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lat, lng, limit }),
  });
  return res.json();
}
