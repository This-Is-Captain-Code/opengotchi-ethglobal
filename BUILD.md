# Build & Run — full demo walkthrough

Everything needed to stand up the **T-Deck ↔ stackchan** demo end to end. This repo is
firmware-free; the firmware steps drive the separate **gotchiOS** checkout, but they're
written out here so you can run the whole thing from this project.

## Where things live

| Piece | Location | Notes |
|-------|----------|-------|
| Microapps (`.py`) | this repo `apps/` | uploaded to the device filesystem |
| MQTT app server | this repo `server/` | Node, connects to the broker |
| Device firmware | **gotchiOS repo** `i:\Projects\opengotchi` (branch `fix/mqtt-broker-emqx`) | not in this repo |
| Broker | `broker.emqx.io:1883` (public) | server + both devices share it |

The firmware and the server must point at the **same broker**. On the
`fix/mqtt-broker-emqx` branch the firmware already targets `broker.emqx.io:1883`
(`components/opengotchi_mqtt/og_mqtt.c`, ~line 1026), which matches this server's
default `BROKER_URL` — so for the public-broker demo **no firmware change is needed**.
If you later move to a private/managed broker, change that one line in `og_mqtt.c` to
match `server/.env`'s `BROKER_URL` and reflash.

> **Waveshare 1.69" is out of scope** — leave its firmware and broker (opengotchi.com)
> untouched. Only stackchan and T-Deck are part of this demo.

---

## 0. Prerequisites

- **Node 20+** (for `server/`)
- **ESP-IDF 5.5** (for firmware) — on this machine at `C:\esp\esp-idf`
- A **gotchiOS** checkout at `i:\Projects\opengotchi`, on branch `fix/mqtt-broker-emqx`
- USB cable; the ESP32-S3 enumerates as a "USB Serial Device" (VID `303A`).
  The COM number is **not stable** across replug — re-check before flashing.

---

## 1. Run the server

```bash
cd server
cp .env.example .env          # then edit: set device hashes (see step 4)
npm install
npm start                     # or `npm run dev` for watch-reload
```

It connects to `BROKER_URL`, subscribes to each configured device's
`og/d/<HASH>/{status,telemetry,commands,cmd/ack}`, and relays one device's
`commands` to the other's `cmd`.

HTTP (default `:8080`):
- `GET  /health` — liveness
- `GET  /devices` — configured devices + live online/telemetry state
- `POST /send` `{ "to":"stackchan|tdeck|<hash>", "leaf":"cmd|action", "payload":{...} }` — manual downlink
- `POST /pay` `{ "from","to","amount","memo" }` — exercises the wallet scaffold (no-op until a chain is configured)

**Deploy** (optional): any Node host works. On Render-style platforms, root dir `server/`,
build `npm install`, start `npm start`, and set the env vars from `.env.example`.

---

## 2. Build & flash the firmware (per device)

Run these from the **gotchiOS repo**. Board flags:
`-DGOTCHIOS_BOARD=cores3` (stackchan) · `-DGOTCHIOS_BOARD=tdeck` (T-Deck).

### This machine: ESP-IDF invocation

The repo's `build.bat`/`export.bat` don't work here (ESP-IDF lives at `C:\esp\esp-idf`
and the username path has a space). Use PowerShell, dot-sourcing `export.ps1` and calling
the venv Python directly:

```powershell
$env:IDF_PATH='C:\esp\esp-idf'
. 'C:\esp\esp-idf\export.ps1'
Set-Location 'i:\Projects\opengotchi'
$py = 'C:\Users\Captain Code\.espressif\python_env\idf5.5_py3.13_env\Scripts\python.exe'
$idf = 'C:\esp\esp-idf\tools\idf.py'

# stackchan (M5 CoreS3)
& $py $idf -B build_cores3 -DGOTCHIOS_BOARD=cores3 build
& $py $idf -B build_cores3 -DGOTCHIOS_BOARD=cores3 -p COM8 flash

# T-Deck Plus
& $py $idf -B build_tdeck -DGOTCHIOS_BOARD=tdeck build
& $py $idf -B build_tdeck -DGOTCHIOS_BOARD=tdeck -p COM_X flash
```

Notes:
- Use a **separate `-B <dir>` per board** and don't share a build dir across different
  ESP-IDF installs (toolchain/source-path mismatch → CMake refuses).
- Find the COM port first: `Get-PnpDevice -Class Ports -PresentOnly` and look for `VID_303A`.
- Full builds take a few minutes; flashing is fast.

### Generic ESP-IDF (any machine)
```bash
idf.py -B build_cores3 -DGOTCHIOS_BOARD=cores3 -p <PORT> flash
idf.py -B build_tdeck  -DGOTCHIOS_BOARD=tdeck  -p <PORT> flash
```

---

## 3. Upload the microapps to a device

Apps in this repo's `apps/*.py` are **not** part of the firmware — they live on the
device's LittleFS `storage` partition. Upload them with the gotchiOS uploader (run with
the same ESP-IDF venv Python so `littlefs` + `esptool` are available):

```powershell
Set-Location 'i:\Projects\opengotchi'
& $py scripts\upload_apps.py -p COM8        # ~17s, no firmware rebuild
```

Point the uploader at the folder of apps you want on the device (copy this repo's
`apps/*.py` into the gotchiOS `apps/` folder it reads, or pass the path the script
expects). The uploader **rebuilds the whole storage partition** — it wipes local
`/config` (theme resets, pet stats re-sync from the server).

---

## 4. Get a device's hash (for `server/.env`)

The hash is `SHA256(MAC_UPPER_COLON + "opengotchi-captain-virgin-sarv-monk")[:32]`,
and it's how the server addresses the device. Two ways:

- **From the MAC**: `cd server && npm run hash -- AA:BB:CC:DD:EE:FF`
- **From the device**: watch its serial log at 115200 on boot — it logs/uses
  `og/d/<hash>/...`; copy the 32-char hash.

Known: stackchan = `df1ca8bb8271ab6d751e6d520e1c8ec3`. Put both into `.env`:
```
DEVICE_STACKCHAN_HASH=df1ca8bb8271ab6d751e6d520e1c8ec3
DEVICE_TDECK_HASH=<the T-Deck's hash>
```

---

## 5. End-to-end verification

1. `npm start` the server — log shows `[mqtt] connected` and `watching <device>` per device.
2. Power on stackchan + T-Deck (WiFi-provisioned, on the same broker).
3. Server logs `[relay] <device> ONLINE` as each connects; `GET /devices` shows `online:true`.
4. Trigger a device-initiated command (an app publishing to `commands`) — the server logs
   it and forwards to the other device's `cmd`; the receiver should react.
5. Or inject manually: `curl -X POST localhost:8080/send -H 'content-type: application/json' -d '{"to":"tdeck","leaf":"cmd","payload":{"cmd":"wave"}}'`

If a device never goes `ONLINE`: confirm its firmware broker matches `BROKER_URL`, that
it's WiFi-connected, and that its hash in `.env` matches what it actually publishes.
