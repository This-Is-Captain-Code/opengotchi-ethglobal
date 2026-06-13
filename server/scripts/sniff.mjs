// Quick broker sniffer: subscribe to both devices' full topic trees and print
// every message for N seconds. Diagnostic only.
import mqtt from 'mqtt';
import 'dotenv/config';

const URL = process.env.BROKER_URL || 'mqtt://broker.emqx.io:1883';
const SC = process.env.DEVICE_STACKCHAN_HASH;
const TD = process.env.DEVICE_TDECK_HASH;
const secs = parseInt(process.argv[2] || '12', 10);

const c = mqtt.connect(URL, { clientId: `oge-sniff-${Math.floor(Date.now() / 1000)}`, clean: true });
const counts = {};
c.on('connect', () => {
  console.log(`[sniff] connected to ${URL}; watching ${secs}s`);
  c.subscribe([`og/d/${SC}/#`, `og/d/${TD}/#`], { qos: 0 });
  setTimeout(() => {
    console.log('\n===== topic counts =====');
    for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`${v}\t${k}`);
    c.end(true, () => process.exit(0));
  }, secs * 1000);
});
c.on('message', (topic, payload) => {
  const who = topic.includes(SC) ? 'stackchan' : topic.includes(TD) ? 'tdeck' : '?';
  const leaf = topic.replace(/^og\/d\/[0-9a-f]{32}\//, '');
  counts[`${who} ${leaf}`] = (counts[`${who} ${leaf}`] || 0) + 1;
  const body = payload.toString().slice(0, 200);
  if ((counts[`${who} ${leaf}`] || 0) <= 4) console.log(`${who}/${leaf}: ${body}`);
});
c.on('error', (e) => console.error('[sniff] error', e.message));
