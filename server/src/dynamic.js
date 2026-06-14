// Dynamic server-wallet provider — real EVM transfers on Base Sepolia.
//
// MPC (2-of-2): our key share lives in `externalServerKeyShares`, Dynamic holds
// the other. We persist OUR share either in the WALLETS_JSON env var (preferred
// for ephemeral hosts like Render) or in server/wallets.json (gitignored). The
// money itself lives on-chain at the wallet address; no full private key exists.
//
// The heavy @dynamic-labs-wallet SDK is imported lazily so the mock/none
// providers don't pull it in (and so it never loads on Windows, where its native
// MPC module is unsupported).

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { toAccount } from 'viem/accounts';
import { config } from './config.js';

const WALLETS_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'wallets.json');

let _client = null;
async function getClient() {
  if (_client) return _client;
  const { DynamicEvmWalletClient } = await import('@dynamic-labs-wallet/node-evm');
  const c = new DynamicEvmWalletClient({
    environmentId: config.dynamic.environmentId,
    enableMPCAccelerator: false,
  });
  await c.authenticateApiToken(config.dynamic.authToken);
  _client = c;
  return c;
}

// Load persisted creds: WALLETS_JSON env var wins, else wallets.json file.
function loadStore() {
  if (process.env.WALLETS_JSON) {
    try {
      return JSON.parse(process.env.WALLETS_JSON);
    } catch (e) {
      console.error('[wallet:dynamic] WALLETS_JSON env is not valid JSON:', e.message);
    }
  }
  if (existsSync(WALLETS_PATH)) return JSON.parse(readFileSync(WALLETS_PATH, 'utf8'));
  console.warn('[wallet:dynamic] no creds — set WALLETS_JSON or run setup-wallets');
  return {};
}

let _store = null;
function store() {
  if (!_store) _store = loadStore();
  return _store;
}

/**
 * Create a Dynamic wallet for each device that doesn't have one yet. Persists to
 * wallets.json (best-effort; ephemeral on Render) and returns the full store.
 */
export async function createMissingWallets(devices) {
  const { ThresholdSignatureScheme } = await import('@dynamic-labs-wallet/core');
  const client = await getClient();
  const s = loadStore();
  for (const d of devices) {
    if (s[d.hash]?.walletMetadata?.accountAddress) {
      console.log(`[setup] ${d.label}: exists -> ${s[d.hash].walletMetadata.accountAddress}`);
      continue;
    }
    console.log(`[setup] creating wallet for ${d.label}...`);
    const { walletMetadata, externalServerKeyShares } = await client.createWalletAccount({
      thresholdSignatureScheme: ThresholdSignatureScheme.TWO_OF_TWO,
      password: config.dynamic.walletPassword || undefined,
      backUpToDynamic: true,
    });
    s[d.hash] = { label: d.label, walletMetadata, externalServerKeyShares };
    console.log(`[setup] ${d.label} -> ${walletMetadata.accountAddress}`);
  }
  try {
    writeFileSync(WALLETS_PATH, JSON.stringify(s, null, 2));
  } catch (e) {
    console.warn('[setup] could not write wallets.json (ephemeral fs?):', e.message);
  }
  _store = s;
  return s;
}

/**
 * A viem account backed by a device's Dynamic MPC wallet — delegates signing to
 * Dynamic. Used by the x402 client (which needs EIP-712 signTypedData) and is a
 * standard viem account otherwise. Returns null if the device has no wallet.
 */
export async function getViemAccount(deviceHash) {
  const creds = store()[deviceHash];
  if (!creds) return null;
  const client = await getClient();
  const meta = creds.walletMetadata;
  const shares = creds.externalServerKeyShares;
  const pw = config.dynamic.walletPassword || undefined;
  const hx = (s) => (s && s.startsWith('0x') ? s : '0x' + s);
  return toAccount({
    address: meta.accountAddress,
    async signTypedData(typedData) {
      return hx(await client.signTypedData({ walletMetadata: meta, externalServerKeyShares: shares, typedData, password: pw }));
    },
    async signMessage({ message }) {
      const m = typeof message === 'string' ? message : (message.raw ?? '');
      return hx(await client.signMessage({ walletMetadata: meta, externalServerKeyShares: shares, message: m, password: pw }));
    },
    async signTransaction(tx) {
      return hx(await client.signTransaction({ walletMetadata: meta, externalServerKeyShares: shares, transaction: tx, password: pw }));
    },
  });
}

export function dynamicWallet(device) {
  const creds = store()[device.hash] || null;
  const address = creds?.walletMetadata?.accountAddress || null;

  return {
    provider: 'dynamic',
    device: device.label,
    address() {
      return address;
    },
    async balance() {
      if (!address) return '0';
      const { createPublicClient, http, formatEther } = await import('viem');
      const { baseSepolia } = await import('viem/chains');
      const pub = createPublicClient({ chain: baseSepolia, transport: http(config.dynamic.baseSepoliaRpc) });
      return formatEther(await pub.getBalance({ address }));
    },
    async pay(to, amount, memo) {
      if (!creds) return { ok: false, error: 'wallet not set up' };
      try {
        const { createPublicClient, http, parseEther } = await import('viem');
        const { baseSepolia } = await import('viem/chains');
        const client = await getClient();
        const pub = createPublicClient({ chain: baseSepolia, transport: http(config.dynamic.baseSepoliaRpc) });

        const tx = await pub.prepareTransactionRequest({
          account: address,
          to,
          value: parseEther(String(amount)),
          chain: baseSepolia,
        });

        const serialized = await client.signTransaction({
          walletMetadata: creds.walletMetadata,
          externalServerKeyShares: creds.externalServerKeyShares,
          transaction: tx,
          password: config.dynamic.walletPassword || undefined,
        });

        const txHash = await pub.sendRawTransaction({ serializedTransaction: serialized });
        console.log(`[wallet:${device.label}] (dynamic) sent ${amount} to ${to} tx=${txHash}`);
        return { ok: true, txHash };
      } catch (e) {
        console.error(`[wallet:${device.label}] (dynamic) pay failed:`, e.message);
        return { ok: false, error: e.message };
      }
    },
  };
}
