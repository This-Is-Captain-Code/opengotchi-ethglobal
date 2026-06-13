// One-time: create a Dynamic server wallet per device. Run ON A LINUX/MACOS HOST
// (the Dynamic SDK's native MPC module does not support Windows).
//
// Prereqs in env: DYNAMIC_ENVIRONMENT_ID, DYNAMIC_AUTH_TOKEN, WALLET_PASSWORD (optional).
// Run: npm run setup-wallets
//
// Prints a WALLETS_JSON blob — set it as an env var on ephemeral hosts (Render)
// so the wallets survive redeploys (otherwise wallets.json is wiped and the funds
// become unsignable).

import 'dotenv/config';
import { config } from '../src/config.js';
import { createMissingWallets } from '../src/dynamic.js';

if (!config.dynamic.environmentId || !config.dynamic.authToken) {
  console.error('Set DYNAMIC_ENVIRONMENT_ID and DYNAMIC_AUTH_TOKEN in server/.env first.');
  process.exit(1);
}

const s = await createMissingWallets(config.devices);

console.log('\n=== Wallet addresses (fund these on Base Sepolia, point a Sepolia ENS at each) ===');
for (const d of config.devices) {
  console.log(`  ${d.label}: ${s[d.hash]?.walletMetadata?.accountAddress}`);
}
console.log('\n=== Set this env var on ephemeral hosts (Render) so wallets persist ===');
console.log('WALLETS_JSON=' + JSON.stringify(s));
console.log('\nFaucets: https://www.alchemy.com/faucets/base-sepolia | https://faucet.quicknode.com/base/sepolia');
