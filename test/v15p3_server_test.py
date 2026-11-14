#!/usr/bin/env python3
"""v15 phase 3 launcher tests: World Monitor intel cache (cleaning, severity, CRITICAL handling, host lock), the macro
shield on background bots, the RAM tick buffer behind 1s / 5s stock bars, rich Discord alerts, Python parity for the 40
pack-4 specs, and the new endpoints' token gates. No external network: fetches are faked, the server runs --offline."""
import json, os, pathlib, re, socket, subprocess, sys, tempfile, time, urllib.request, urllib.error

HERE = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
sys.argv = [sys.argv[0]]
import serve  # noqa: E402

res = []
def ok(name, cond, info=""):
    res.append(("PASS " if cond else "FAIL ") + name + (" -- " + str(info)[:300] if info and not cond else ""))
tmp = pathlib.Path(tempfile.mkdtemp())

# ───────── World Monitor: cleaning + severity ─────────
NOW = 1_800_000_000.0
def digest(items): return {"categories": {"world": {"items": items}}, "generatedAt": "x"}
def item(**k):
    d = dict({"source": "Reuters", "title": "Headline about something", "publishedAt": (NOW - 60) * 1000, "threat": {"level": "THREAT_LEVEL_LOW", "category": "general"}}, **k)
    d.setdefault("link", "https://news.example/" + re.sub(r"\W+", "-", d["title"])[:40])  # each story its own URL (items de-dupe by link)
    return d
c = serve.WorldMonitor.clean_item
x = c(item(threat={"level": "THREAT_LEVEL_CRITICAL", "category": "conflict"}), "full")
ok("CRITICAL threat level maps to CRITICAL, ms timestamps become seconds", x["sev"] == "CRITICAL" and abs(x["ts"] - (NOW - 60)) < 1, x)
ok("HIGH maps to HIGH", c(item(threat={"level": "THREAT_LEVEL_HIGH"}), "full")["sev"] == "HIGH")
ok("economics headlines become MACRO", c(item(title="Fed signals a rate cut as inflation cools"), "finance")["sev"] == "MACRO" and c(item(title="Plain story here", threat={"category": "economic"}), "finance")["sev"] == "MACRO")
ok("other news is INFO", c(item(title="Local team wins the cup"), "full")["sev"] == "INFO")
ok("javascript:/data: links are dropped", c(item(link="javascript:alert(1)"), "full")["link"] == "" and c(item(link="https://ok.example/x\"onmouseover=1"), "full")["link"] == "")
ok("control and bidi-override characters are stripped, titles capped", "‮" not in c(item(title="ab‮cd" + "x" * 900), "full")["title"] and len(c(item(title="y" * 900), "full")["title"]) == 300)
ok("junk rows are refused", c("str", "full") is None and c(item(title="ab"), "full") is None and c(item(publishedAt="NaN"), "full")["ts"] == 0.0)

# ───────── World Monitor: polling, CRITICAL actions ─────────
hits = []
feed = {"finance": digest([item(title="Fed holds rates steady"), item(title="Strait closed after strike", threat={"level": "THREAT_LEVEL_CRITICAL"})]),
        "full": digest([item(title="Strait closed after strike", threat={"level": "THREAT_LEVEL_CRITICAL"}), item(title="Old crisis story", publishedAt=(NOW - 7200) * 1000, threat={"level": "THREAT_LEVEL_CRITICAL"})])}
urls = []
def fake(url):
    urls.append(url); v = re.search(r"variant=(\w+)", url).group(1); return feed[v]
