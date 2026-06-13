// Device-to-device routing: turns one device's messages into the other's
// commands/actions. This is the core of "facilitate communication between
// the devices" (T-Deck <-> stackchan).
//
// Wallet hooks are stubbed in but inert until a chain is chosen (see wallets.js).

import { config, deviceByHash, otherDevice } from './config.js';
import { walletFor } from './wallets.js';

// Liveness + last-seen state, surfaced by the HTTP layer.
export const state = new Map(); // hash -> { label, online, lastSeen, lastTelemetry }

function touch(hash, patch) {
  const dev = deviceByHash.get(hash);
  const prev = state.get(hash) || { label: dev?.label || hash, online: false };
  state.set(hash, { ...prev, ...patch, lastSeen: Date.now() });
}

/**
 * Handle a device->broker message and decide what (if anything) to forward.
 * @param {{hash:string, leaf:string}} parsed
 * @param {Buffer} payload
 * @param {(hash:string, leaf:'cmd'|'action', obj:object)=>void} send  publish helper
 */
export function onDeviceMessage(parsed, payload, send) {
  const { hash, leaf } = parsed;
  const me = deviceByHash.get(hash);
  if (!me) return; // not one of our two devices — ignore

  let body;
  try {
    body = payload.length ? JSON.parse(payload.toString()) : {};
  } catch {
    body = { raw: payload.toString() };
  }

  switch (leaf) {
    case 'status': {
      const online = body.s === 1;
      touch(hash, { online });
      console.log(`[relay] ${me.label} ${online ? 'ONLINE' : 'offline'}`);
      break;
    }

    case 'telemetry': {
      touch(hash, { online: true, lastTelemetry: body });
      break;
    }

    case 'commands': {
      // Device-initiated command (e.g. {cmd:"feed"} or a teleop/obstruction event).
      // Forward it to the OTHER device as a server command.
      const peer = otherDevice(hash);
      console.log(`[relay] ${me.label} -> commands:`, body);
      if (peer) {
        send(peer.hash, 'cmd', {
          id: `relay-${Date.now()}`,
          from: me.label,
          ...body,
        });
      }
      // Wallet hook (inert until a chain is configured): a device command could
      // trigger a server-side payout from this device's wallet to the peer's.
      maybeSettle(me, body);
      break;
    }

    case 'cmd/ack': {
      console.log(`[relay] ${me.label} ack:`, body.id, body.msg || '');
      break;
    }

    default:
      break;
  }
}

// Placeholder economic hook — does nothing onchain yet.
async function maybeSettle(fromDevice, body) {
  if (!body || !body.pay) return; // opt-in: only commands carrying a `pay` field
  const peer = otherDevice(fromDevice.hash);
  if (!peer) return;
  const w = walletFor(fromDevice.hash);
  if (!w) return;
  const res = await w.pay(peer.label, body.pay.amount, body.pay.memo);
  console.log(`[relay] settle ${fromDevice.label}->${peer.label}:`, res);
}
