# Device microapps

MicroPython `.py` apps that run on the gotchiOS firmware (T-Deck + stackchan).
They are uploaded to the device's LittleFS `storage` partition — no firmware
rebuild needed (see the opengotchi repo's `scripts/upload_apps.py`).

These apps talk to the broker through the firmware's built-in `mqtt` module, so
they automatically use whatever broker the device firmware is pointed at. To make
them use this project's independent server, the device firmware's broker link is
swapped in the `opengotchi` repo (not here).

## Conventions (from the gotchiOS app spec)
- Exit on `swipe_down` / `long_press` via `system.exit()`.
- Call `display.flush()` after drawing; `gc.collect()` every ~60 frames.
- Device-to-device messages go through `mqtt` (device publishes to `commands`,
  receives on `cmd`/`action`); the server relays between the two devices.

(apps land here as the demo takes shape)
