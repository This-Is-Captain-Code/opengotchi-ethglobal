// Server-side wallet per device — chain-agnostic scaffold.
//
// The onchain mechanism is deliberately deferred. `WALLET_PROVIDER=none`
// gives an in-memory no-op wallet so the comms layer can run today; when we
// pick a chain we add an `evm` provider (e.g. viem) behind this same
// interface without touching mqtt.js / relay.js.
//
// Interface every provider implements:
//   wallet.address()            -> string | null
//   wallet.pay(to, amount, memo)-> Promise<{ ok, txHash?, error? }>
//   wallet.balance()            -> Promise<string>

import { config } from './config.js';

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
      // No chain wired yet — log intent so the relay/demo flow is observable.
      console.log(
        `[wallet:${device.label}] (no-op) would pay ${amount} to ${to}` +
          (memo ? ` — "${memo}"` : '')
      );
      return { ok: false, error: 'no chain configured (WALLET_PROVIDER=none)' };
    },
  };
}

// Future: import and branch here on config.walletProvider === 'evm'.
function makeWallet(device) {
  switch (config.walletProvider) {
    case 'none':
    default:
      return noopWallet(device);
  }
}

// One wallet per device, keyed by hash.
export const wallets = new Map(
  config.devices.map((d) => [d.hash, makeWallet(d)])
);

export function walletFor(hash) {
  return wallets.get(hash) || null;
}
