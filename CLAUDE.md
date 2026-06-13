# CLAUDE.md

Project context for Claude Code. The full agent brief is in @AGENTS.md — read it.
This file adds the operational quick-reference and the hard guardrails.

## What this repo is (one line)
Firmware-free ETHGlobal demo: device microapps (`apps/*.py`) + an independent Node MQTT app
server (`server/`) that relays T-Deck ⇄ stackchan and holds a per-device server-side wallet
(chain deferred). Firmware lives in the separate `opengotchi` repo (`i:\Projects\opengotchi`).

## Guardrails
- **Do NOT touch the Waveshare 1.69" path** — it stays on opengotchi.com's server. Only T-Deck
  + stackchan are in scope.
- **No firmware code in this repo.** Firmware changes happen in `i:\Projects\opengotchi`.
- `pinch-1` is **reference only** — do not copy its code.
- Wallet keys / `.env` / `wallets.json` are never committed (see `.gitignore`).
- The device-identity hash, salt, and topic names must match the firmware's
  `MQTT_PROTOCOL_GUIDE.txt` exactly — that is the authority, not this server.

## Commands (run from `server/`)
- `npm install` then `npm start` (or `npm run dev` for watch-reload).
- `npm run hash -- AA:BB:CC:DD:EE:FF` — compute a device hash from a MAC.
- HTTP (default `:8080`): `GET /health`, `GET /devices`,
  `POST /send {to,leaf,payload}`, `POST /pay {from,to,amount,memo}`.

## Firmware build/flash + microapp upload
Machine-specific (ESP-IDF at `C:\esp\esp-idf`; the username path has a space, so the firmware
repo's `build.bat`/`export.bat` fail here — use `export.ps1` + the venv Python directly).
Full end-to-end steps: see [BUILD.md](BUILD.md).
