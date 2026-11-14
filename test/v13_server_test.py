#!/usr/bin/env python3
"""v13 launcher tests: the no-code strategy validator, background paper bots (entries, exits, stops, shorts, daily loss
limit, no history replay, persistence + permissions, limits), the /api/bots and /api/notify HTTP surface (token, Host /
Origin checks, size limits, rate limit, input validation) and the PWA files."""
import json, os, pathlib, re, socket, stat, subprocess, sys, tempfile, time, urllib.request, urllib.error

HERE = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
sys.argv = [sys.argv[0]]
import serve  # noqa: E402

res = []
def ok(name, cond, info=""):
    res.append(("PASS " if cond else "FAIL ") + name + (" — " + str(info)[:300] if info and not cond else ""))
def raises(fn):
    try: fn(); return False
    except ValueError: return True

RSI = {"v": 1, "name": "RSI test", "entry": {"all": [{"a": {"k": "rsi", "n": 14}, "op": "<", "b": {"k": "const", "v": 30}}]}, "exit": {"any": [{"a": {"k": "rsi", "n": 14}, "op": ">", "b": {"k": "const", "v": 60}}]}, "risk": {"sl": 5}}

# ───────── validator ─────────
ok("valid spec passes", serve.spec_validate(RSI)["name"] == "RSI test")
bad = [
    dict(RSI, v=2), dict(RSI, name="x"), dict(RSI, evil=1), dict(RSI, dir="sideways"),
    dict(RSI, entry={"all": [{"a": {"k": "eval"}, "op": ">", "b": {"k": "const", "v": 1}}]}),
    dict(RSI, entry={"all": [{"a": {"k": "rsi", "n": 9999}, "op": ">", "b": {"k": "const", "v": 1}}]}),
    dict(RSI, entry={"all": [{"a": {"k": "rsi", "n": 14}, "op": "==", "b": {"k": "const", "v": 1}}]}),
    dict(RSI, entry={"all": [{"a": {"k": "const", "v": 1}, "op": ">", "b": {"k": "rsi"}}]}),
    dict(RSI, entry={"all": [{"a": {"k": "rsi", "tf": 5}, "op": ">", "b": {"k": "const", "v": 1}}]}),
    dict(RSI, entry={"all": [{"a": {"k": "rsi"}, "op": ">", "b": {"k": "const", "v": float("inf")}}]}),
    dict(RSI, entry={"all": [{"a": {"k": "rsi", "__proto__": 1}, "op": ">", "b": {"k": "const", "v": 1}}]}),
    dict(RSI, entry={"all": [dict(a={"k": "rsi"}, op=">", b={"k": "const", "v": 1})] * 9}),
    dict(RSI, risk={"sl": 99}), dict(RSI, exit={"any": []}, risk={}), dict(RSI, name="A" * 50 + "x" * 30000),
    "not a dict", [RSI],
]
ok("rejects every malformed spec (%d cases)" % len(bad), all(raises(lambda b=b: serve.spec_validate(b)) for b in bad), [i for i, b in enumerate(bad) if not raises(lambda b=b: serve.spec_validate(b))])
ok("names lose markup characters", "<" not in serve.spec_validate(dict(RSI, name="<img src=x>Hi"))["name"])

# ───────── background bots (unit, fake candles + fake clock) ─────────
tmp = pathlib.Path(tempfile.mkdtemp())
clock = [0.0]; feed = {}
def fake_fetch(sym, tf): return [dict(x) for x in feed[(sym, tf)]]
notes = []
B = serve.BgBots(path=tmp / "bots.json", fetch=fake_fetch, notify=lambda m: notes.append(m), now=lambda: clock[0])
def series(prices, t0=1_700_000_000, tf=3600):
    return [{"t": t0 + i * tf, "o": p, "h": p * 1.001, "l": p * 0.999, "c": p, "v": 100} for i, p in enumerate(prices)]
