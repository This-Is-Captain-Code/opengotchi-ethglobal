// Minimal HTTP layer (Node built-in http — no framework).
// Exposes health, device state, and a manual command/pay injector for demos.

import { createServer } from 'node:http';
import { config, deviceByLabel } from './config.js';
import { state } from './relay.js';
import { publish } from './mqtt.js';
import { walletFor } from './wallets.js';

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(body);
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

    // GET /health
    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, { ok: true, devices: config.devices.length });
    }

    // GET /devices — config + live state
    if (req.method === 'GET' && url.pathname === '/devices') {
      const out = config.devices.map((d) => ({
        ...d,
        wallet: walletFor(d.hash)?.address() || null,
        ...(state.get(d.hash) || { online: false }),
      }));
      return json(res, 200, out);
    }

    // POST /send  { to: "<label|hash>", leaf: "cmd"|"action", payload: {...} }
    // Manually inject a downlink — handy for demoing without a second device.
    if (req.method === 'POST' && url.pathname === '/send') {
      const body = await readBody(req);
      const hash = resolveHash(body.to);
      if (!hash) return json(res, 400, { error: 'unknown device "to"' });
      const leaf = body.leaf === 'action' ? 'action' : 'cmd';
      publish(hash, leaf, body.payload || {});
      return json(res, 200, { ok: true, to: body.to, leaf });
    }

    // POST /pay  { from, to, amount, memo } — exercises the wallet scaffold.
    if (req.method === 'POST' && url.pathname === '/pay') {
      const body = await readBody(req);
      const fromHash = resolveHash(body.from);
      const w = fromHash && walletFor(fromHash);
      if (!w) return json(res, 400, { error: 'unknown device "from"' });
      const result = await w.pay(body.to, body.amount, body.memo);
      return json(res, 200, result);
    }

    json(res, 404, { error: 'not found' });
  });

  server.listen(config.port, () => {
    console.log(`[http] listening on :${config.port}`);
  });
  return server;
}
