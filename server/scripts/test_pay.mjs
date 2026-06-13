// Simulate a device sending a pay command, and observe the server's replies.
// Usage: node scripts/test_pay.mjs [recipient] [amount]
import mqtt from 'mqtt';
import 'dotenv/config';

const URL = process.env.BROKER_URL || 'mqtt://broker.emqx.io:1883';
const TD = process.env.DEVICE_TDECK_HASH;
const SC = process.env.DEVICE_STACKCHAN_HASH;
const recipient = process.argv[2] || 'vitalik.eth';
const amount = process.argv[3] || '0.001';

const c = mqtt.connect(URL, { clientId: `oge-testpay-${Math.floor(Date.now() / 1000)}`, clean: true });
c.on('connect', () => {
  console.log('[testpay] connected; watching both devices\' action topics');
  c.subscribe([`og/d/${TD}/action`, `og/d/${SC}/action`], { qos: 0 }, () => {
    const payload = JSON.stringify({
      cmd: `pay:${recipient}:${amount}`,
      performer: 'USER',
      t: Math.floor(Date.now() / 1000),
    });
    console.log(`[testpay] -> tdeck/commands  ${payload}`);
    c.publish(`og/d/${TD}/commands`, payload, { qos: 1 });
  });
  setTimeout(() => {
    console.log('[testpay] done');
    c.end(true, () => process.exit(0));
  }, 9000);
});
c.on('message', (topic, p) => {
  const who = topic.includes(TD) ? 'tdeck' : topic.includes(SC) ? 'stackchan' : '?';
  console.log(`[testpay] <- ${who}/action: ${p.toString()}`);
});
c.on('error', (e) => console.error('[testpay] error', e.message));