W = serve.WorldMonitor(fetch=fake, now=lambda: NOW, on_critical=lambda it, cfg: hits.append(it["title"]), path=tmp / "intel.json")
n = W.poll()
ok("only the public key-free digest shape is requested", all(re.match(r"^https://api\.worldmonitor\.app/api/news/v1/list-feed-digest\?public=1&variant=(finance|full)&lang=en$", u) for u in urls) and len(urls) == 2, urls)
ok("items are merged across variants and de-duplicated", n == 3, n)
ok("a fresh CRITICAL fires once; a 2-hour-old one never", hits == ["Strait closed after strike"], hits)
W.poll(); ok("the same CRITICAL does not fire again on the next poll", hits == ["Strait closed after strike"], hits)
pub = W.public()
ok("public view: counts, shield flag, cfg, source", pub["counts"]["CRITICAL"] == 2 and pub["shield"] is True and pub["source"] == "worldmonitor.app" and set(pub["cfg"]) == {"notify", "autoPause", "tighten"})
try: serve.WorldMonitor(path=tmp / "i1.json")._get_json("https://evil.example/x"); ok("World Monitor fetches refuse every other host", False)
except ValueError: ok("World Monitor fetches refuse every other host", True)
try: serve.WorldMonitor(path=tmp / "i2.json")._get_json("https://api.worldmonitor.app.evil.example/x"); ok("lookalike host refused", False)
except ValueError: ok("lookalike host refused", True)
W2 = serve.WorldMonitor(fetch=lambda u: (_ for _ in ()).throw(RuntimeError("HTTP 503")), now=lambda: NOW, path=tmp / "i3.json"); W2.poll()
ok("an upstream failure is reported, the old items are kept", W2.public()["error"].startswith("HTTP 503") and W2.public()["items"] == [])
cfg = W.set_cfg({"notify": "yes", "autoPause": 1, "tighten": 0, "evil": True})
ok("intel settings are coerced to three booleans and saved", cfg == {"notify": True, "autoPause": True, "tighten": False} and json.loads((tmp / "intel.json").read_text())["cfg"] == cfg)
ok("every World Monitor action is opt-in by default", serve.WorldMonitor(path=tmp / "fresh.json").cfg == {"notify": False, "autoPause": False, "tighten": False})
hits2 = []; W3 = serve.WorldMonitor(fetch=fake, now=lambda: NOW, on_critical=lambda it, cfg: hits2.append(it["title"]), path=tmp / "intel.json"); W3.poll()
ok("a restart remembers CRITICALs already acted on (no second push / shield)", hits2 == [], hits2)
fut = digest([item(title="Tomorrow's war", publishedAt=(NOW + 86400) * 1000, threat={"level": "THREAT_LEVEL_CRITICAL"})]); hits3 = []
W4 = serve.WorldMonitor(fetch=lambda u: fut, now=lambda: NOW, on_critical=lambda it, cfg: hits3.append(1), path=tmp / "i4.json"); W4.poll()
ok("a future-dated CRITICAL is never fresh", hits3 == [] and all(i["ts"] <= NOW + 300 for i in W4.public()["items"]))
ok("intel settings survive a restart", serve.WorldMonitor(path=tmp / "intel.json").cfg["autoPause"] is True)

# on_critical: phone push (neutralised) + opt-in bot shield
sent = []
class FakeBots:
    calls = []
    def shield(self, pause=True, tighten=False, **k): self.calls.append((pause, tighten)); return 2
serve.ALERTS = type("A", (), {"send": lambda self, t: sent.append(t) or ["discord"]})(); serve.BOTS = FakeBots()
acted = serve.on_critical({"title": "Attack on https://evil.example/pay", "source": "Wire"}, {"notify": True, "autoPause": True, "tighten": True})
ok("CRITICAL push goes out with links neutralised and the bot action noted", sent and "://" not in sent[0] and "2 bot(s) shielded" in sent[0] and sent[0].startswith("🚨"), sent)
serve.ALERTS.cfg = {"enabled": False}; sent.clear(); serve.on_critical({"title": "t2", "source": "s"}, {"notify": True})
ok("the launcher's alerts off-switch also silences World Monitor pushes", sent == [])
serve.ALERTS.cfg = {"enabled": True}
ok("the shield is only applied when opted in", FakeBots.calls == [(True, True)] and serve.on_critical({"title": "t", "source": "s"}, {"notify": False}) == [] and FakeBots.calls == [(True, True)])
serve.ALERTS = None; serve.BOTS = None

