// x402 client — pay an x402-protected URL using a device's Dynamic MPC wallet.
//
// The "exact" EVM scheme is GASLESS for the payer: we sign an EIP-712 (EIP-3009
// transferWithAuthorization) USDC authorization and the facilitator submits it
// on-chain. So the paying wallet needs USDC (Base mainnet) but NO ETH for gas.

import { x402Client, wrapFetchWithPayment } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { getViemAccount } from './dynamic.js';

const _cache = new Map(); // deviceHash -> wrapped fetch

async function fetcherFor(deviceHash) {
  if (_cache.has(deviceHash)) return _cache.get(deviceHash);
  const signer = await getViemAccount(deviceHash);
  if (!signer) throw new Error('no wallet for x402 payer');
  const client = new x402Client();
  registerExactEvmScheme(client, { signer }); // exact EVM (USDC EIP-3009) scheme
  const wrapped = wrapFetchWithPayment(fetch, client);
  _cache.set(deviceHash, wrapped);
  return wrapped;
}

/**
 * Fetch an x402 endpoint, paying automatically from deviceHash's wallet.
 * @returns {Promise<Response>}
 */
export async function payX402(deviceHash, url, options = {}) {
  const f = await fetcherFor(deviceHash);
  const res = await f(url, options);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // The facilitator's verify/settle reason is in the payment-response header (base64).
    let pr = res.headers.get('payment-response') || res.headers.get('x-payment-response') || '';
    try { if (pr) pr = Buffer.from(pr, 'base64').toString('utf8'); } catch {}
    throw new Error(`x402 ${res.status} ${body.slice(0, 60)} | payresp: ${String(pr).slice(0, 220)}`);
  }
  return res;
}