# falling then rising prices: RSI drops under 30, then climbs over 60
down = [100 * (0.985 ** i) for i in range(40)]; up = [down[-1] * (1.02 ** i) for i in range(1, 30)]
prices = down + up
bot = {"id": "b1", "name": "RSI bot", "sym": "BTC-USD", "tf": "1h", "spec": RSI, "capital": 1000, "fee": 0.001, "slip": 0, "notify": True}
ok("rejects unsupported timeframes", raises(lambda: B.upsert(dict(bot, tf="15s"))))
ok("rejects bad symbols", raises(lambda: B.upsert(dict(bot, sym="../../etc/passwd"))))
ok("rejects bad ids", raises(lambda: B.upsert(dict(bot, id="a b"))))
ok("rejects silly capital", raises(lambda: B.upsert(dict(bot, capital=-5))) and raises(lambda: B.upsert(dict(bot, capital="lots"))))
B.upsert(bot)
# first run: only the latest closed candle is processed (no replay of history)
feed[("BTC-USD", "1h")] = series(prices[:20]); clock[0] = 1_700_000_000 + 20 * 3600 + 5
made = B.tick()
ok("first run never replays history", len(made) <= 1 and B.bots[0]["lastBar"] == 1_700_000_000 + 19 * 3600, made)
traded_first = len(made)
# feed the rest one candle at a time
allm = list(made)
for n in range(21, len(prices) + 1):
    feed[("BTC-USD", "1h")] = series(prices[:n]); clock[0] = 1_700_000_000 + n * 3600 + 5
    allm += B.tick()
buys = [t for t in allm if t["side"] == "buy"]; sells = [t for t in allm if t["side"] == "sell"]
ok("bot enters on the rules", len(buys) >= 1, allm)
ok("bot exits on the rules", len(sells) >= 1 and any("exit rules" in t["reason"] for t in sells), allm)
ok("closed trades have P&L", all(t["pnl"] is not None for t in sells))
ok("the in-progress candle is ignored", all(t["ts"] <= clock[0] * 1000 for t in allm))
ok("trade notifications are queued and sent", len(notes) >= 2 and "paper" in notes[0], notes)
eq = B.bots[0]["cash"] if not B.bots[0]["pos"] else None
ok("cash is consistent after round trips", eq is None or eq > 0)

# stop-loss inside a candle
S2 = dict(RSI, name="always in", entry={"all": [{"a": {"k": "price"}, "op": ">", "b": {"k": "const", "v": 0}}]}, exit={"any": []}, risk={"sl": 5})
B.upsert({"id": "b2", "sym": "ETH-USD", "tf": "1h", "spec": S2, "capital": 1000, "fee": 0, "slip": 0})
flat = [100.0] * 15; feed[("ETH-USD", "1h")] = series(flat); clock[0] = 1_700_000_000 + 15 * 3600 + 5; B.tick()
b2 = next(b for b in B.bots if b["id"] == "b2")
ok("always-in bot opens a position", b2["pos"] and abs(b2["pos"]["sl"] - 95) < 1e-6, b2)
crash = series(flat + [100.0]); crash[-1].update({"l": 90.0, "c": 92.0, "o": 99.0}); feed[("ETH-USD", "1h")] = crash; clock[0] += 3600; m2 = B.tick()
st = [t for t in m2 if t.get("reason") == "stop-loss"]
ok("stop-loss fills at the stop inside the candle", st and abs(st[0]["price"] - 95) < 1e-6 and st[0]["pnl"] < 0, m2)

# short bot
SH = dict(S2, name="short always", dir="short", risk={"tp": 10})
B.upsert({"id": "b3", "sym": "SOL-USD", "tf": "1h", "spec": SH, "capital": 1000, "fee": 0, "slip": 0})
feed[("SOL-USD", "1h")] = series(flat); clock[0] = 1_700_000_000 + 15 * 3600 + 5; B.tick()
b3 = next(b for b in B.bots if b["id"] == "b3")
ok("short bot opens a short with the target below", b3["pos"] and b3["pos"]["side"] == "short" and abs(b3["pos"]["tp"] - 90) < 1e-6, b3["pos"])
drop = series(flat + [100.0]); drop[-1].update({"l": 88.0, "c": 89.0}); feed[("SOL-USD", "1h")] = drop; clock[0] += 3600; m3 = B.tick()
tp = [t for t in m3 if "take-profit (short)" in t.get("reason", "")]
ok("short take-profit pays when price falls", tp and tp[0]["pnl"] > 99, m3)

