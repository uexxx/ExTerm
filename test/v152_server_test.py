#!/usr/bin/env python3
"""v15.2 launcher tests: build-integrity hashes vs SHA256SUMS.txt (relative names only), rich alert cards with a PNG chart
snapshot (Telegram sendPhoto + Discord embed image, host allow-list kept), /api/health telemetry and /api/integrity behind
the session token, PNG validation on /api/notify. No external network: posts are captured, the server runs --offline."""
import base64, json, os, pathlib, re, socket, subprocess, sys, tempfile, time, urllib.request, urllib.error

HERE = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
sys.argv = [sys.argv[0]]
import serve  # noqa: E402

res = []
def ok(name, cond, info=""):
    res.append(("PASS " if cond else "FAIL ") + name + (" -- " + str(info)[:300] if info and not cond else ""))
tmp = pathlib.Path(tempfile.mkdtemp())

# ───────── integrity ─────────
r = serve.integrity()
ok("integrity: SHA256SUMS found, exterm.html + serve.py both match the build", r["sums"] and [x["name"] for x in r["files"]] == ["exterm.html", "serve.py"] and all(x["ok"] for x in r["files"]), r)
ok("integrity: only relative file names leave the function (no paths)", not re.search(r"[A-Za-z]:\\\\|/Users/|/home/", json.dumps(r)))

# ───────── alert cards ─────────
A = serve.Alerts(path=tmp / "alerts.json", fetch=lambda s: None)
A.cfg.update({"tgToken": "123456:" + "A" * 35, "tgChat": "42", "discord": "https://discord.com/api/webhooks/123456789/" + "x" * 40})
posts = []
A._post_multipart = lambda url, fields, fname, data: posts.append((url, fields, fname, data)) or 200
png = b"\x89PNG\r\n\x1a\n" + b"0" * 64
sent = A.send_card("🔔 BUY BTC · 1h\nEntry 100\nR:R 3", png)
ok("card: Telegram sendPhoto with caption + Discord multipart with the embed image attachment", sent == ["telegram", "discord"] and posts[0][0].endswith("/sendPhoto") and posts[0][2] == "photo" and posts[0][1]["caption"].startswith("🔔 BUY BTC")
   and json.loads(posts[1][1]["payload_json"])["embeds"][0]["image"]["url"] == "attachment://chart.png" and posts[1][2] == "files[0]", posts[:1])
ok("card: Discord payload still never pings anyone", json.loads(posts[1][1]["payload_json"])["allowed_mentions"] == {"parse": []})
calls = []; A.send = lambda t: calls.append(t) or ["telegram"]
ok("card: no PNG → plain text alert", A.send_card("hello there", b"") == ["telegram"] and calls == ["hello there"])
try:
    serve.Alerts._post_multipart(A, "https://evil.example/hook", {}, "f", b"x"); ok("card: non-allow-listed host refused", False)
except ValueError:
    ok("card: non-allow-listed host refused", True)

# ───────── HTTP ─────────
def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); n = s.getsockname()[1]; s.close(); return n
PORT = free_port(); BASE = "http://127.0.0.1:%d" % PORT
proc = subprocess.Popen([sys.executable, str(HERE / "serve.py"), str(PORT), "--no-browser", "--no-bots", "--no-update-check", "--offline"], cwd=str(HERE), env=dict(os.environ, EXTERM_DATA=str(tmp / "data")), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
def req(path, headers, body=None):
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE + path, headers=dict(headers, **({"Content-Type": "application/json"} if body is not None else {})), data=body, method="POST" if body is not None else "GET"), timeout=15) as r: return r.status, r.read()
    except urllib.error.HTTPError as e: return e.code, e.read()
try:
    for _ in range(80):
        try: urllib.request.urlopen(BASE + "/", timeout=1); break
        except Exception: time.sleep(0.15)
    page = urllib.request.urlopen(BASE + "/").read().decode()
    TOKEN = re.search(r'name="nt-token" content="([^"]+)"', page).group(1); H = {"X-ExTerm": TOKEN}
    ok("/api/health and /api/integrity need the session token", req("/api/health", {})[0] == 403 and req("/api/integrity", {"X-ExTerm": "nope"})[0] == 403)
    c, b = req("/api/health", H); j = json.loads(b)
    ok("/api/health: current version, uptime, cache counters, bot heartbeats", c == 200 and j["version"] == serve.VERSION and j["uptime"] >= 0 and set(j["cache"]) == {"hits", "total"} and set(j["bots"]) == {"total", "active", "lastBar"}, j)
    c, b = req("/api/integrity", H); j = json.loads(b)
    ok("/api/integrity: served build matches SHA256SUMS", c == 200 and all(x["ok"] for x in j["files"]), j)
    c, _ = req("/api/notify", H, json.dumps({"text": "card test", "png": base64.b64encode(b"GIF89a" + b"0" * 40).decode()}).encode())
    ok("/api/notify refuses a snapshot that isn't a PNG", c == 400)
    c, _ = req("/api/notify", H, json.dumps({"text": "card test", "png": "!!!not base64!!!"}).encode())
    ok("/api/notify refuses broken base64", c == 400)
    c, b = req("/api/notify", H, json.dumps({"text": "card test", "png": base64.b64encode(png).decode()}).encode())
    ok("/api/notify accepts a PNG card (nothing configured → sent nobody)", c == 200 and json.loads(b)["sent"] == [], b[:200])
    ok("page: language pill + data-i18n nav inside intact tab buttons, still no inline handlers", 'id="btnLang"' in page and len(re.findall(r'<button data-tab="\w+"[^>]*><span class="ni">[^<]+</span><span data-i18n="nav\.\w+">', page)) == 11 and "\\1<span" not in page and not re.search(r"<[^>]+\son(click|change|load|error|input|submit|mouseover)\s*=", page, re.I))
finally:
    proc.terminate(); proc.wait(5)

print("\n".join(res))
n = sum(r.startswith("PASS") for r in res)
print("%d/%d passed" % (n, len(res)))
sys.exit(0 if n == len(res) else 1)
