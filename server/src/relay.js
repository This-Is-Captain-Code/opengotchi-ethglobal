// Device-to-device routing + the pay flow.
//
//  - Forwards a device's `commands` to the other device's `cmd` (the base bridge).
//  - `executePay()` is the shared pay path (device MQTT command AND dashboard HTTP):
//    resolve ENS → send from the device's server-side wallet → ack the payer's
//    `action` → if the recipient is a known device, make its pet react (FEED_OK).

import { config, deviceByHash, otherDevice, deviceForRecipient } from './config.js';
import { walletFor } from './wallets.js';
import { resolveRecipient } from './ens.js';
import { publish } from './mqtt.js';

// Liveness + last-seen state, surfaced by the HTTP layer.
export const state = new Map(); // hash -> { label, online, lastSeen, lastTelemetry }

// Recent activity for the dashboard (newest first, capped).
export const events = [];
function recordEvent(e) {
  events.unshift({ ts: Date.now(), ...e });
  if (events.length > 50) events.pop();
}

function touch(hash, patch) {
  const dev = deviceByHash.get(hash);
  const prev = state.get(hash) || { label: dev?.label || hash, online: false };
  state.set(hash, { ...prev, ...patch, lastSeen: Date.now() });
}

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
      const cmdStr = typeof body.cmd === 'string' ? body.cmd : '';

      // Pay command from a microapp: "pay:<ens-or-0x>:<amount>"
      if (cmdStr.startsWith('pay:')) {
        const p = cmdStr.split(':');
        executePay({ fromHash: hash, recipient: (p[1] || '').trim(), amount: (p[2] || '0').trim(), source: 'device' });
        break;
      }
      // Or a structured { pay: { to, amount } } command.
      if (body.pay && body.pay.to) {
        executePay({ fromHash: hash, recipient: body.pay.to, amount: String(body.pay.amount ?? '0'), source: 'device' });
        break;
      }

      // Markets command: the device pays a standard x402 endpoint (USDC, Base
      // mainnet) for live crypto prices, from its OWN Dynamic wallet.
      if (cmdStr === 'markets' || cmdStr.startsWith('markets')) {
        handleMarkets(hash);
        break;
      }

      // Base bridge: forward any other device-initiated command to the peer.
      const peer = otherDevice(hash);
      console.log(`[relay] ${me.label} -> commands:`, body);
      if (peer) send(peer.hash, 'cmd', { id: `relay-${Date.now()}`, from: me.label, ...body });
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

function ack(me, r, value) {
  if (r === 'PAID_OK') publish(me.hash, 'action', { r, tx: value });
  else publish(me.hash, 'action', { r, e: String(value).slice(0, 28) });
}

/**
 * Resolve a recipient, pay from a device's wallet, ack the payer, react on the
 * recipient device, and record the event. Shared by the device + dashboard paths.
 * @returns {Promise<{ok:boolean, txHash?:string, error?:string, address?:string}>}
 */
export async function executePay({ fromHash, recipient, amount, source = 'api' }) {
  const me = deviceByHash.get(fromHash);
  if (!me) return { ok: false, error: 'unknown device' };
  recipient = (recipient || '').trim();
  amount = String(amount ?? '0').trim();
  if (!recipient) {
    ack(me, 'PAID_ERR', 'no recipient');
    return { ok: false, error: 'no recipient' };
  }

  let address, ens;
  try {
    ({ address, ens } = await resolveRecipient(recipient));
  } catch (e) {
    ack(me, 'PAID_ERR', e.message);
    recordEvent({ type: 'pay', source, from: me.label, to: recipient, ok: false, error: e.message });
    return { ok: false, error: e.message };
  }

  const wallet = walletFor(fromHash);
  if (!wallet) {
    ack(me, 'PAID_ERR', 'no wallet');
    return { ok: false, error: 'no wallet' };
  }

  console.log(`[pay] (${source}) ${me.label} -> ${recipient} (${address}) amount=${amount}`);
  const res = await wallet.pay(address, amount, `pay from ${me.label}`);

  if (!res.ok) {
    ack(me, 'PAID_ERR', res.error || 'pay failed');
    recordEvent({ type: 'pay', source, from: me.label, to: recipient, address, amount, ok: false, error: res.error });
    return res;
  }

  ack(me, 'PAID_OK', res.txHash);

  // Agent-to-agent loop: if the recipient is one of our devices — by ENS, by a
  // configured address, or by its own server-wallet address — make its pet react.
  let target = deviceForRecipient({ ens, address });
  if (!target) {
    const lower = address.toLowerCase();
    target = config.devices.find((d) => (walletFor(d.hash)?.address() || '').toLowerCase() === lower) || null;
  }
  const peer = target && target.hash !== me.hash ? target : null;
  if (peer) publish(peer.hash, 'action', { act: 'FEED_OK', from: me.label, amount });

  recordEvent({
    type: 'pay', source, from: me.label, to: recipient, address, amount,
    ok: true, tx: res.txHash, reacted: peer ? peer.label : null,
  });
  console.log(`[pay] ${me.label} PAID ${amount} -> ${recipient} tx=${res.txHash}${peer ? ` (reacted: ${peer.label})` : ''}`);
  return { ...res, address };
}

/**
 * Device pays a standard x402 endpoint (USDC on Base mainnet) for live crypto
 * market prices from its OWN Dynamic wallet, then sends a compact summary back.
 */
export async function handleMarkets(deviceHash) {
  const me = deviceByHash.get(deviceHash);
  if (!me) return { ok: false, error: 'unknown device' };
  try {
    const { getMarkets } = await import('./markets.js');
    const data = await getMarkets(deviceHash);
    const toks = data?.market?.nativePerps?.topTokens || [];
    const top = toks.slice(0, 3).map((t) => `${t.symbol} $${t.currentPrice}`);
    const msg = top.length ? top.join('  ') : 'no data';
    publish(me.hash, 'action', { r: 'MKT_OK', t: msg.slice(0, 80) });
    recordEvent({
      type: 'markets', source: 'device', from: me.label,
      top: toks.slice(0, 3).map((t) => ({ s: t.symbol, p: t.currentPrice })), ok: true,
    });
    console.log(`[markets] ${me.label} paid x402 -> ${msg}`);
    return { ok: true, top };
  } catch (e) {
    console.error('[markets] error:', e.message);
    publish(me.hash, 'action', { r: 'MKT_ERR', e: e.message.slice(0, 40) });
    recordEvent({ type: 'markets', source: 'device', from: me.label, ok: false, error: e.message });
    return { ok: false, error: e.message };
  }
}
