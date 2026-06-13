"""One-shot serial capture: reset the device, read its boot/runtime log for a
few seconds, and print everything. Used to confirm which MQTT broker the
firmware targets and which og/d/<hash>/ topics it uses.

Usage: python serial_peek.py COM5 [seconds]
"""
import sys, time
import serial

port = sys.argv[1] if len(sys.argv) > 1 else "COM5"
secs = float(sys.argv[2]) if len(sys.argv) > 2 else 18.0

noreset = "noreset" in sys.argv
ser = serial.Serial(port, 115200, timeout=0.2)
if not noreset:
    # Pulse reset (works for ESP32-S3 USB-Serial/JTAG and classic auto-reset wiring)
    ser.setDTR(False)
    ser.setRTS(True)
    time.sleep(0.1)
    ser.setRTS(False)
    ser.setDTR(False)

end = time.time() + secs
buf = b""
while time.time() < end:
    data = ser.read(4096)
    if data:
        buf += data
        sys.stdout.buffer.write(data)
        sys.stdout.flush()
ser.close()

# Summary of the interesting lines
text = buf.decode("utf-8", "replace")
print("\n\n===== SUMMARY =====")
for kw in ("og/d/", "broker", "mqtt", "MQTT", "emqx", "opengotchi.com", "connect"):
    hits = sorted({ln.strip() for ln in text.splitlines() if kw in ln})
    for h in hits[:8]:
        print(f"[{kw}] {h}")
