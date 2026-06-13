// Loads env and builds the device registry.

import 'dotenv/config';

function device(hashKey, labelKey, fallbackLabel) {
  const hash = (process.env[hashKey] || '').trim().toLowerCase();
  if (!hash) return null;
  return { hash, label: (process.env[labelKey] || fallbackLabel).trim() };
}

const devices = [
  device('DEVICE_STACKCHAN_HASH', 'DEVICE_STACKCHAN_LABEL', 'stackchan'),
  device('DEVICE_TDECK_HASH', 'DEVICE_TDECK_LABEL', 'tdeck'),
].filter(Boolean);

export const config = {
  brokerUrl: process.env.BROKER_URL || 'mqtt://broker.emqx.io:1883',
  port: parseInt(process.env.PORT || '8080', 10),
  walletProvider: process.env.WALLET_PROVIDER || 'none',
  devices,
};

// Quick lookups
export const deviceByHash = new Map(devices.map((d) => [d.hash, d]));
export const deviceByLabel = new Map(devices.map((d) => [d.label, d]));

export function otherDevice(hash) {
  return config.devices.find((d) => d.hash !== hash) || null;
}
