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

// First-boot helper for ephemeral hosts (no shell): if dynamic + no creds yet,
// set AUTO_CREATE_WALLETS=true once to create the wallets and log a WALLETS_JSON
// blob to copy into an env var (then remove the flag and redeploy).
if (config.walletProvider === 'dynamic' && process.env.AUTO_CREATE_WALLETS === 'true') {
  import('./dynamic.js')
    .then(({ createMissingWallets }) => createMissingWallets(config.devices))
    .then((s) => {
      console.log('\n=== WALLETS READY — copy the next line into the WALLETS_JSON env var, then remove AUTO_CREATE_WALLETS and redeploy ===');
      console.log('WALLETS_JSON=' + JSON.stringify(s));
      for (const d of config.devices) console.log(`  ${d.label}: ${s[d.hash]?.walletMetadata?.accountAddress}`);
    })
    .catch((e) => console.error('[boot] wallet auto-create failed:', e.message));
}

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
