#!/usr/bin/env python3
"""v15.4 launcher tests: the on-chain leaderboard proxy. ExTerm Alpha Score parity with the page (same fixtures as
test/v154.test.js), schema validation of hostile leaderboard / clearinghouseState / userFills / frontendOpenOrders
answers, the strict host + type allow-list, the 30 s RAM cache, exponential backoff serving the last good copy, the
seeded --offline sample, and /api/hl/* behind the session token. No external network: upstream calls are stubbed."""
import json, os, pathlib, re, socket, subprocess, sys, tempfile, time, urllib.request, urllib.error

HERE = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
sys.argv = [sys.argv[0]]
import serve  # noqa: E402

res = []
def ok(name, cond, info=""):
    res.append(("PASS " if cond else "FAIL ") + name + (" -- " + str(info)[:300] if info and not cond else ""))
tmp = pathlib.Path(tempfile.mkdtemp())
A1, A2 = "0x" + "a" * 40, "0x" + "b" * 40

# ───────── alpha score parity ─────────
FX = [((0.01, 0.05, 0.3, 2.0, 250000, 3e6), 89), ((-0.2, -0.1, 0.05, 0.4, 5e6, 1e10), 46), ((0, 0, 0, 0, 0, 0), 43), ((0.5, -0.3, -0.6, -0.9, 1e3, 1e9), 8)]
ok("alpha: parity fixtures with V154.alphaScore", all(serve.alpha_score(*a) == w for a, w in FX), [serve.alpha_score(*a) for a, _ in FX])
ok("alpha: hostile values stay an int in 0..100", all(isinstance(s, int) and 0 <= s <= 100 for s in (serve.alpha_score("nan", None, "1e999", [], -5, "x"), serve.alpha_score(1e308, 1e308, 1e308, 1e308, 1e308, 0))))

# ───────── schema validation ─────────
r = serve.hl_clean_row({"ethAddress": A1.upper().replace("0X", "0x"), "accountValue": "1e6", "displayName": "<b>x</b>‮", "windowPerformances": [["month", {"pnl": "5", "roi": "0.1", "vlm": "9"}], ["evil", {}], "junk"]})
ok("row: address lower-cased, markup + bidi controls stripped, unknown windows ignored, alpha attached", r["addr"] == A1 and "<" not in r["name"] and "‮" not in r["name"] and r["pnl"]["month"] == 5 and r["pnl"]["day"] == 0 and isinstance(r["alpha"], int), r)
ok("row: bad address / non-dict rejected", serve.hl_clean_row({"ethAddress": "0x123"}) is None and serve.hl_clean_row("x") is None)
ch = serve.hl_clean_info("clearinghouseState", {"assetPositions": [{"position": {"coin": "BTC", "szi": "1", "entryPx": "100", "leverage": {"value": 5}, "extra": "secret"}}, {"position": {"coin": "<script>", "szi": "1"}}], "marginSummary": {"accountValue": "50"}, "withdrawable": "999"})
ok("clearinghouseState: only whitelisted fields, hostile coin dropped", len(ch["assetPositions"]) == 1 and "extra" not in ch["assetPositions"][0]["position"] and "withdrawable" not in ch and ch["marginSummary"]["accountValue"] == 50)
fl = serve.hl_clean_info("userFills", [{"coin": "ETH", "px": "1", "sz": "2", "time": 5, "dir": "Open Long" + "x" * 100, "hash": "0xdead"}] * 2500)
ok("userFills: capped at 2000, strings trimmed, extra fields dropped", len(fl) == 2000 and len(fl[0]["dir"]) <= 24 and "hash" not in fl[0])
ok("frontendOpenOrders: trigger + reduce-only flags kept as booleans", serve.hl_clean_info("frontendOpenOrders", [{"coin": "BTC", "isTrigger": 1, "reduceOnly": 0, "triggerPx": "9"}])[0] == {"coin": "BTC", "side": "B", "limitPx": 0.0, "sz": 0.0, "isTrigger": True, "triggerPx": 9.0, "reduceOnly": False, "orderType": ""})
for kind, bad in (("clearinghouseState", []), ("userFills", {}), ("frontendOpenOrders", "x")):
    try: serve.hl_clean_info(kind, bad); ok("schema: wrong shape refused (" + kind + ")", False)
    except ValueError: ok("schema: wrong shape refused (" + kind + ")", True)

# ───────── allow-list ─────────
for url, body in (("https://evil.example/Mainnet/leaderboard", None), ("http://stats-data.hyperliquid.xyz/Mainnet/leaderboard", None)):
    try: serve.HLCache._get(url); ok("GET refuses non-allow-listed / plain-http hosts: " + url, False)
    except ValueError: ok("GET refuses non-allow-listed / plain-http hosts: " + url, True)
for url, body in (("https://api.hyperliquid.xyz/exchange", {"type": "clearinghouseState"}), ("https://api.hyperliquid.xyz/info", {"type": "order"}), ("https://evil.example/info", {"type": "userFills"})):
    try: serve.HLCache._post(url, body); ok("POST refuses order endpoints, unknown types and other hosts: " + url, False)
    except ValueError: ok("POST refuses order endpoints, unknown types and other hosts: " + url, True)
ok("both Hyperliquid hosts are on the proxy allow-list", serve.host_allowed("stats-data.hyperliquid.xyz") and serve.host_allowed("api.hyperliquid.xyz"))

