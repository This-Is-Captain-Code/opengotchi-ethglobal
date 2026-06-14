// Generate the ECDSA P-256 (prime256v1) keypair Blink requires for the signer.
// Writes blink_private.pem (gitignored) + blink_public.pem, prints the PUBLIC key.
// You register the PUBLIC key with Blink to get a merchantId; the PRIVATE key
// goes in the BLINK_PRIVATE_KEY env var (Render) — never commit it.

import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const privPath = join(dir, 'blink_private.pem');
const pubPath = join(dir, 'blink_public.pem');

if (existsSync(privPath)) {
  console.log('blink_private.pem already exists — not overwriting.');
  process.exit(0);
}

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const pubPem = publicKey.export({ type: 'spki', format: 'pem' });

writeFileSync(privPath, privPem);
writeFileSync(pubPath, pubPem);

console.log('Wrote blink_private.pem (gitignored) + blink_public.pem\n');
console.log('=== PUBLIC KEY — register this with Blink to get a merchantId ===');
console.log(pubPem);
console.log('Then set on Render:  BLINK_MERCHANT_ID=<id>  and  BLINK_PRIVATE_KEY=<contents of blink_private.pem>');
