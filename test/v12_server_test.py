#!/usr/bin/env python3
"""v12 launcher tests: background-alert engine (validation, secrets, firing, notifications, file permissions) and the
HTTP surface added in v12 (/api/*, /ollama/*): session token, Host / Origin checks, route allow-lists, size limits,
and a fake local Ollama to prove the bridge only ever talks to 127.0.0.1:11434 on three fixed paths."""
import http.server, json, os, pathlib, socket, stat, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error

HERE = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
sys.argv = [sys.argv[0]]
import serve  # noqa: E402

res = []
def ok(name, cond, info=""):
    res.append(("PASS " if cond else "FAIL ") + name + (" — " + str(info) if info and not cond else ""))

TOK = "123456789:" + "A" * 35
HOOK = "https://discord.com/api/webhooks/123456789012/" + "x" * 40

# ───────── Alerts engine (unit) ─────────
tmp = pathlib.Path(tempfile.mkdtemp())
prices = {"BTC-USD": 100.0, "AAPL": 200.0}
sent = []
A = serve.Alerts(path=tmp / "alerts.json", fetch=lambda s: prices[s], send=lambda text: sent.append(text) or ["telegram"])
ok("rejects bad symbols / directions / prices / ids", A.set_alerts([
    {"id": "a1", "sym": "BTC-USD", "dir": "above", "price": 105},
    {"id": "a2", "sym": "AAPL", "dir": "below", "price": 190, "note": "<script>x</script>"},
    {"id": "bad1", "sym": "../../etc", "dir": "above", "price": 1},
    {"id": "bad2", "sym": "BTC-USD", "dir": "sideways", "price": 1},
    {"id": "bad3", "sym": "BTC-USD", "dir": "above", "price": -5},
    {"id": "bad 4!", "sym": "BTC-USD", "dir": "above", "price": 5},
    {"id": "bad5", "sym": "BTC-USD", "dir": "above", "price": "1e999"},
    "not a dict"]) == 2, A.alerts)
ok("notes lose angle brackets", all("<" not in a["note"] for a in A.alerts))
ok("caps the list at 50", A.set_alerts([{"id": "x%d" % i, "sym": "BTC-USD", "dir": "above", "price": 1e9} for i in range(80)]) == 50)
A.set_alerts([{"id": "a1", "sym": "BTC-USD", "dir": "above", "price": 105}, {"id": "a2", "sym": "AAPL", "dir": "below", "price": 190}])
ok("nothing fires before the level", A.tick() == [] and not sent)
prices["BTC-USD"] = 106.0
fired = A.tick()
ok("fires when price crosses", len(fired) == 1 and fired[0]["id"] == "a1" and fired[0]["sent"] == ["telegram"] and "BTC is above 105" in sent[0], sent)
ok("fires only once", A.tick() == [] and len(sent) == 1)
prices["AAPL"] = 180.0; A.tick()
ok("below alerts work too", len(sent) == 2 and "AAPL is below 190" in sent[1])
prices["BTC-USD"] = None
A.set_alerts([{"id": "a3", "sym": "BTC-USD", "dir": "above", "price": 1}])
def boom(s): raise RuntimeError("network down")
A.fetch = boom
ok("price errors don't crash or fire", A.tick() == [] and "unavailable" in A.last_err)
A.cfg["enabled"] = False; A.fetch = lambda s: 999.0
ok("disabled engine never fires", A.tick() == [])
A.cfg["enabled"] = True

# config validation + secret masking
for bad in ({"tgToken": "nope"}, {"tgChat": "hello world"}, {"discord": "https://evil.example/api/webhooks/1/abc"}, {"discord": "http://discord.com/api/webhooks/123456/" + "a" * 30}):
    try: A.set_cfg(bad); ok("rejects bad config " + list(bad)[0], False)
    except ValueError: ok("rejects bad config " + list(bad)[0] + " " + str(bad)[:30], True)
