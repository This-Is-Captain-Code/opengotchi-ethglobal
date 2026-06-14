"""
gotchiOS MARKETS — pay for live crypto prices via x402.

The device sends a `markets` command; the server pays a standard x402 endpoint
($0.001 USDC, Base mainnet) from THIS device's own Dynamic wallet and returns
live perp prices (BTC/ETH/SOL...). Real agentic payment: the pet buys data with
its onchain wallet.

Controls:  Enter / trackball-click = fetch    swipe down / long press = exit
"""
import display, mqtt, keyboard, touch, system, time, gc

BK = display.color(0, 0, 0)
WH = display.color(255, 255, 255)
GR = display.color(0, 220, 80)
YL = display.color(255, 220, 0)
RD = display.color(255, 60, 60)
CY = display.color(0, 180, 255)
DM = display.color(90, 90, 90)
SEL = display.color(20, 60, 110)
W = display.WIDTH
H = display.HEIGHT

IDLE, FETCHING, RESULT = 0, 1, 2
state = IDLE
sent_at = 0
lines = []
col = CY
TIMEOUT_MS = 30000


def header():
    display.rect_filled(0, 0, W, 20, SEL)
    display.text(6, 6, "MARKETS  (x402)", 0, WH)
    on = mqtt.connected()
    display.text(W - 28, 6, "NET" if on else "OFF", 0, GR if on else RD)


def screen(text_lines, color):
    display.clear(BK)
    header()
    y = 44
    for ln in text_lines:
        small = len(ln) > 18
        cw = 8 if small else 16
        x = max(4, (W - len(ln) * cw) // 2)
        display.text(x, y, ln, 0 if small else 1, color)
        y += 26
    display.text(6, H - 12, "Enter = live prices   swipe down = exit", 0, DM)
    display.flush()


def fetch():
    global state, sent_at
    if not mqtt.connected():
        screen(["not connected"], RD)
        return
    mqtt.send_command("markets")
    state = FETCHING
    sent_at = time.ticks_ms()
    screen(["Paying x402...", "for live prices"], YL)


def poll():
    global state, lines, col
    while mqtt.log_count() > 0:
        line = mqtt.log_read()
        if not line:
            continue
        if "MKT_OK" in line:
            i = line.find('"t":"')
            msg = line[i + 5:].split('"')[0] if i >= 0 else "ok"
            lines = msg.split("  ") if msg else ["ok"]
            col = GR
            state = RESULT
            return
        if "MKT_ERR" in line:
            j = line.find('"e":"')
            err = line[j + 5:].split('"')[0] if j >= 0 else "error"
            lines = ["FAILED", err]
            col = RD
            state = RESULT
            return


IDLE_SCREEN = ["Press Enter for", "live crypto prices", "(pays $0.001 x402)"]
screen(IDLE_SCREEN, CY)
fr = 0
while True:
    now = time.ticks_ms()

    g = touch.gesture()
    if g == "swipe_down" or g == "long_press":
        system.exit()

    k = keyboard.get_key()

    if state == IDLE:
        if (k is not None and k == "\n") or keyboard.click():
            fetch()

    elif state == FETCHING:
        poll()
        if state == FETCHING and time.ticks_diff(now, sent_at) > TIMEOUT_MS:
            lines = ["timeout"]
            col = RD
            state = RESULT
        if state == RESULT:
            screen(lines, col)

    elif state == RESULT:
        if k is not None or keyboard.click():
            state = IDLE
            screen(IDLE_SCREEN, CY)

    fr += 1
    if fr % 120 == 0:
        gc.collect()
    time.sleep_ms(33)
