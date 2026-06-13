// MQTT client: connects to the public broker, subscribes to each device's
// uplink topics, and exposes a publish helper for downlink (cmd/action).

import mqtt from 'mqtt';
import { config } from './config.js';
import { t, serverSubs, parse } from './topics.js';
import { onDeviceMessage } from './relay.js';

let client = null;

export function startMqtt() {
  // Distinct client id so we never collide with a device's hash-based id.
  const clientId = `oge-server-${Math.floor(Date.now() / 1000)}`;
  console.log(`[mqtt] connecting to ${config.brokerUrl} as ${clientId}`);

  client = mqtt.connect(config.brokerUrl, {
    clientId,
    clean: true,
    reconnectPeriod: 5000,
    keepalive: 60,
  });

  client.on('connect', () => {
    console.log('[mqtt] connected');
    if (config.devices.length === 0) {
      console.warn('[mqtt] no devices configured — set DEVICE_*_HASH in .env');
    }
    for (const d of config.devices) {
      const subs = serverSubs(d.hash);
      client.subscribe(subs, { qos: 1 }, (err) => {
        if (err) console.error(`[mqtt] subscribe failed for ${d.label}:`, err.message);
        else console.log(`[mqtt] watching ${d.label} (${d.hash})`);
      });
    }
  });

  client.on('message', (topic, payload) => {
    const parsed = parse(topic);
    if (!parsed) return;
    onDeviceMessage(parsed, payload, publish);
  });

  client.on('reconnect', () => console.log('[mqtt] reconnecting...'));
  client.on('error', (e) => console.error('[mqtt] error:', e.message));
  client.on('close', () => console.log('[mqtt] connection closed'));

  return client;
}

/**
 * Publish a downlink message to a device.
 * @param {string} hash device hash
 * @param {'cmd'|'action'} leaf
 * @param {object} obj JSON payload
 */
export function publish(hash, leaf, obj) {
  if (!client || !client.connected) {
    console.warn('[mqtt] publish skipped — not connected');
    return;
  }
  const topic = leaf === 'action' ? t.action(hash) : t.cmd(hash);
  client.publish(topic, JSON.stringify(obj), { qos: 1 });
  console.log(`[mqtt] -> ${topic}`, obj);
}

export function getClient() {
  return client;
}