A.set_cfg({"tgToken": TOK, "tgChat": "123456", "discord": HOOK})
pub = json.dumps(A.public())
ok("public view never contains secrets", TOK not in pub and HOOK not in pub and "x" * 40 not in pub and A.public()["telegram"] is True)
A.set_cfg({"tgToken": "", "tgChat": "", "discord": ""})
ok("empty fields keep stored secrets", A.cfg.get("tgToken") == TOK and A.cfg.get("discord") == HOOK)
A.set_cfg({"tgToken": "-", "tgChat": "-", "discord": "-"})
ok("'-' clears stored secrets", not A.cfg.get("tgToken") and not A.cfg.get("discord"))
A.set_cfg({"tgToken": TOK, "tgChat": "123456"})
ok("errors are redacted", TOK not in A.redact("failed https://api.telegram.org/bot" + TOK + "/sendMessage"))
mode = stat.S_IMODE(os.stat(tmp / "alerts.json").st_mode)
ok("alerts file is owner-only (0600)", os.name == "nt" or mode == 0o600, oct(mode))  # Windows has no POSIX modes (per-user profile ACLs apply)
B = serve.Alerts(path=tmp / "alerts.json", fetch=lambda s: 1, send=lambda t: [])
ok("settings survive a restart", B.cfg.get("tgToken") == TOK and any(a["id"] == "a3" for a in B.alerts))
(tmp / "evil.json").write_text(json.dumps({"alerts": [{"id": "z", "sym": "rm -rf /", "dir": "above", "price": 1}], "cfg": {"discord": "https://evil.example/x"}, "hits": "nope"}))
C = serve.Alerts(path=tmp / "evil.json")
ok("tampered alerts file is sanitised on load", C.alerts == [] and C.cfg == {} and C.hits == [])

# outbound targets: prices only from allow-listed hosts, notifications only to Telegram / Discord
try: A._get_json("https://evil.example/x"); ok("price fetch refuses non-allow-listed hosts", False)
except ValueError: ok("price fetch refuses non-allow-listed hosts", True)
try: A._get_json("http://api.exchange.coinbase.com/products/BTC-USD/ticker"); ok("price fetch refuses plain http", False)
except ValueError: ok("price fetch refuses plain http", True)
for u in ("https://evil.example/api/webhooks/1/x", "http://discord.com/api/webhooks/1/x", "https://api.telegram.org.evil.example/bot1/sendMessage"):
    try: A._post(u, {}); ok("notification refuses " + u[:40], False)
    except ValueError: ok("notification refuses " + u[:40], True)
calls = []
A.fetch = lambda s: 5000.0
A._post = lambda url, payload: calls.append((url, payload)) or 200
A.send = A._send  # real sender, fake transport
A.set_cfg({"tgToken": TOK, "tgChat": "123456", "discord": HOOK})
A.set_alerts([{"id": "d1", "sym": "BTC-USD", "dir": "above", "price": 10}])
A.tick()
ok("sends to Telegram and Discord with no mass mentions", len(calls) == 2 and calls[0][0].startswith("https://api.telegram.org/bot") and calls[1][0] == HOOK and calls[1][1]["allowed_mentions"] == {"parse": []}, calls)

# redirects: notification + local-model openers refuse them; a local server that redirects proves it end to end
class Redir(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self): self.send_response(302); self.send_header("Location", "http://127.0.0.1:1/secret"); self.end_headers()
    do_POST = do_GET
rs = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Redir); threading.Thread(target=rs.serve_forever, daemon=True).start()
try:
    serve.LOCAL_OPENER.open("http://127.0.0.1:%d/x" % rs.server_address[1], timeout=5); ok("no-redirect opener refuses redirects", False)
except urllib.error.HTTPError as e:
    ok("no-redirect opener refuses redirects", "not followed" in str(e.reason))
ok("notification opener uses the same no-redirect rule", any(isinstance(h, serve.NoRedirect) for h in serve.NOTIFY_OPENER.handlers))
rs.shutdown()

# ───────── HTTP surface (real server process) ─────────
def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p
PORT = free_port()
env = dict(os.environ, EXTERM_DATA=str(tmp / "srv"))
proc = subprocess.Popen([sys.executable, str(HERE / "serve.py"), str(PORT), "--no-browser"], cwd=str(HERE), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
BASE = "http://127.0.0.1:%d" % PORT
page = urllib.request.urlopen(BASE + "/").read().decode()
import re
TOKEN = re.search(r'name="nt-token" content="([^"]+)"', page).group(1)

def req(path, method="GET", body=None, headers=None, token=True):
    h = {"Content-Type": "application/json"}
    if token: h["X-ExTerm"] = TOKEN
    h.update(headers or {})
    data = body if isinstance(body, (bytes, type(None))) else json.dumps(body).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE + path, data=data, headers=h, method=method), timeout=10) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