# daily loss limit
LL = dict(S2, name="loss limit", risk={"trail": 50})
B.upsert({"id": "b4", "sym": "DOGE-USD", "tf": "1h", "spec": LL, "capital": 1000, "fee": 0, "slip": 0, "maxDailyLoss": 5})
base = 1_700_006_400 - (1_700_006_400 % 86400) + 3600  # inside one UTC day
feed[("DOGE-USD", "1h")] = series(flat, t0=base); clock[0] = base + 15 * 3600 + 5; B.tick()
b4 = next(b for b in B.bots if b["id"] == "b4")
lossy = series(flat + [80.0], t0=base); lossy[-1].update({"o": 80.0, "h": 80.0, "l": 80.0}); feed[("DOGE-USD", "1h")] = lossy; clock[0] += 3600; B.tick()
ok("daily loss limit halts new entries", "daily loss limit" in (b4.get("halted") or ""), b4.get("halted"))

# manual close + delete + limits + persistence
had = bool(b3.get("pos")); t = B.close("b3"); ok("manual close sells an open position (or does nothing when flat)", (t is not None and t["reason"] == "closed by you" and not b3.get("pos")) if had else t is None, t)
ok("closing again is harmless", B.close("b3") is None)
ok("max %d bots" % B.MAX, raises(lambda: [B.upsert(dict(bot, id="x%d" % i)) for i in range(20)]))
ok("can't change the rules while a position is open", raises(lambda: B.upsert(dict(b4, spec=RSI))) if b4.get("pos") else True)
B.save()
mode = stat.S_IMODE(os.stat(tmp / "bots.json").st_mode)
ok("bots.json is owner-only (0600)", mode == 0o600 or os.name == "nt", oct(mode))
B2 = serve.BgBots(path=tmp / "bots.json", fetch=fake_fetch, now=lambda: clock[0])
ok("bots survive a launcher restart", len(B2.bots) == len(B.bots) and B2.bots[0]["trades"] == B.bots[0]["trades"])
(tmp / "evil.json").write_text(json.dumps({"bots": [{"id": "e1", "sym": "BTC-USD", "tf": "1h", "spec": {"v": 1, "name": "bad", "entry": {"all": [{"a": {"k": "__import__"}, "op": ">", "b": {"k": "const", "v": 1}}]}}}]}))
ok("tampered bots.json entries are dropped on load", serve.BgBots(path=tmp / "evil.json", fetch=fake_fetch).bots == [])
B.remove("b1"); ok("delete removes the bot", all(b["id"] != "b1" for b in B.bots))
def boom(s, tf): raise RuntimeError("network down")
B.fetch = boom; B.tick()
ok("candle errors are reported, not raised", any("error" in b["status"] for b in B.bots) and "network down" in B.last_err)

# ───────── notification text from untrusted token names ─────────
nt = serve.neutralize("bought [CLAIM](https://evil.co) of evil.com for $95,000.50")
ok("notifications break URLs and bare domains (no clickable phishing links)", "https://" not in nt and "evil.com" not in nt and "evil.co)" not in nt and "$95,000.50" in nt, nt)
de = serve.discord_escape(nt)
ok("Discord Markdown is shown literally ([masked](links) can't form)", "\\[CLAIM\\]\\(" in de, de)
ok("control and bidi characters are removed", serve.neutralize("a\u202eb\x07c") == "abc")

