#!/usr/bin/env python3
"""v15 launcher tests: ~/.novaterm -> ~/.exterm migration, the batched RAM price feed (symbol checks, DexScreener 30-pool
and Yahoo spark batching, parsing, watch TTL, closed-browser symbols, errors) and GET /api/feed's gates
(session token, Host, Origin, --no-feed). No external network: upstream calls are faked."""
import json, os, pathlib, re, socket, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error

HERE = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
sys.argv = [sys.argv[0]]
import serve  # noqa: E402

res = []
def ok(name, cond, info=""):
    res.append(("PASS " if cond else "FAIL ") + name + (" — " + str(info)[:300] if info and not cond else ""))

ok("version is 15.0", serve.VERSION == "15.0")
ok("data lives in ~/.exterm by default", serve.DATA_DIR.name in (".exterm",) or os.environ.get("EXTERM_DATA") or os.environ.get("NOVATERM_DATA"), serve.DATA_DIR)

# ───────── migration ─────────
t = pathlib.Path(tempfile.mkdtemp())
old, new = t / ".novaterm", t / ".exterm"
old.mkdir(); (old / "bots.json").write_text('{"bots": []}'); (old / "state.json").write_text("{}")
ok("the old folder is moved on first start", serve.migrate_data_dir(old, new) is True and (new / "bots.json").read_text() == '{"bots": []}' and not old.exists())
old.mkdir(); (old / "bots.json").write_text("OLD")
ok("an existing ~/.exterm is never overwritten", serve.migrate_data_dir(old, new) is False and (new / "bots.json").read_text() == '{"bots": []}' and (old / "bots.json").exists())
ok("nothing to move is a quiet no-op", serve.migrate_data_dir(t / "missing", t / "other") is False and not (t / "other").exists())

# ───────── symbol checks (trust boundary: the page sends these) ─────────
P = serve.PriceFeed
SOL = "oc:solana:" + "A" * 43
good = [SOL, "oc:eth:0x" + "a" * 40, "AAPL", "BRK-B", "^GSPC", "EURUSD=X"]
bad = ["oc:solana:<script>", "oc:evil:" + "A" * 43, "oc:solana:short", "BTC-USD", "aapl", "", None, 5, "A" * 200, "oc:solana:" + "A" * 43 + "/../x", "AAPL,MSFT", "javascript:alert(1)"]
ok("valid DEX pools and tickers are accepted", all(P.kind(s) for s in good), [s for s in good if not P.kind(s)])
ok("junk, injection and crypto majors are refused", not any(P.kind(s) for s in bad), [s for s in bad if P.kind(s)])

# ───────── batching + parsing ─────────
calls, lock = [], threading.Lock()
def fake(url):
    with lock: calls.append(url)
    if "dexscreener" in url:
        chain, ids = url.split("/pairs/")[1].split("/", 1)
        pairs = [{"pairAddress": i.lower() if n % 2 else i, "priceUsd": "%d.5" % (n + 1), "priceChange": {"h24": -3.5}, "volume": {"h24": 1e5}, "liquidity": {"usd": 5e4}} for n, i in enumerate(ids.split(","))]
        pairs.append({"pairAddress": "NOT_REQUESTED" * 3, "priceUsd": "9"}); pairs.append({"pairAddress": ids.split(",")[0], "priceUsd": "NaN"})
        return {"pairs": pairs}
    syms = urllib.parse.unquote(url.split("symbols=")[1].split("&")[0]).split(",")
    if len(syms) > 1: return {"spark": {"result": [{"symbol": s, "response": [{"meta": {"regularMarketPrice": 100 + n, "chartPreviousClose": 100}}]} for n, s in enumerate(syms)]}}
    return {syms[0]: {"symbol": syms[0], "close": [10, None, 12], "chartPreviousClose": 8}}