ok("/api/caps needs the session token", req("/api/caps", token=False)[0] == 403)
st, body = req("/api/caps"); caps = json.loads(body)
ok("/api/caps reports features", st == 200 and caps["version"] in ("12.0", "13.0", "14.0", "15.0") and caps["alerts"] is True)
ok("foreign Origin blocked on /api", req("/api/alerts", headers={"Origin": "https://evil.example"})[0] == 403)
ok("DNS-rebinding Host blocked on /api", req("/api/alerts", headers={"Host": "evil.example:%d" % PORT})[0] == 421)
ok("/api/alerts POST needs JSON content type", req("/api/alerts", "POST", b'{"alerts":[]}', headers={"Content-Type": "text/plain"})[0] == 400)
ok("/api/alerts POST rejects huge bodies", req("/api/alerts", "POST", b"{" + b" " * 70000 + b"}")[0] == 400)
st, body = req("/api/alerts", "POST", {"alerts": [{"id": "w1", "sym": "ETH-USD", "dir": "below", "price": 10}, {"id": "w2", "sym": "<x>", "dir": "above", "price": 1}]})
ok("/api/alerts stores only valid alerts", st == 200 and json.loads(body)["count"] == 1)
st, body = req("/api/alerts/config", "POST", {"tgToken": TOK, "tgChat": "99999"})
ok("/api/alerts/config masks the token in its reply", st == 200 and TOK not in body.decode() and json.loads(body)["telegram"] is True)
ok("/api/alerts/config rejects a bad webhook", req("/api/alerts/config", "POST", {"discord": "https://evil.example/hook"})[0] == 400)
ok("unknown /api route → 404", req("/api/../../etc/passwd")[0] in (404, 403))
saved = (tmp / "srv" / "alerts.json")
ok("server writes the alerts file owner-only", saved.exists() and (os.name == "nt" or stat.S_IMODE(os.stat(saved).st_mode) == 0o600))

# Ollama bridge: off → clean 502; fake Ollama → JSON passes through; only 3 paths allowed
ok("/ollama needs the session token", req("/ollama/api/tags", token=False)[0] == 403)
ok("/ollama path allow-list", all(req(p)[0] == 404 for p in ("/ollama/api/pull", "/ollama/api/delete", "/ollama/../proxy", "/ollama/v1/chat/completions/../../api/pull")))
st, body = req("/ollama/api/tags")
ollama_was_free = st == 502
ok("Ollama not running → 502 with a helpful message (or a real local Ollama answers)", (st == 502 and b"Ollama" in body) or (st == 200 and b"models" in body), (st, body[:80]))
if ollama_was_free:
    seen = []
    class FakeOllama(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a): pass
        def _out(self, obj):
            b = json.dumps(obj).encode(); self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
        def do_GET(self): seen.append(("GET", self.path)); self._out({"models": [{"name": "llama3.1:8b"}, {"name": "qwen2.5:7b"}]})
        def do_POST(self):
            n = int(self.headers.get("Content-Length") or 0); body = json.loads(self.rfile.read(n)); seen.append(("POST", self.path, body.get("model")))
            self._out({"choices": [{"message": {"content": "Hello from the local model"}}]})
    fo = http.server.ThreadingHTTPServer(("127.0.0.1", 11434), FakeOllama)
    threading.Thread(target=fo.serve_forever, daemon=True).start(); time.sleep(0.3)
    st, body = req("/ollama/api/tags")
    ok("bridge lists local models", st == 200 and json.loads(body)["models"][0]["name"] == "llama3.1:8b")
    st, body = req("/ollama/v1/chat/completions", "POST", {"model": "llama3.1:8b", "messages": [{"role": "user", "content": "hi"}]})
    ok("bridge forwards chat to 127.0.0.1:11434", st == 200 and b"local model" in body and ("POST", "/v1/chat/completions", "llama3.1:8b") in seen, seen)
    ok("/api/caps detects Ollama", json.loads(req("/api/caps")[1])["ollama"] is True)
    ok("bridge rejects huge prompts", req("/ollama/v1/chat/completions", "POST", b"x" * (600 * 1024))[0] == 413)
    fo.shutdown()
else:
    ok("port 11434 busy: skipped fake-Ollama checks", True)

# regression: old routes still guarded
ok("/proxy still requires the token", req("/proxy?u=https://api.coingecko.com/", token=False)[0] == 403)
ok("/proxy still refuses non-allow-listed hosts", req("/proxy?u=https://evil.example/")[0] == 403)
ok("api.rugcheck.xyz is allow-listed for the safety scanner", serve.host_allowed("api.rugcheck.xyz") and not serve.host_allowed("rugcheck.xyz.evil.example"))
proc.terminate()

print("\n".join(res))
n = sum(r.startswith("PASS") for r in res)
print("%d/%d passed" % (n, len(res)))
sys.exit(0 if n == len(res) else 1)
