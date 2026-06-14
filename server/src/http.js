// HTTP layer (Node built-in http — no framework).
// Serves the dashboard + JSON state, and lets judges trigger a pay from the browser.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config, deviceByLabel } from './config.js';
import { state, events, executePay, handleTransit } from './relay.js';
import { publish } from './mqtt.js';
import { walletFor } from './wallets.js';
import { getAgentProfile } from './ens.js';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

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
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
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
      return json(res, 200, { broker: config.brokerUrl, walletProvider: config.walletProvider, devices, events });
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

    // GET /debug/sign?device=tdeck — verify Dynamic signTypedData recovers (x402 debug)
    if (req.method === 'GET' && url.pathname === '/debug/sign') {
      try {
        const { getViemAccount } = await import('./dynamic.js');
        const viem = await import('viem');
        const fromHash = resolveHash(url.searchParams.get('device') || 'tdeck');
        const account = await getViemAccount(fromHash);
        if (!account) return json(res, 400, { error: 'no wallet' });
        const typedData = {
          domain: { name: 'USD Coin', version: '2', chainId: 8453, verifyingContract: viem.getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913') },
          types: { TransferWithAuthorization: [
            { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
            { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }] },
          primaryType: 'TransferWithAuthorization',
          message: { from: account.address, to: viem.getAddress('0x687E3217668DDe7c32478A3F2613750c8Bd505E9'), value: 20000n, validAfter: 0n, validBefore: 9999999999n, nonce: '0x' + '11'.repeat(32) },
        };
        const sig = await account.signTypedData(typedData);
        let recovered = null, recErr = null;
        try { recovered = await viem.recoverTypedDataAddress({ ...typedData, signature: sig }); } catch (e) { recErr = e.message; }
        return json(res, 200, {
          address: account.address, sig, sigLen: sig.length, vByte: sig.slice(-2),
          recovered, match: !!recovered && recovered.toLowerCase() === account.address.toLowerCase(), recErr,
        });
      } catch (e) { return json(res, 500, { error: e.message, stack: (e.stack || '').slice(0, 500) }); }
    }

    // GET /debug/x402 — full manual x402 flow against transit402 with full visibility
    if (req.method === 'GET' && url.pathname === '/debug/x402') {
      try {
        const { getViemAccount } = await import('./dynamic.js');
        const { x402Client, x402HTTPClient } = await import('@x402/fetch');
        const { registerExactEvmScheme } = await import('@x402/evm/exact/client');
        const signer = await getViemAccount(resolveHash('tdeck'));
        const client = new x402Client();
        registerExactEvmScheme(client, { signer });
        const httpClient = client instanceof x402HTTPClient ? client : new x402HTTPClient(client);

        const turl = 'https://transit402.dev/subway/nearest';
        const tbody = JSON.stringify({ lat: 40.7141, lng: -73.9513, limit: 3 });
        const r1 = await fetch(turl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: tbody });
        const t1 = await r1.text();
        let parsedBody; try { parsedBody = JSON.parse(t1); } catch {}
        const pr = httpClient.getPaymentRequiredResponse((n) => r1.headers.get(n), parsedBody);
        const payload = await client.createPaymentPayload(pr);
        const payHeaders = httpClient.encodePaymentSignatureHeader(payload);
        const r2 = await fetch(turl, { method: 'POST', headers: { 'content-type': 'application/json', ...payHeaders }, body: tbody });
        const t2 = await r2.text();
        const h2 = {}; r2.headers.forEach((v, k) => { h2[k] = v; });
        let payResp = h2['payment-response'] || h2['x-payment-response'] || null;
        try { if (payResp) payResp = Buffer.from(payResp, 'base64').toString('utf8'); } catch {}
        return json(res, 200, {
          r1status: r1.status,
          accepts: pr?.accepts ?? pr,
          payloadPreview: JSON.stringify(payload, (k, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 400),
          payHeaderNames: Object.keys(payHeaders),
          r2status: r2.status,
          r2body: t2.slice(0, 300),
          r2headerKeys: Object.keys(h2),
          payResp,
        });
      } catch (e) { return json(res, 500, { error: e.message, stack: (e.stack || '').slice(0, 700) }); }
    }

    // GET /debug/pay?url=...&method=GET&device=tdeck&body=... — pay any x402 URL (test endpoints)
    if (req.method === 'GET' && url.pathname === '/debug/pay') {
      const { payX402 } = await import('./x402.js');
      const target = url.searchParams.get('url');
      const method = (url.searchParams.get('method') || 'GET').toUpperCase();
      const fromHash = resolveHash(url.searchParams.get('device') || 'tdeck');
      if (!target || !fromHash) return json(res, 400, { error: 'need ?url= and a valid device' });
      const opts = { method };
      if (method !== 'GET') { opts.headers = { 'content-type': 'application/json' }; opts.body = url.searchParams.get('body') || '{}'; }
      try {
        const r = await payX402(fromHash, target, opts);
        const body = await r.text();
        return json(res, 200, { ok: true, status: r.status, body: body.slice(0, 600) });
      } catch (e) { return json(res, 200, { ok: false, error: e.message.slice(0, 400) }); }
    }

    // POST /transit { from } — pay transit402 via x402 for live arrivals
    if (req.method === 'POST' && url.pathname === '/transit') {
      const body = await readBody(req);
      const fromHash = resolveHash(body.from);
      if (!fromHash) return json(res, 400, { error: 'unknown device "from"' });
      const result = await handleTransit(fromHash);
      return json(res, result.ok ? 200 : 400, result);
    }

    json(res, 404, { error: 'not found' });
  });

  server.listen(config.port, () => console.log(`[http] listening on :${config.port}`));
  return server;
}