import urllib.parse  # noqa: E402
now = [1000.0]
pools = ["oc:solana:%s%040d" % ("P", i) for i in range(65)]
stocks = ["T%d" % i for i in range(45)] + ["AAPL"]
F = P(fetch=fake, now=lambda: now[0])
F.want(pools + stocks + ["BTC-USD", "oc:solana:<x>"])
n = F.poll()
dex = [c for c in calls if "dexscreener" in c]; yf = [c for c in calls if "yahoo" in c]
ok("65 pools take 3 DexScreener calls of at most 30", len(dex) == 3 and max(len(c.rsplit("/", 1)[1].split(",")) for c in dex) == 30, [len(c.rsplit("/", 1)[1].split(",")) for c in dex])
ok("46 tickers take 2 Yahoo spark calls (?symbols=)", len(yf) == 2 and all("/v7/finance/spark?symbols=" in c for c in yf), yf)
ok("refused symbols never reach upstream", not any("BTC-USD" in c or "%3C" in c or "<" in c for c in calls))
snap = F.snapshot()
ok("every requested symbol got a price", n == 111 and set(snap) == set(pools + stocks), (n, len(snap)))
ok("DexScreener prices, 24h change, volume and liquidity are parsed", snap[pools[0]]["p"] == 1.5 and snap[pools[0]]["ch24"] == -3.5 and snap[pools[0]]["liq"] == 5e4 and snap[pools[1]]["p"] == 2.5)
ok("pairs nobody asked for and NaN prices are dropped", "NOT_REQUESTED" not in json.dumps(snap) and all(v["p"] > 0 for v in snap.values()))
ok("Yahoo spark meta is parsed", all(snap[s]["p"] >= 100 and abs(snap[s]["ch24"] - (snap[s]["p"] / 100 - 1) * 100) < 1e-9 for s in stocks) and len({snap[s]["p"] for s in stocks}) > 1)
F2 = P(fetch=fake, now=lambda: now[0]); F2.want(["AAPL"]); F2.poll()
ok("Yahoo's newer flat spark format is parsed too", F2.snapshot()["AAPL"]["p"] == 12 and abs(F2.snapshot()["AAPL"]["ch24"] - 50) < 1e-9, F2.snapshot())

# ───────── freshness, TTL, closed-browser symbols ─────────
ok("price() returns fresh cached prices", F.price("AAPL") == snap["AAPL"]["p"])
now[0] += 11; ok("…and nothing once it is stale", F.price("AAPL") is None)
keep = ["oc:solana:" + "K" * 43]
F3 = P(fetch=fake, now=lambda: now[0], extra=lambda: keep + ["junk!"]); F3.want(["MSFT"])
now[0] += P.WATCH_TTL + 1
ok("page symbols expire after the watch TTL", "MSFT" not in F3.active())
ok("bot / alert symbols stay watched with no page open", F3.active() == keep, F3.active())
calls.clear(); F3.poll(); ok("…and keep being polled", len(calls) == 1 and "K" * 43 in calls[0] and keep[0] in F3.snapshot())
F4 = P(fetch=fake, now=lambda: now[0]); F4.want(["S%d" % i for i in range(P.MAX_SYMS + 50)])
ok("at most %d symbols are watched" % P.MAX_SYMS, len(F4.active()) == P.MAX_SYMS)
now[0] += 1; F4.want(["NEWEST"]); ok("when full, the oldest watch makes room for a new symbol", "NEWEST" in F4.active() and len(F4.active()) == P.MAX_SYMS)
def limited(url):
    if "dexscreener" in url:
        with lock: calls.append(url)
        raise OSError("HTTP Error 429: Too Many Requests")
    return fake(url)  # records the call itself
F7 = P(fetch=limited, now=lambda: now[0]); F7.want(["AAPL", SOL]); calls.clear(); F7.poll(); F7.poll()
ok("a 429 pauses that source for 30 s, the other keeps polling", sum("dexscreener" in c for c in calls) == 1 and sum("yahoo" in c for c in calls) == 2, calls)
now[0] += 31; calls.clear(); F7.poll(); ok("…then it is tried again", any("dexscreener" in c for c in calls))

