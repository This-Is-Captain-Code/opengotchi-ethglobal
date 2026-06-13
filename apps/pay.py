"""
gotchiOS PAY — send onchain money to an ENS contact.

Pick a contact from the list; the device publishes a `pay:<ens>:<amount>` command
to the server, which resolves the ENS and sends from this device's server-side
wallet (Dynamic). The result (tx hash / error) comes back as an `action` log line.

Controls:
  1-9   select contact          Enter / trackball-click   send payment
  any key on result screen → back to list      swipe down / long press → exit

This app needs NO firmware change — it rides the stock `mqtt` module:
  out: mqtt.send_command("pay:<ens>:<amount>")  -> og/d/<hash>/commands
  in : server publishes to og/d/<hash>/action, surfaced as a "ACTION: ...PAID_OK <tx>..." log line
"""
import display, mqtt, keyboard, touch, system, time, gc

# ── Contacts (edit me) — ENS name OR 0x address the server pays.
# Using stackchan's wallet 0x for now; swap to "og-stackchan.eth" once that
# Sepolia ENS name is registered and points at this address. ──
CONTACTS = [
    ("stackchan", "0x885F8b13396A4b2e917Eb11491EBC68CeB9F9369"),
    # ("og-stackchan", "og-stackchan.eth"),
]
AMOUNT = "0.00001"   # small — wallets are funded with ~0.0001 testnet ETH

# ── Colors / layout ──
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

# ── State machine ──
BROWSE, SENDING, RESULT = 0, 1, 2
state = BROWSE
sel = 0                 # highlighted contact index
sent_at = 0
result_ok = False
result_text = ""
SEND_TIMEOUT_MS = 30000


def draw_header():
    display.rect_filled(0, 0, W, 20, SEL)
    display.text(6, 6, "PAY  (%s)" % AMOUNT, 0, WH)
    if mqtt.connected():
        display.text(W - 28, 6, "NET", 0, GR)
    else:
        display.text(W - 28, 6, "OFF", 0, RD)


def draw_browse():
    display.clear(BK)
    draw_header()
    y = 32
    for i, (label, ens) in enumerate(CONTACTS):
        if i == sel:
            display.rect_filled(4, y - 3, W - 8, 22, SEL)
        col = WH if i == sel else DM
        display.text(10, y, "%d. %s" % (i + 1, label), 1, col)
        display.text(140, y + 2, ens, 0, CY if i == sel else DM)
        y += 26
    display.text(6, H - 12, "1-9 pick  Enter send  swipe down exit", 0, DM)
    display.flush()


def draw_center(lines, color):
    display.clear(BK)
    draw_header()
    y = H // 2 - (len(lines) * 12) // 2
    for ln in lines:
        x = max(4, (W - len(ln) * 8) // 2)
        display.text(x, y, ln, 1, color)
        y += 22
    display.flush()


def send_to(idx):
    global state, sent_at, result_ok, result_text
    label, ens = CONTACTS[idx]
    if not mqtt.connected():
        state = RESULT
        result_ok = False
        result_text = "not connected"
        return
    mqtt.send_command("pay:%s:%s" % (ens, AMOUNT))
    state = SENDING
    sent_at = time.ticks_ms()


def poll_result():
    """Drain the MQTT log looking for the server's PAID_OK / PAID_ERR reply."""
    global state, result_ok, result_text
    while mqtt.log_count() > 0:
        line = mqtt.log_read()
        if not line:
            continue
        if "PAID_OK" in line:
            i = line.find("0x")
            tx = line[i:i + 12] + "..." if i >= 0 else "sent"
            state = RESULT
            result_ok = True
            result_text = tx
            return
        if "PAID_ERR" in line:
            j = line.find("PAID_ERR")
            state = RESULT
            result_ok = False
            result_text = line[j + 9:j + 9 + 22].strip(' "}')
            return


# ── Main loop ──
draw_browse()
fr = 0
while True:
    now = time.ticks_ms()

    g = touch.gesture()
    if g == "swipe_down" or g == "long_press":
        system.exit()

    k = keyboard.get_key()

    if state == BROWSE:
        if k is not None:
            if k.isdigit():
                d = int(k)
                if 1 <= d <= len(CONTACTS):
                    sel = d - 1
                    draw_browse()
            elif k == "\n":
                send_to(sel)
        if keyboard.click():
            send_to(sel)
        if state == SENDING:
            draw_center(["Sending to", CONTACTS[sel][1], "..."], YL)

    elif state == SENDING:
        poll_result()
        if state == SENDING and time.ticks_diff(now, sent_at) > SEND_TIMEOUT_MS:
            state = RESULT
            result_ok = False
            result_text = "timeout"
        if state == RESULT:
            if result_ok:
                draw_center(["PAID", CONTACTS[sel][0], result_text], GR)
            else:
                draw_center(["FAILED", result_text], RD)

    elif state == RESULT:
        if k is not None or keyboard.click():
            state = BROWSE
            draw_browse()

    fr += 1
    if fr % 120 == 0:
        gc.collect()
    time.sleep_ms(33)
