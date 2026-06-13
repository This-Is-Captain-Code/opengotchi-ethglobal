// Server-side wallet per device — pluggable provider behind one interface.
//
//   wallet.address()             -> string | null
//   wallet.pay(to, amount, memo) -> Promise<{ ok, txHash?, error? }>
//   wallet.balance()             -> Promise<string>
//
// Providers:
//   none    — inert no-op (logs intent only). Default.
//   mock    — simulates a successful transfer with a random tx hash, so the full
//             device -> server -> onchain -> peer-reaction loop is demoable today
//             without any chain/SDK wired. Swap to `dynamic` for real transfers.
//   dynamic — (TODO) Dynamic server wallets on Base Sepolia.

import { config } from './config.js';
import { randomBytes } from 'node:crypto';
import { dynamicWallet } from './dynamic.js';

function noopWallet(device) {
  return {
    provider: 'none',
    device: device.label,
    address() {
      return null;
    },
    async balance() {
      return '0';
    },
    async pay(to, amount, memo) {
      console.log(
        `[wallet:${device.label}] (no-op) would pay ${amount} to ${to}` +
          (memo ? ` — "${memo}"` : '')
      );
      return { ok: false, error: 'no chain configured (WALLET_PROVIDER=none)' };
    },
  };
}

function mockWallet(device) {
  // Deterministic, valid-looking 0x address from the device hash.
  const addr = ('0x' + device.hash.padEnd(40, '0')).slice(0, 42);
  return {
    provider: 'mock',
    device: device.label,
    address() {
      return addr;
    },
    async balance() {
      return '1.0';
    },
    async pay(to, amount, memo) {
      const txHash = '0x' + randomBytes(32).toString('hex');
      console.log(
        `[wallet:${device.label}] (mock) paid ${amount} to ${to} tx=${txHash}` +
          (memo ? ` — "${memo}"` : '')
      );
      return { ok: true, txHash };
    },
  };
}

function makeWallet(device) {
  switch (config.walletProvider) {
    case 'mock':
      return mockWallet(device);
    case 'dynamic':
      return dynamicWallet(device); // Dynamic server wallet on Base Sepolia
    case 'none':
    default:
      return noopWallet(device);
  }
}

// One wallet per device, keyed by hash.
export const wallets = new Map(config.devices.map((d) => [d.hash, makeWallet(d)]));

export function walletFor(hash) {
  return wallets.get(hash) || null;
}