# ───────── errors ─────────
def boom(url): raise OSError("network down")
F5 = P(fetch=boom, now=lambda: now[0]); F5.want(["AAPL", SOL])
ok("upstream errors are recorded, not raised", F5.poll() == 0 and "network down" in F5.last_err)
half = lambda url: (_ for _ in ()).throw(OSError("dex down")) if "dexscreener" in url else fake(url)
F6 = P(fetch=half, now=lambda: now[0]); F6.want(["AAPL", SOL]); F6.poll()
ok("one failing source doesn't block the other", "AAPL" in F6.snapshot() and SOL not in F6.snapshot() and F6.last_err == "")
ok("the real fetcher only talks to allow-listed https hosts", all(serve.host_allowed(h) for h in ("api.dexscreener.com", "query1.finance.yahoo.com")))
try: P()._get_json("https://evil.example/x"); ok("a non-allow-listed host is refused", False)
except ValueError: ok("a non-allow-listed host is refused", True)

# ───────── HTTP ─────────
def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p
PORT = free_port(); tmp = pathlib.Path(tempfile.mkdtemp())
def start(*extra):
    p = subprocess.Popen([sys.executable, str(HERE / "serve.py"), str(PORT), "--no-browser", "--no-bots", "--no-alerts", "--no-update-check", *extra], cwd=str(HERE), env=dict(os.environ, EXTERM_DATA=str(tmp)), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        try: urllib.request.urlopen("http://127.0.0.1:%d/" % PORT, timeout=1); break
        except Exception: time.sleep(0.15)
    return p
BASE = "http://127.0.0.1:%d" % PORT
def req(path, headers):
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE + path, headers=headers), timeout=10) as r: return r.status, r.read()
    except urllib.error.HTTPError as e: return e.code, e.read()
proc = start()
try:
    page = urllib.request.urlopen(BASE + "/").read().decode()
    TOKEN = re.search(r'name="nt-token" content="([^"]+)"', page).group(1)
    ok("the page is served as ExTerm", "<title>ExTerm" in page or "ExTerm" in page[:4000])
    ok("the CSP starts from default-src 'none' with a pinned script hash", "default-src 'none'" in page and "script-src 'sha256-" in page and "unsafe-eval" not in page)
    q = "/api/feed?syms=AAPL," + SOL
    ok("/api/feed needs the session token", req(q, {})[0] == 403 and req(q, {"X-ExTerm": "wrong"})[0] == 403 and req(q, {"X-NovaTerm": TOKEN})[0] == 403)
    ok("/api/feed refuses a foreign Host (DNS rebinding)", req(q, {"X-ExTerm": TOKEN, "Host": "evil.example:%d" % PORT})[0] == 421)
    ok("/api/feed refuses a cross-site Origin", req(q, {"X-ExTerm": TOKEN, "Origin": "https://evil.example"})[0] == 403)
    st, body = req(q, {"X-ExTerm": TOKEN}); j = json.loads(body)
    ok("/api/feed answers from RAM right away", st == 200 and isinstance(j["prices"], dict) and "polls" in j and "ts" in j, body[:200])
    st, body = req("/api/feed?syms=" + urllib.parse.quote("<img src=x onerror=alert(1)>,oc:solana:';drop"), {"X-ExTerm": TOKEN})
    ok("junk symbols are ignored, never echoed", st == 200 and b"<img" not in body and b"drop" not in body, body[:200])
    many = ",".join("oc:solana:%s%040d" % ("Q", i) for i in range(300))
    st, body = req("/api/feed?syms=" + many, {"X-ExTerm": TOKEN}); ok("300 pool symbols (~16 KB) are all accepted, none cut mid-address", st == 200, st)
    ok("caps report the feed", json.loads(req("/api/caps", {"X-ExTerm": TOKEN})[1])["feed"] is True)
finally:
    proc.terminate(); proc.wait(5)
proc = start("--no-feed")
try:
    TOKEN = re.search(r'name="nt-token" content="([^"]+)"', urllib.request.urlopen(BASE + "/").read().decode()).group(1)
    ok("--no-feed turns it off", req("/api/feed?syms=AAPL", {"X-ExTerm": TOKEN})[0] == 503 and json.loads(req("/api/caps", {"X-ExTerm": TOKEN})[1])["feed"] is False)
finally:
    proc.terminate(); proc.wait(5)

print("\n".join(res))
n = sum(r.startswith("PASS") for r in res)
print("%d/%d passed" % (n, len(res)))
sys.exit(0 if n == len(res) else 1)
