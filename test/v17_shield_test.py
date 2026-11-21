# ExTerm v17.0 launcher test: upstream shield. A 429 must never crash _proxy (the old NameError on _EXTERM_LAST_GOOD),
# identical concurrent requests share ONE upstream call, 429 sets a per-host cooldown honouring Retry-After, and the
# last-good body is replayed with X-ExTerm-Cache: STALE. Uses a fake opener: no network.
import io, sys, pathlib, threading, time, urllib.error, email.message
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
sys.argv = ["serve.py", "8765", "--no-browser"]
import serve
res = []
def ok(n, c, i=""): res.append(("PASS " if c else "FAIL ") + n + ("" if c or not i else " - " + str(i)[:200]))

class Resp(io.BytesIO):
    def __init__(self, body, status=200):
        super().__init__(body); self.status = status; self.headers = email.message.Message(); self.headers["Content-Type"] = "application/json"
    def __enter__(self): return self
    def __exit__(self, *a): self.close()

class FakeOpener:
    def __init__(self): self.calls = 0; self.mode = "ok"; self.delay = 0.0; self.lock = threading.Lock()
    def open(self, req, timeout=30):
        with self.lock: self.calls += 1
        time.sleep(self.delay)
        if self.mode == "429":
            h = email.message.Message(); h["Retry-After"] = "7"
            raise urllib.error.HTTPError(req.full_url, 429, "Too Many Requests", h, io.BytesIO(b"slow down"))
        if self.mode == "404":
            raise urllib.error.HTTPError(req.full_url, 404, "Not Found", email.message.Message(), io.BytesIO(b'{"e":404}'))
        if self.mode == "net":
            raise OSError("connection reset")
        return Resp(b'{"price":1}')

ok("module-level shield state exists", all(isinstance(getattr(serve, n, None), dict) for n in ("_EXTERM_LAST_GOOD", "_EXTERM_INFLIGHT", "_EXTERM_HOST_COOLDOWN")))
ok("no undefined synth helper is referenced", "_exterm_synth_dex_ohlcv" not in pathlib.Path(serve.__file__).read_text(encoding="utf-8"))

fo = FakeOpener(); U = "https://api.dexscreener.com/latest/dex/search?q=SOL"
st, body, ct = serve.shield_fetch(U, opener=fo)
ok("200 OK passes through and is remembered as last-good", st == 200 and body == b'{"price":1}' and serve.shield_stale(U)[1] == body)

fo.calls = 0; fo.delay = 0.3; out = []
U2 = "https://api.dexscreener.com/x?q=coalesce"
ts = [threading.Thread(target=lambda: out.append(serve.shield_fetch(U2, opener=fo))) for _ in range(12)]
[t.start() for t in ts]; [t.join() for t in ts]
ok("12 identical concurrent GETs make exactly 1 upstream call", fo.calls == 1 and len(out) == 12, fo.calls)
fo.delay = 0.0

fo.calls = 0; fo.mode = "429"; got = None
try: serve.shield_fetch(U, opener=fo)
except serve.UpstreamBlocked as e: got = e
ok("429 raises UpstreamBlocked (no NameError) with Retry-After honoured", got is not None and got.status == 429 and got.retry_after >= 6.5, got and got.retry_after)
before = fo.calls
for _ in range(20):
    try: serve.shield_fetch(U, opener=fo)
    except serve.UpstreamBlocked: pass
ok("during cooldown no further upstream hits occur", fo.calls == before, fo.calls - before)
ok("stale copy is still available for fallback", serve.shield_stale(U) is not None)
for _ in range(10): serve._shield_strike("burst.example", None)
ok("a burst of parallel 429s inside one window is ONE strike (backoff doesn't explode to minutes)", serve._EXTERM_HOST_COOLDOWN["burst.example"]["n"] == 1 and serve._shield_cooldown_left("burst.example") <= 2.01)

fo.mode = "404"; got = None
try: serve.shield_fetch("https://api.coingecko.com/x", opener=fo)
except urllib.error.HTTPError as e: got = e
ok("non-429 upstream errors pass through with their body and no cooldown", got is not None and got.code == 404 and got.exterm_body == b'{"e":404}' and serve._shield_cooldown_left("api.coingecko.com") == 0)

fo.mode = "net"; got = None
try: serve.shield_fetch("https://api.kraken.com/x", opener=fo)
except serve.UpstreamBlocked as e: got = e
ok("network errors become a short backoff, not a traceback", got is not None and got.status == 502 and 0 < got.retry_after <= 60)

cred_url = "https://api.binance.com/private"; fo.mode = "ok"
serve.shield_fetch(cred_url, hdr={"X-MBX-APIKEY": "k"}, opener=fo)
ok("credentialed responses are never cached", serve.shield_stale(cred_url) is None)
serve.shield_fetch("https://api.binance.com/post", method="POST", data=b"{}", opener=fo)
ok("POST responses are never cached", serve.shield_stale("https://api.binance.com/post") is None)

# End-to-end through the HTTP handler: live 429 -> STALE replay, never a dropped socket.
import http.server, urllib.request, json
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), serve.H); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
def hit(u):
    r = urllib.request.Request("http://127.0.0.1:%d/proxy?u=%s" % (port, urllib.parse.quote(u, safe="")), headers={"X-ExTerm": serve.TOKEN, "Host": "127.0.0.1"})
    try:
        with urllib.request.urlopen(r, timeout=5) as x: return x.status, x.headers.get("X-ExTerm-Cache"), x.read()
    except urllib.error.HTTPError as e: return e.code, e.headers.get("X-ExTerm-Cache"), e.read()
st, cache, b = hit(U)  # U is cooling down and has a last-good copy
ok("handler serves the last-good copy with X-ExTerm-Cache: STALE during a 429 cooldown", st == 200 and cache == "STALE" and b == b'{"price":1}', (st, cache, b[:60]))
serve._EXTERM_HOST_COOLDOWN["api.dexscreener.com"]["until"] = time.time() + 30
st, cache, b = hit("https://api.dexscreener.com/never-seen")
j = json.loads(b or b"{}")
ok("without a cached copy the handler returns clean JSON 429 + Retry-After", st == 429 and cache == "MISS" and j.get("rateLimited") is True and j.get("retryAfter", 0) >= 1, (st, b[:120]))
srv.shutdown()
print("\n".join(res)); fl = sum(r.startswith("FAIL") for r in res); print(f"\n{len(res) - fl}/{len(res)} passed"); sys.exit(1 if fl else 0)
