// Loads env and builds the device registry.

import 'dotenv/config';

function device(hashKey, labelKey, fallbackLabel, ensKey) {
  const hash = (process.env[hashKey] || '').trim().toLowerCase();
  if (!hash) return null;
  return {
    hash,
    label: (process.env[labelKey] || fallbackLabel).trim(),
    // Optional ENS name this device's wallet is reachable as (for the pay demo +
    // the "recipient is the peer → make its pet react" mapping).
    ens: (process.env[ensKey] || '').trim().toLowerCase() || null,
  };
}

const devices = [
  device('DEVICE_STACKCHAN_HASH', 'DEVICE_STACKCHAN_LABEL', 'stackchan', 'DEVICE_STACKCHAN_ENS'),
  device('DEVICE_TDECK_HASH', 'DEVICE_TDECK_LABEL', 'tdeck', 'DEVICE_TDECK_ENS'),
].filter(Boolean);

export const config = {
  brokerUrl: process.env.BROKER_URL || 'mqtt://broker.emqx.io:1883',
  port: parseInt(process.env.PORT || '8080', 10),
  walletProvider: process.env.WALLET_PROVIDER || 'none',
  // ENS resolution (read-only). Sepolia ENS for the free testnet demo; the value
  // transfer happens on whatever chain the wallet provider uses (Base Sepolia).
  ens: {
    chain: process.env.ENS_CHAIN || 'sepolia',
    rpcUrl: process.env.ENS_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
  },
  // Dynamic server-wallet config (used when WALLET_PROVIDER=dynamic).
  dynamic: {
    environmentId: process.env.DYNAMIC_ENVIRONMENT_ID || '',
    authToken: process.env.DYNAMIC_AUTH_TOKEN || '',
    walletPassword: process.env.WALLET_PASSWORD || '',
    baseSepoliaRpc: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
  },
  // transit402 demo location (default: Metropolitan Av, Williamsburg). The agent
  // pays transit402 via x402 (USDC on Base mainnet) for live arrivals here.
  transit: {
    lat: parseFloat(process.env.TRANSIT_LAT || '40.7141'),
    lng: parseFloat(process.env.TRANSIT_LNG || '-73.9513'),
    place: process.env.TRANSIT_PLACE || 'Metropolitan Av',
  },
  devices,
};

// Quick lookups
export const deviceByHash = new Map(devices.map((d) => [d.hash, d]));
export const deviceByLabel = new Map(devices.map((d) => [d.label, d]));

export function otherDevice(hash) {
  return config.devices.find((d) => d.hash !== hash) || null;
}

// Match a payment recipient (ENS name and/or resolved 0x address) back to one of
// our devices, so the relay can make that device's pet react when it gets paid.
export function deviceForRecipient({ ens, address } = {}) {
  const e = (ens || '').toLowerCase();
  const a = (address || '').toLowerCase();
  return (
    config.devices.find(
      (d) =>
        (d.ens && e && d.ens === e) ||
        (d.walletAddress && a && d.walletAddress.toLowerCase() === a)
    ) || null
  );
}