# ───────── cache + backoff ─────────
clock = [1000.0]; calls = []
board = {"leaderboardRows": [{"ethAddress": A1, "accountValue": "1", "windowPerformances": [["month", {"pnl": "9"}]]}, {"ethAddress": A2, "accountValue": "1", "windowPerformances": [["month", {"pnl": "3"}]]}]}
def fetch(url): calls.append(url); return board
H = serve.HLCache(fetch=fetch, post=lambda u, b: calls.append(b) or {"assetPositions": []}, now=lambda: clock[0])
b1 = H.board(); b2 = H.board()
ok("cache: second call inside 30 s answered from RAM", len(calls) == 1 and b1 is b2 and [r["addr"] for r in b1["rows"]] == [A1, A2] and b1["sample"] is False)
clock[0] += 31; H.board()
ok("cache: refetched after the 30 s TTL", len(calls) == 2)
def boom(url): raise OSError("429 Too Many Requests")
H.fetch = boom; clock[0] += 31; st = H.board()
ok("backoff: upstream failure serves the last good copy marked stale", st.get("stale") is True and len(st["rows"]) == 2 and H.wait["board"] > clock[0] and H.wait.get("info", 0) == 0)
H2 = serve.HLCache(fetch=boom, now=lambda: clock[0])
try: H2.board(); ok("backoff: no cached copy → clear error", False)
except ValueError as e: ok("backoff: no cached copy → clear error", "unavailable" in str(e))
try: H2.board(); ok("backoff: during the backoff window upstream is not hammered", False)
except ValueError as e: ok("backoff: during the backoff window upstream is not hammered", "rate-limited" in str(e))
H.trader(A1, ["clearinghouseState"]); H.trader(A1, ["clearinghouseState"])
ok("trader: cached per address + type; bad address and types refused", sum(1 for c in calls if isinstance(c, dict)) == 1 and calls[-1] == {"type": "clearinghouseState", "user": A1})
for bad in (("0xnope", ["userFills"]), (A1, ["order"])):
    try: H.trader(*bad); ok("trader refuses " + repr(bad), False)
    except ValueError: ok("trader refuses " + repr(bad), True)

# ───────── offline sample ─────────
O = serve.HLCache(offline=True)
sb = O.board(); t = O.trader(sb["rows"][0]["addr"], list(serve.HL_TYPES), serve.hl_refs("BTC:60000,ETH:abc,<x>:5"))
ok("offline: 60 seeded sample rows flagged sample, deterministic", sb["sample"] and len(sb["rows"]) == 60 and serve.hl_sample_board()[0]["addr"] == sb["rows"][0]["addr"])
ok("offline: trader sample has positions, fills and orders; price hints validated", t["sample"] and t["clearinghouseState"]["assetPositions"] and len(t["userFills"]) > 10 and t["frontendOpenOrders"] and serve.hl_refs("BTC:60000,ETH:abc,<x>:5") == {"BTC": 60000.0})
ok("offline: sample includes a wash-volume wallet for the Anti-Rug filter", any(r["vlm"]["month"] / max(1, r["acct"]) > 2000 for r in sb["rows"]))

# ───────── HTTP ─────────
def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); n = s.getsockname()[1]; s.close(); return n
PORT = free_port(); BASE = "http://127.0.0.1:%d" % PORT
proc = subprocess.Popen([sys.executable, str(HERE / "serve.py"), str(PORT), "--no-browser", "--no-bots", "--no-update-check", "--offline"], cwd=str(HERE), env=dict(os.environ, EXTERM_DATA=str(tmp / "data")), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
def req(path, headers):
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE + path, headers=headers), timeout=15) as r: return r.status, r.read()
    except urllib.error.HTTPError as e: return e.code, e.read()
try:
    for _ in range(80):
        try: urllib.request.urlopen(BASE + "/", timeout=1); break
        except Exception: time.sleep(0.15)
    page = urllib.request.urlopen(BASE + "/").read().decode()
    TOKEN = re.search(r'name="nt-token" content="([^"]+)"', page).group(1); HH = {"X-ExTerm": TOKEN}
    ok("/api/hl/* needs the session token", req("/api/hl/leaderboard", {})[0] == 403)
    c, b = req("/api/hl/leaderboard", HH); j = json.loads(b)
    ok("/api/hl/leaderboard: offline sample rows with alpha scores", c == 200 and j["sample"] and len(j["rows"]) == 60 and all(0 <= r["alpha"] <= 100 for r in j["rows"]))
    c, b = req("/api/hl/trader?addr=%s&types=clearinghouseState,userFills" % j["rows"][0]["addr"], HH); t = json.loads(b)
    ok("/api/hl/trader: positions + fills for a ranked address", c == 200 and "clearinghouseState" in t and "userFills" in t and "frontendOpenOrders" not in t)
    ok("/api/hl/trader: bad address → 4xx, never upstream", req("/api/hl/trader?addr=0x1", HH)[0] in (400, 500) and req("/api/hl/trader?addr=%s&types=order" % A1, HH)[0] in (400, 500))
    ok("/api/hl/unknown → 404", req("/api/hl/whatever", HH)[0] == 404)
    ok("page: v15.4 modules + Learn ExTerm + pinned script and style hashes", all(k in page for k in ("const V154 = ", "const LearnUI = ", "const LeaderUI = ", "const V154UpUI = ", "LEARN_MOUNT_TARGET")) and "script-src 'sha256-" in page and "style-src-elem 'self' 'sha256-" in page and "default-src 'none'" in page and "'unsafe-inline'" not in page.split("script-src", 1)[1].split(";", 1)[0])
    ok("version: launcher reports 15.x or later (page and launcher agree)", re.match(r"^1[5-9]\.\d+$", serve.VERSION) and ("ExTerm v" + serve.VERSION) in page)
finally:
    proc.terminate(); proc.wait(5)

print("\n".join(res))
n = sum(r.startswith("PASS") for r in res)
print("\n%d/%d passed" % (n, len(res)))
sys.exit(0 if n == len(res) else 1)
