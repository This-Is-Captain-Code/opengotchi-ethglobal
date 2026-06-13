// opengotchi-ethglobal — independent MQTT app server.
// Boots the MQTT relay (T-Deck <-> stackchan) and the HTTP layer.

import { config } from './config.js';
import { startMqtt } from './mqtt.js';
import { startHttp } from './http.js';
import { getClient } from './mqtt.js';

console.log('=== opengotchi-ethglobal server ===');
console.log(`broker:  ${config.brokerUrl}`);
console.log(`wallets: ${config.walletProvider}`);
console.log(
  `devices: ${config.devices.map((d) => `${d.label}=${d.hash}`).join(', ') || '(none configured)'}`
);

startMqtt();
startHttp();

// Graceful shutdown
function shutdown() {
  console.log('\n[shutdown] closing...');
  const c = getClient();
  if (c) c.end(true, () => process.exit(0));
  else process.exit(0);
  setTimeout(() => process.exit(0), 2000);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
