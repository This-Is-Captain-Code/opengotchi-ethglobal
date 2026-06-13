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

// Read a device-agent's ENS identity live: its address + ENSIP-26 agent records.
// Cached briefly so the dashboard's 2s polling doesn't hammer the RPC.
const _profileCache = new Map(); // name -> { at, profile }
const PROFILE_TTL_MS = 60000;

export async function getAgentProfile(name) {
  if (!name) return null;
  const hit = _profileCache.get(name);
  if (hit && Date.now() - hit.at < PROFILE_TTL_MS) return hit.profile;

  let profile = null;
  try {
    const c = ensClient();
    const norm = normalize(name);
    const [address, agentContext, endpointWeb, avatar, description] = await Promise.all([
      c.getEnsAddress({ name: norm }).catch(() => null),
      c.getEnsText({ name: norm, key: 'agent-context' }).catch(() => null),
      c.getEnsText({ name: norm, key: 'agent-endpoint[web]' }).catch(() => null),
      c.getEnsText({ name: norm, key: 'avatar' }).catch(() => null),
      c.getEnsText({ name: norm, key: 'description' }).catch(() => null),
    ]);
    // Only a "registered" profile if something resolved.
    if (address || agentContext || description) {
      profile = { name, address, agentContext, endpointWeb, avatar, description };
    }
  } catch {
    profile = null;
  }
  _profileCache.set(name, { at: Date.now(), profile });
  return profile;
}