# ───────── macro shield on background bots ─────────
clock = [NOW]
B = serve.BgBots(path=tmp / "bots.json", fetch=lambda s, tf: [], notify=None, now=lambda: clock[0])
spec = {"v": 1, "name": "Always in", "entry": {"all": [{"a": {"k": "price"}, "op": ">", "b": {"k": "const", "v": 0}}]}, "exit": {"any": []}, "risk": {"sl": 5}}
B.upsert({"id": "b1", "sym": "BTC-USD", "tf": "1m", "spec": spec, "capital": 1000})
B.upsert({"id": "b2", "sym": "ETH-USD", "tf": "1m", "spec": dict(spec, dir="short"), "capital": 1000})
cand = [{"t": NOW - 60 * (30 - i), "o": 100, "h": 101, "l": 99, "c": 100, "v": 1} for i in range(30)]
n = B.shield(pause=True, tighten=False, minutes=60)
ok("shield pauses every active bot for an hour", n == 2 and all(b["shieldUntil"] == NOW + 3600 for b in B.bots))
made = B.step(B.bots[0], cand)
ok("a shielded bot takes no new entries and says why", made == [] and B.bots[0]["pos"] is None and "macro shield" in B.bots[0]["status"], B.bots[0]["status"])
clock[0] = NOW + 3700; B.bots[0]["lastBar"] = 0; cand2 = [dict(k, t=k["t"] + 3700) for k in cand]
made = B.step(B.bots[0], cand2)
ok("after the shield expires entries resume", len(made) == 1 and B.bots[0]["pos"], made)
B.bots[1]["lastBar"] = 0; B.step(B.bots[1], cand2)
B.bots[0]["price"] = 100.0; B.bots[1]["price"] = 100.0
sl_long0, sl_short0 = B.bots[0]["pos"]["sl"], B.bots[1]["pos"]["sl"]
B.shield(pause=False, tighten=True, stop_pct=1.0)
ok("tighten pulls a long stop up to 1% under price and a short stop down to 1% over", abs(B.bots[0]["pos"]["sl"] - 99.0) < 1e-9 and abs(B.bots[1]["pos"]["sl"] - 101.0) < 1e-9, (sl_long0, sl_short0, B.bots[0]["pos"]["sl"], B.bots[1]["pos"]["sl"]))
B.bots[0]["pos"]["sl"] = 99.8; B.shield(pause=False, tighten=True, stop_pct=1.0)
ok("tighten never loosens a stop", B.bots[0]["pos"]["sl"] == 99.8)
ok("shieldUntil survives a reload from disk", serve.BgBots(path=tmp / "bots.json", fetch=lambda s, tf: []).bots[0]["shieldUntil"] == NOW + 3600)
B.bots[1]["shieldUntil"] = NOW + 99999; n = B.shield(clear=True)
ok("resume lifts the shield early", n >= 1 and all(not b["shieldUntil"] for b in B.bots))
ok("a corrupt shieldUntil from disk is coerced, not a crash", serve.BgBots.clean_bot({"id": "z", "sym": "BTC-USD", "tf": "1m", "spec": spec}, {"shieldUntil": "evil"})["shieldUntil"] == 0.0)
try: B.upsert({"id": "b3", "sym": "BTC-USD", "tf": "1s", "spec": spec}); ok("background bots still refuse sub-minute timeframes", False)
except ValueError: ok("background bots still refuse sub-minute timeframes", True)

# ───────── RAM tick buffer (1s / 5s stock bars) ─────────
t = [NOW]
F = serve.PriceFeed(fetch=lambda u: {"spark": {"result": [{"symbol": "AAPL", "response": [{"meta": {"regularMarketPrice": 200 + t[0] - NOW, "chartPreviousClose": 190}}]}]}}, now=lambda: t[0])
F.want(["AAPL"])
for i in range(3): F.poll(); t[0] += 2
h = F.tick_history("AAPL")
ok("every poll appends (ts, price) to the symbol's buffer", len(h) == 3 and h[0] == [NOW, 200] and h[2][1] == 204, h)
ok("the buffer is bounded", F.ticks["AAPL"].maxlen == serve.PriceFeed.TICKS == 1800)
ok("invalid symbols get no history", F.tick_history("../etc") == [] and F.tick_history("BTC-USD") == [])
F.want(["MSFT"]); F.watch.pop("AAPL"); F.poll()
ok("a symbol nobody watches any more drops its buffer", "AAPL" not in F.ticks, list(F.ticks))

