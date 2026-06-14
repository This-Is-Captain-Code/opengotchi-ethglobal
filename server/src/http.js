// HTTP layer (Node built-in http — no framework).
// Serves the dashboard + JSON state, and lets judges trigger a pay from the browser.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config, deviceByLabel } from './config.js';
import { state, events, executePay, handleMarkets } from './relay.js';
import { publish } from './mqtt.js';
import { walletFor } from './wallets.js';
import { getAgentProfile } from './ens.js';
import { createSign, randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(SERVER_DIR, 'public');

// Blink merchant private key: env var (Render) or the gitignored pem (local).
function blinkPrivateKey() {
  if (config.blink.privateKeyPem) return config.blink.privateKeyPem;
  try {
    const p = join(SERVER_DIR, 'blink_private.pem');
    if (existsSync(p)) return readFileSync(p, 'utf8');
  } catch {}
  return '';
}

function json(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    return {};
  }
}

function resolveHash(idOrLabel) {
  if (!idOrLabel) return null;
  if (deviceByLabel.has(idOrLabel)) return deviceByLabel.get(idOrLabel).hash;
  return config.devices.find((d) => d.hash === idOrLabel)?.hash || null;
}

export function startHttp() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${config.port}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, { ok: true, devices: config.devices.length });
    }

    // GET / — the dashboard
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      try {
        const html = await readFile(join(PUBLIC_DIR, 'index.html'));
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          // Delegate WebAuthn (passkey) to Blink's hosted iframe — without this the
          // browser silently blocks the passkey prompt in the cross-origin iframe,
          // so the "Authorize" step does nothing.
          'permissions-policy':
            'publickey-credentials-get=(self "https://pay.blink.cash" "https://pay-sandbox.blink.cash"), ' +
            'publickey-credentials-create=(self "https://pay.blink.cash" "https://pay-sandbox.blink.cash")',
        });
        res.end(html);
      } catch {
        json(res, 404, { error: 'dashboard not found' });
      }
      return;
    }

    // GET /state — devices (with wallet address + balance) + recent events
    if (req.method === 'GET' && url.pathname === '/state') {
      const devices = await Promise.all(
        config.devices.map(async (d) => {
          const w = walletFor(d.hash);
          let wallet = null;
          let balance = null;
          try { wallet = w?.address?.() ?? null; } catch {}
          try { balance = w ? await w.balance() : null; } catch {}
          let ensProfile = null;
          try { ensProfile = await getAgentProfile(d.ens); } catch {}
          return {
            label: d.label, hash: d.hash, ens: d.ens, wallet, balance, ensProfile,
            ...(state.get(d.hash) || { online: false }),
          };
        })
      );
      return json(res, 200, {
        broker: config.brokerUrl, walletProvider: config.walletProvider, devices, events,
        blink: {
          configured: !!(config.blink.merchantId && blinkPrivateKey()),
          merchantId: config.blink.merchantId,
          environment: config.blink.environment,
        },
      });
    }

    // GET /devices — config + live state (legacy)
    if (req.method === 'GET' && url.pathname === '/devices') {
      const out = config.devices.map((d) => ({
        ...d,
        wallet: walletFor(d.hash)?.address() || null,
        ...(state.get(d.hash) || { online: false }),
      }));
      return json(res, 200, out);
    }

    // POST /send  { to, leaf, payload } — manual downlink
    if (req.method === 'POST' && url.pathname === '/send') {
      const body = await readBody(req);
      const hash = resolveHash(body.to);
      if (!hash) return json(res, 400, { error: 'unknown device "to"' });
      const leaf = body.leaf === 'action' ? 'action' : 'cmd';
      publish(hash, leaf, body.payload || {});
      return json(res, 200, { ok: true, to: body.to, leaf });
    }

    // POST /pay  { from, to, amount } — full pay flow (ENS resolve + transfer + reaction)
    if (req.method === 'POST' && url.pathname === '/pay') {
      const body = await readBody(req);
      const fromHash = resolveHash(body.from);
      if (!fromHash) return json(res, 400, { error: 'unknown device "from"' });
      const result = await executePay({
        fromHash, recipient: body.to, amount: String(body.amount ?? '0'), source: 'dashboard',
      });
      return json(res, result.ok ? 200 : 400, result);
    }

    // POST /markets { from } — pay a standard x402 endpoint for live crypto prices
    if (req.method === 'POST' && url.pathname === '/markets') {
      const body = await readBody(req);
      const fromHash = resolveHash(body.from);
      if (!fromHash) return json(res, 400, { error: 'unknown device "from"' });
      const result = await handleMarkets(fromHash);
      return json(res, result.ok ? 200 : 400, result);
    }

    // POST /blink/sign — Blink merchant signer: sign a stablecoin deposit request
    // (deposit USDC into a pet's wallet). Only signs deposits TO our own wallets.
    if (req.method === 'POST' && url.pathname === '/blink/sign') {
      const body = await readBody(req);
      const { amount, chainId, address, token, callbackScheme = null, version = 'v1' } = body;
      const errs = [];
      if (!Number.isFinite(amount) || amount <= 0) errs.push('amount must be > 0');
      if (!Number.isInteger(chainId) || chainId <= 0) errs.push('chainId invalid');
      if (typeof address !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(address)) errs.push('address invalid');
      if (typeof token !== 'string' || !/^0x[a-fA-F0-9]{1,40}$/.test(token)) errs.push('token invalid');
      // Safety: only sign deposits TO one of our own pet wallets.
      const ours = config.devices.some((d) => (walletFor(d.hash)?.address() || '').toLowerCase() === String(address).toLowerCase());
      if (!ours) errs.push('address must be a known device wallet');
      if (errs.length) return json(res, 400, { error: errs.join('; ') });

      const priv = blinkPrivateKey();
      if (!priv || !config.blink.merchantId) return json(res, 503, { error: 'Blink not configured (set BLINK_MERCHANT_ID + BLINK_PRIVATE_KEY)' });

      const idempotencyKey = randomUUID();
      const signatureTimestamp = new Date().toISOString();
      const payloadObj = { amount, chainId, address, token, idempotencyKey, callbackScheme, signatureTimestamp, version };
      const payload = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
      const s = createSign('SHA256'); s.update(payload); s.end();
      const signature = s.sign(priv).toString('base64url');
      res.setHeader('cache-control', 'no-store');
      return json(res, 200, { merchantId: config.blink.merchantId, payload, signature, preview: { amount, chainId, address, token, idempotencyKey } });
    }

    json(res, 404, { error: 'not found' });
  });

  server.listen(config.port, () => console.log(`[http] listening on :${config.port}`));
  return server;
}
