# opengotchi-ethglobal — agent context

## What this is
ETHGlobal demo on gotchiOS devices. **Firmware-free repo**: only device microapps
(`apps/*.py`) and an independent MQTT app server (`server/`) with per-device server-side
wallets. The gotchiOS firmware itself lives in the `opengotchi` repo (local
`i:\Projects\opengotchi`).

## Three devices, split infrastructure
- **Waveshare 1.69"** — the "vibe-code apps to device" demo. Leave it **completely alone**;
  it uses the original opengotchi.com MQTT server and the existing deploy skill +
  device hash/secret. Nothing in this repo targets it.
- **LilyGo T-Deck Plus** + **stackchan (M5 CoreS3)** — the two devices this repo wires
  together. They run stock gotchiOS firmware with the broker link swapped to our broker.
  That broker swap is a one-line firmware change made in the `opengotchi` repo (see how
  commit `64345b9` did it for emqx), NOT here.

## Server design decisions (locked)
- **App server + public broker** (e.g. `broker.emqx.io:1883`) — we do NOT run our own broker.
- **Fresh code**, not forked from Pinch (`i:\Projects\pinch-1\server`) — Pinch is reference only.
- **Server-side wallet per device**, but **chain is deferred** — `wallets.js` is a pluggable
  scaffold (no chain dependency yet). Decide the chain/onchain mechanism after comms work.
- Keep it **separate from the opengotchi.com MQTT server** — separation is at the app-server
  layer; the broker is shared/public, devices are isolated by their unique `og/d/<HASH>/` topics.

## MQTT contract (authoritative: opengotchi repo `MQTT_PROTOCOL_GUIDE.txt`)
- `HASH = hex(SHA256(MAC_UPPER_COLON + "opengotchi-captain-virgin-sarv-monk"))[:32]`,
  used as MQTT client id / username / password / topic prefix.
- Device PUBLISHES: `status` (birth/LWT, retained), `telemetry` (QoS0), `commands`, `cmd/ack`.
- Device SUBSCRIBES: `cmd`, `action`, `fw/notify`.
- So the **server** subscribes to `status|telemetry|commands|cmd/ack` and publishes to
  `cmd|action`. No secret handshake is needed on a public broker (auth = hash identity).

## Known device hash
- stackchan (CoreS3): `df1ca8bb8271ab6d751e6d520e1c8ec3`
- T-Deck: TBD (compute from its MAC with `identity.js`, or read from its serial log).

## Reference repos (read-only, do not copy code)
- `i:\Projects\opengotchi` — gotchiOS firmware + `MQTT_PROTOCOL_GUIDE.txt` + `apps/`.
- `i:\Projects\pinch-1` — prior teleop/bounty system; `server/` shows a working MQTT-bridge +
  viem wallet + SSE pattern. Reference for ideas only.
