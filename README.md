# opengotchi-ethglobal

Two physical **gotchiOS** pet devices — a **LilyGo T-Deck Plus** and a **stackchan (M5
CoreS3)** — turned into **autonomous onchain agents**. Each pet has an ENS name, a
server-side wallet, and can pay the other pet (or pay for live data) on its own.

This repo is **firmware-free**: it holds the on-device microapps (MicroPython `.py`) and an
independent Node **MQTT app server** that relays the two devices and runs their wallets. The
gotchiOS firmware itself lives in the separate `opengotchi` repo.

**Live dashboard:** https://opengotchi-server.onrender.com

---

## What it does

- **Named agents — ENS.** Each pet is a mainnet ENS subname (`stackchan.captaincode.eth`,
  `lilygo.captaincode.eth`) carrying ENSIP-26 agent records. Pets pay each other **by name**,
  not by raw address.
- **Server-side MPC wallets — Dynamic.** Each pet's wallet is a Dynamic 2-of-2 TSS account
  that signs real Base Sepolia transactions **headlessly** — no seed phrase, no full private
  key ever exists.
- **Agentic payments — x402.** A pet pays a live x402 endpoint (USDC on Base) from its own
  wallet to fetch market data — machine-to-machine payment, no human in the loop.
- **Passkey deposits — Blink.** Fund a pet's wallet with USDC by passkey from the dashboard —
  no wallet-address juggling, no seed phrase.

### The agent-to-agent loop

Open the **pay** microapp on one pet → pick a contact (an ENS name) → the device sends
`pay:<ens>:<amount>` over MQTT → the server resolves the ENS name, pays from that pet's
Dynamic wallet on Base Sepolia, and — because the recipient is the *other* pet — makes the
**receiving pet react** (feeds it 🍔). Two physical devices transacting onchain and
responding to each other.

---

## Sponsor integrations — where the tech lives

| Integration | What it does | Code |
|---|---|---|
| **ENS** | pay-by-name resolution (`getEnsAddress`) + ENSIP-26 agent identity (`getEnsText` for `agent-context`, `agent-endpoint[web]`) | [server/src/ens.js](server/src/ens.js) |
| **Dynamic** | MPC (2-of-2 TSS) server wallets per pet; real Base Sepolia transfers; a viem account that delegates signing to Dynamic (reused for EIP-712 / x402) | [server/src/dynamic.js](server/src/dynamic.js) |
| **x402** | a pet pays a standard x402 endpoint in USDC from its own wallet for live Hyperliquid market data | [server/src/x402.js](server/src/x402.js), [server/src/markets.js](server/src/markets.js) |
| **Blink** | passkey USDC deposits into a pet's wallet: an ECDSA P-256 merchant signer + the `@swype-org/deposit` SDK on the dashboard | [server/src/http.js](server/src/http.js) (`POST /blink/sign`), [server/public/index.html](server/public/index.html) |

---

## Devices in the demo

| Device | Role | Infra |
|--------|------|-------|
| LilyGo T-Deck Plus | pet agent A | this repo's independent server |
| stackchan (M5 CoreS3) | pet agent B | this repo's independent server |
| Waveshare 1.69" | the separate "vibe-code apps to device" demo | **Untouched** — stays on the original opengotchi.com server |

The T-Deck and stackchan run stock gotchiOS firmware with the broker link pointed at our
broker — **no firmware code lives in this repo.**

---

## Layout

```
apps/                 device microapps (.py) — run on gotchiOS
  pay.py              list ENS contacts, pay one (pay-by-name)
  markets.py          buy live market data via x402, show prices
server/
  public/index.html   dashboard: pet cards (ENS + wallet + telemetry), pay form,
                      Blink "Deposit USDC" button, live activity feed
  src/
    config.js         env + device registry (hash, label, ENS) + Blink config
    identity.js       device-hash computation (SHA256(MAC + salt)[:32])
    mqtt.js           broker connection, per-device sub/pub
    relay.js          device routing + pay flow + reactions + markets
    ens.js            ENS resolution + ENSIP-26 agent profiles
    dynamic.js        Dynamic MPC wallet provider (create / sign / pay / viem account)
    wallets.js        provider switch: none | mock | dynamic
    x402.js           x402 client (pays from a pet's Dynamic wallet)
    markets.js        the x402 "live markets" call
    http.js           dashboard + JSON API + Blink signer
    index.js          entrypoint
  scripts/
    blink_keygen.mjs  generate the Blink ECDSA P-256 keypair
    setup_wallets.mjs  create the Dynamic wallets (run on Linux/macOS)
```

---

## HTTP API

| Route | Purpose |
|---|---|
| `GET /` | the dashboard |
| `GET /health` | liveness |
| `GET /state` | pets (wallet, balance, ENS profile, telemetry) + Blink config + recent events |
| `GET /devices` | device config + live state (legacy) |
| `POST /send` `{to, leaf, payload}` | manual downlink to a device (`cmd`/`action`) |
| `POST /pay` `{from, to, amount}` | full pay flow: ENS resolve → transfer → ack → reaction |
| `POST /markets` `{from}` | a pet pays an x402 endpoint for live prices |
| `POST /blink/sign` | Blink merchant signer (only signs deposits **into our own pet wallets**) |

---

## MQTT contract (must match the device firmware)

Identity: `HASH = hex(SHA256(MAC + salt))[:32]`, used as client id / username / password /
topic prefix. Topics live under `og/d/{HASH}/`:

| Topic | Device dir | Server dir |
|-------|-----------|-----------|
| `status` | publish (birth/LWT) | subscribe |
| `telemetry` | publish | subscribe |
| `commands` | publish (device-initiated) | subscribe |
| `cmd/ack` | publish | subscribe |
| `cmd` | subscribe | **publish** |
| `action` | subscribe | **publish** |

The relay: forwards one pet's `commands` to the other pet's `cmd` (base bridge); intercepts
`pay:<ens>:<amount>` and `markets` commands to run the onchain flows; and publishes `action`
messages back to devices — `PAID_OK`/`MKT_OK` acks to the payer and `FEED_OK` reactions to the
recipient pet.

---

## Run

```bash
cd server
cp .env.example .env     # BROKER_URL, device hashes, WALLET_PROVIDER, ENS/Dynamic/Blink keys
npm install
npm start                # or: npm run dev  (watch-reload)
```

Key env: `WALLET_PROVIDER` (`none` | `mock` | `dynamic`), `ENS_CHAIN` (`mainnet` | `sepolia`),
`DYNAMIC_*` + `WALLETS_JSON` (MPC key shares), and `BLINK_MERCHANT_ID` / `BLINK_PRIVATE_KEY` /
`BLINK_ENV`. Secrets are never committed (see `.gitignore`).

> **Note:** the Dynamic MPC SDK has a native module that runs only on **Linux/macOS** (not
> Windows). Use `WALLET_PROVIDER=mock` for local dev on Windows; run the real `dynamic`
> provider on a Linux host (this project deploys to Render — see `render.yaml`).

**Full hardware walkthrough** — building/flashing the T-Deck + stackchan firmware, uploading
the microapps, getting device hashes, and verifying the demo end to end: see
[BUILD.md](BUILD.md).
