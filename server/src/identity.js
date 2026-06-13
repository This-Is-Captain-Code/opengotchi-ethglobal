// Device identity — must match the gotchiOS firmware exactly.
// HASH = hex(SHA256(MAC_UPPER_COLON + SALT))[:32]
// (see opengotchi MQTT_PROTOCOL_GUIDE.txt §1)

import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { argv } from 'node:process';

export const SALT = 'opengotchi-captain-virgin-sarv-monk';

/**
 * Compute a device hash from its MAC address.
 * @param {string} mac - MAC in any case/separator; normalized to "AA:BB:CC:DD:EE:FF".
 * @returns {string} 32-char lowercase hex hash.
 */
export function computeDeviceHash(mac) {
  const hex = mac.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length !== 12) {
    throw new Error(`bad MAC "${mac}" (need 12 hex digits, got ${hex.length})`);
  }
  const macStr = hex.match(/.{2}/g).join(':'); // AA:BB:CC:DD:EE:FF
  return createHash('sha256').update(macStr + SALT).digest('hex').slice(0, 32);
}

// CLI: `node src/identity.js AA:BB:CC:DD:EE:FF`  (or `npm run hash -- <MAC>`)
if (argv[1] && fileURLToPath(import.meta.url) === argv[1]) {
  const mac = argv[2];
  if (!mac) {
    console.error('usage: node src/identity.js <MAC>');
    process.exit(1);
  }
  console.log(computeDeviceHash(mac));
}
