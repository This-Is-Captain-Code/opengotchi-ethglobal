# opengotchi-ethglobal

ETHGlobal demo project built on **gotchiOS** devices. This repo contains **no firmware** —
only the on-device microapps (MicroPython `.py`) and an **independent MQTT app server**
that relays device-to-device communication and holds a server-side wallet per device.

## Devices in the demo

| Device | Role | Infra |
|--------|------|-------|
| Waveshare 1.69" | "vibe-code apps to device" demo (skill + device hash/secret) | **Untouched** — stays on the original opengotchi.com MQTT server |
| LilyGo T-Deck Plus | demo device A | this repo's independent server |
| stackchan (M5 CoreS3) | demo device B | this repo's independent server |

The T-Deck and stackchan firmware is the stock gotchiOS firmware (in the `opengotchi`
repo) with its broker link pointed at our broker — no firmware code lives here.

## Layout

```
apps/      device microapps (.py) — run on gotchiOS firmware
server/    independent Node MQTT app server
  src/
    config.js     env + device registry
    identity.js   device-hash computation (SHA256(MAC + salt)[:32])
    mqtt.js       broker connection, per-device sub/pub
    relay.js      device-to-device message routing (T-Deck <-> stackchan)
    wallets.js    server-side wallet per device (chain pluggable, TBD)
    http.js       health + minimal REST/SSE
    index.js      entrypoint
```

## MQTT contract (must match the device firmware)

Identity: `HASH = hex(SHA256(MAC_UPPER_COLON + "opengotchi-captain-virgin-sarv-monk"))[:32]`,
used as client id / username / password / topic prefix.

Topics under `og/d/{HASH}/`:

| Topic | Device dir | Server dir |
|-------|-----------|-----------|
| `status` | publish (birth/LWT) | subscribe |
| `telemetry` | publish | subscribe |
| `commands` | publish (device-initiated) | subscribe |
| `cmd/ack` | publish | subscribe |
| `cmd` | subscribe | **publish** |
| `action` | subscribe | **publish** |
| `fw/notify` | subscribe | (unused here) |

The server forwards one device's `commands` to the other device's `cmd`. `status`/`telemetry`
are recorded as liveness state (surfaced by `GET /devices`), not relayed; `action` is published
only via the manual `POST /send` injector.

## Run

```bash
cd server
cp .env.example .env   # fill in BROKER_URL + device hashes
npm install
npm start
```

**Full walkthrough** — building/flashing the T-Deck + stackchan firmware, uploading the
microapps, getting device hashes, and verifying the demo end to end: see [BUILD.md](BUILD.md).

## Onchain

The server-side wallets are scaffolded but **chain-agnostic for now** — the onchain
mechanism is decided once the device-to-device comms basics are working.
