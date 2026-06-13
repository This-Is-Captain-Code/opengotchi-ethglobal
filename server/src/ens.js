// ENS resolution — turns an ENS name into a 0x address (or passes a 0x through).
// Read-only; the chain is configurable (default Sepolia ENS for the testnet demo).
// Decoupled from the chain we settle value on (Base Sepolia).

import { createPublicClient, http, isAddress, getAddress } from 'viem';
import * as chains from 'viem/chains';
import { normalize } from 'viem/ens';
import { config } from './config.js';

function ensChain() {
  return config.ens.chain === 'mainnet' ? chains.mainnet : chains.sepolia;
}

let client = null;
function ensClient() {
  if (!client) {
    client = createPublicClient({ chain: ensChain(), transport: http(config.ens.rpcUrl) });
  }
  return client;
}

/**
 * Resolve a recipient string to a checksummed address.
 * @param {string} input - an ENS name ("og-stackchan.eth") or a 0x address.
 * @returns {Promise<{address: string, ens: string|null}>}
 */
export async function resolveRecipient(input) {
  const s = (input || '').trim();
  if (!s) throw new Error('empty recipient');
  if (isAddress(s)) return { address: getAddress(s), ens: null };
  const address = await ensClient().getEnsAddress({ name: normalize(s) });
  if (!address) throw new Error(`ENS not found on ${config.ens.chain}: ${s}`);
  return { address, ens: s.toLowerCase() };
}