# ───────── rich Discord alert payloads ─────────
p = serve.Alerts.discord_payload("🚨 World Monitor CRITICAL: [click](https://evil.example) @everyone\nsource line")
ok("Discord alerts are embeds: red for CRITICAL, Markdown escaped, no pings, no previews", p["embeds"][0]["color"] == 0xEF4444 and "\\[click\\]" in p["embeds"][0]["title"] and "\\@everyone" in p["embeds"][0]["title"] and p["allowed_mentions"] == {"parse": []} and p["flags"] == 4, p)
ok("bot trades are violet, price alerts amber", serve.Alerts.discord_payload("🤖 ExTerm bot x")["embeds"][0]["color"] == 0x8B5CF6 and serve.Alerts.discord_payload("🔔 ExTerm alert")["embeds"][0]["color"] == 0xF59E0B)

# ───────── Python parity: every pack-4 spec runs in the launcher ─────────
js = "const NT=require('./src/strategies4.js');process.stdout.write(JSON.stringify(NT.PACK4.map(id=>NT.strategies[id].spec)))"
specs = json.loads(subprocess.run(["node", "-e", js], cwd=str(HERE), capture_output=True, text=True, timeout=60).stdout)
bad = []
for s in specs:
    try: serve.spec_validate(s)
    except ValueError as e: bad.append((s["name"], str(e)))
ok("all 40 pack-4 specs pass the launcher's validator (24/7 bots can run them)", len(specs) == 40 and not bad, bad)
cand3 = [{"t": 1_700_000_000 + i * 60, "o": 100 + (i % 17), "h": 102 + (i % 17), "l": 98 + (i % 17), "c": 100 + ((i * 7) % 23), "v": 10 + i % 5} for i in range(400)]
ok("and the Python interpreter produces signals for them", all(len(serve.spec_signals(serve.spec_validate(s), cand3)[0]) == 400 for s in specs))

# ───────── HTTP: new endpoints behind the session token ─────────
def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); n = s.getsockname()[1]; s.close(); return n
PORT = free_port(); BASE = "http://127.0.0.1:%d" % PORT
proc = subprocess.Popen([sys.executable, str(HERE / "serve.py"), str(PORT), "--no-browser", "--no-alerts", "--no-update-check", "--offline"], cwd=str(HERE), env=dict(os.environ, EXTERM_DATA=str(tmp / "data")), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
def req(path, headers, body=None):
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE + path, headers=headers, data=body, method="POST" if body is not None else "GET"), timeout=15) as r: return r.status, r.read()
    except urllib.error.HTTPError as e: return e.code, e.read()
try:
    for _ in range(80):
        try: urllib.request.urlopen(BASE + "/", timeout=1); break
        except Exception: time.sleep(0.15)
    page = urllib.request.urlopen(BASE + "/").read().decode()
    TOKEN = re.search(r'name="nt-token" content="([^"]+)"', page).group(1); H = {"X-ExTerm": TOKEN}
    ok("/api/ticks and /api/intel need the session token", req("/api/ticks?sym=AAPL", {})[0] == 403 and req("/api/intel", {"X-ExTerm": "nope"})[0] == 403 and req("/api/bots/shield", {}, b"{}")[0] == 403)
    ok("/api/ticks refuses a cross-site Origin", req("/api/ticks?sym=AAPL", dict(H, Origin="https://evil.example"))[0] == 403)
    st, body = req("/api/ticks?sym=AAPL", H); ok("/api/ticks answers from RAM", st == 200 and json.loads(body)["sym"] == "AAPL" and isinstance(json.loads(body)["ticks"], list), body[:200])
    ok("/api/ticks rejects a bad symbol", req("/api/ticks?sym=%3Cscript%3E", H)[0] == 400)
    ok("--offline turns World Monitor off (503, caps say so)", req("/api/intel", H)[0] == 503 and json.loads(req("/api/caps", H)[1])["intel"] is False)
    ok("the served page ships the Grok tab, pack 4 and phase 3 core under the pinned CSP", all(k in page for k in ("const Grok = ", "NT.PACK4", "const P3 = ", 'data-tab="grok"')) and "script-src 'sha256-" in page and "default-src 'none'" in page and "'unsafe-inline'" not in page.split("script-src", 1)[1].split(";", 1)[0])
    ok("no inline event-handler attributes in the shipped page", not re.search(r"<[^>]+\son(click|change|load|error|input|submit|mouseover)\s*=", page, re.I))
finally:
    proc.terminate(); proc.wait(5)

print("\n".join(res))
n = sum(r.startswith("PASS") for r in res)
print("%d/%d passed" % (n, len(res)))
sys.exit(0 if n == len(res) else 1)