# ───────── HTTP surface ─────────
def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p
PORT = free_port()
env = dict(os.environ, EXTERM_DATA=str(tmp / "srv"))
proc = subprocess.Popen([sys.executable, str(HERE / "serve.py"), str(PORT), "--no-browser"], cwd=str(HERE), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
BASE = "http://127.0.0.1:%d" % PORT
page = urllib.request.urlopen(BASE + "/").read().decode()
TOKEN = re.search(r'name="nt-token" content="([^"]+)"', page).group(1)
def req(path, method="GET", body=None, headers=None, token=True):
    h = {"Content-Type": "application/json"}
    if token: h["X-ExTerm"] = TOKEN
    h.update(headers or {})
    data = body if isinstance(body, (bytes, type(None))) else json.dumps(body).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE + path, data=data, headers=h, method=method), timeout=10) as r:
            return r.status, r.read(), r.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read(), e.headers
st, body, _ = req("/api/caps")
ok("caps report background bots", st == 200 and json.loads(body).get("bots") is True and json.loads(body)["version"] == serve.VERSION, body)
ok("/api/bots needs the session token", req("/api/bots", token=False)[0] == 403)
ok("/api/bots blocks foreign Origins", req("/api/bots", headers={"Origin": "https://evil.example"})[0] == 403)
ok("/api/bots blocks DNS rebinding", req("/api/bots", headers={"Host": "evil.example:%d" % PORT})[0] == 421)
st, body, _ = req("/api/bots", "POST", dict(bot, id="h1"))
ok("create a bot over HTTP", st == 200 and json.loads(body)["bot"]["id"] == "h1", body)
ok("invalid spec over HTTP is a 400", req("/api/bots", "POST", dict(bot, id="h2", spec={"v": 1}))[0] == 400)
ok("non-object JSON is a 400", req("/api/bots", "POST", [1, 2])[0] == 400)
ok("oversized bot is a 413/400", req("/api/bots", "POST", b"{" + b" " * (60 * 1024) + b"}")[0] in (400, 413))
ok("wrong content type is a 400", req("/api/bots", "POST", b'{"id":"z"}', headers={"Content-Type": "text/plain"})[0] == 400)
st, body, _ = req("/api/bots")
ok("list bots over HTTP", st == 200 and any(b["id"] == "h1" for b in json.loads(body)["bots"]))
ok("close over HTTP", req("/api/bots/close", "POST", {"id": "h1"})[0] == 200)
ok("bad id on delete is a 400", req("/api/bots/delete", "POST", {"id": "../x"})[0] == 400)
ok("delete over HTTP", req("/api/bots/delete", "POST", {"id": "h1"})[0] == 200 and all(b["id"] != "h1" for b in json.loads(req("/api/bots")[1])["bots"]))
ok("/api/notify needs the token", req("/api/notify", "POST", {"text": "hi"}, token=False)[0] == 403)
ok("/api/notify rejects empty messages", req("/api/notify", "POST", {"text": " "})[0] == 400)
codes = [req("/api/notify", "POST", {"text": "wallet alert %d" % i})[0] for i in range(24)]
ok("/api/notify is rate limited (20/min)", 429 in codes, codes)
st, body, hd = req("/manifest.webmanifest", token=False)
ok("PWA manifest is served", st == 200 and json.loads(body)["name"].startswith("ExTerm") and "manifest" in hd.get("Content-Type", ""), body[:200])
st, body, hd = req("/sw.js", token=False)
ok("service worker is served as JavaScript and never caches API calls", st == 200 and "javascript" in hd.get("Content-Type", "") and b"api|proxy|ollama|hook" in body)
ok("service worker regex is valid JavaScript", subprocess.run(["node", "-e", "new Function(require('fs').readFileSync(0,'utf8'))"], input=body, capture_output=True).returncode == 0)
st, body, hd = req("/icon-192.png", token=False)
ok("app icon is served", st == 200 and body[:4] == b"\x89PNG" or (st == 200 and b"<svg" in body), st)
proc.terminate()

print("\n".join(res))
n = sum(r.startswith("PASS") for r in res)
print("%d/%d passed" % (n, len(res)))
sys.exit(0 if n == len(res) else 1)
