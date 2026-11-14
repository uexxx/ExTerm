#!/usr/bin/env python3
"""v15 phase 2 launcher tests: the System Doctor (`python serve.py --doctor`, GET /api/doctor): row shape, app checksum,
data-folder check, faked network + update rows, the CLI exit code, and the endpoint's session-token gate. No external
network: fetches are faked and the HTTP server runs with --offline."""
import hashlib, json, os, pathlib, re, socket, subprocess, sys, tempfile, time, urllib.request, urllib.error

HERE = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
sys.argv = [sys.argv[0]]
import serve  # noqa: E402

res = []
def ok(name, cond, info=""):
    res.append(("PASS " if cond else "FAIL ") + name + (" -- " + str(info)[:300] if info and not cond else ""))
def row(rows, name): return next((r for r in rows if r["name"].startswith(name)), None)

# ───────── doctor() with a faked network ─────────
seen = []
def fake(url):
    seen.append(url)
    if "dexscreener" in url: raise urllib.error.HTTPError(url, 429, "slow down", None, None)
    if "github" in url: return {"tag_name": "v99.0", "html_url": "https://github.com/%s/releases/tag/v99.0" % serve.UPDATE_REPO, "body": "notes"}
    return {"ok": True}
serve._upd.update(ts=0, data=None)
rows = serve.doctor(net=True, fetch=fake)
ok("every row has a name, a tri-state ok and a short detail", rows and all(set(r) == {"name", "ok", "detail"} and r["ok"] in (True, False, None) and len(r["detail"]) <= 300 for r in rows), rows[:3])
ok("python, version, app file and data folder are checked", all(row(rows, n) for n in ("Python", "ExTerm version", "App file", "Data folder")))
ok("network checks hit only the fixed data sources", {u.split("/")[2] for u in seen} <= {"api.exchange.coinbase.com", "query1.finance.yahoo.com", "api.dexscreener.com", "api.github.com"}, seen)
ok("a reachable source passes", row(rows, "Coinbase")["ok"] is True)
ok("a rate-limited source is a warning, not a failure", row(rows, "DexScreener")["ok"] is None and "429" in row(rows, "DexScreener")["detail"])
ok("a newer release is reported with its GitHub link", row(rows, "Update check")["ok"] is None and "99.0" in row(rows, "Update check")["detail"])
serve._upd.update(ts=0, data=None)
off = serve.doctor(net=False)
ok("offline mode makes no network rows", not row(off, "Coinbase") and not row(off, "Update check"))

# ───────── checksum + data folder ─────────
t = pathlib.Path(tempfile.mkdtemp()); app = t / "exterm.html"; app.write_bytes(b"<html>ok</html>")
old_app, old_data = serve.APP, serve.DATA_DIR
try:
    serve.APP = app
    (t / "SHA256SUMS.txt").write_text(hashlib.sha256(b"<html>ok</html>").hexdigest() + "  exterm.html\n")
    ok("a matching checksum passes", row(serve.doctor(net=False), "App file checksum")["ok"] is True)
    (t / "SHA256SUMS.txt").write_text(hashlib.sha256(b"<html>ok</html>").hexdigest() + " *exterm.html\n")
    ok("binary-mode sha256sum lines (hash *name) are understood", row(serve.doctor(net=False), "App file checksum")["ok"] is True)
    app.write_bytes(b"<html>tampered</html>")
    r = row(serve.doctor(net=False), "App file checksum"); ok("a tampered app file fails the checksum", r["ok"] is False and "does not match" in r["detail"], r)
    (t / "SHA256SUMS.txt").write_text("deadbeef  other.html\n")
    ok("an unlisted file is a warning", row(serve.doctor(net=False), "App file checksum")["ok"] is None)
    serve.APP = t / "missing.html"
    ok("a missing app file fails", row(serve.doctor(net=False), "App file")["ok"] is False)
    blocker = t / "not-a-dir"; blocker.write_text("x"); serve.DATA_DIR = blocker / "sub"
    ok("an unwritable data folder fails", row(serve.doctor(net=False), "Data folder")["ok"] is False)
finally:
    serve.APP, serve.DATA_DIR = old_app, old_data

# ───────── CLI ─────────
data = tempfile.mkdtemp()
p = subprocess.run([sys.executable, str(HERE / "serve.py"), "--doctor", "--offline"], cwd=str(HERE), env=dict(os.environ, EXTERM_DATA=data), capture_output=True, text=True, timeout=60)
ok("python serve.py --doctor --offline prints a report and exits", "ExTerm System Doctor" in p.stdout and "[ ok ]" in p.stdout and p.returncode in (0, 1), p.stdout[-400:] + p.stderr[-300:])
ok("the CLI exit code is 0 when nothing failed", (p.returncode == 0) == ("[FAIL]" not in p.stdout), p.stdout[-400:])
ok("the CLI never starts the server", "running at" not in p.stdout)

# ───────── GET /api/doctor ─────────
def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); n = s.getsockname()[1]; s.close(); return n
PORT = free_port(); BASE = "http://127.0.0.1:%d" % PORT
proc = subprocess.Popen([sys.executable, str(HERE / "serve.py"), str(PORT), "--no-browser", "--no-bots", "--no-alerts", "--no-feed", "--no-update-check", "--offline"], cwd=str(HERE), env=dict(os.environ, EXTERM_DATA=data), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
def req(path, headers):
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE + path, headers=headers), timeout=15) as r: return r.status, r.read()
    except urllib.error.HTTPError as e: return e.code, e.read()
try:
    for _ in range(80):
        try: urllib.request.urlopen(BASE + "/", timeout=1); break
        except Exception: time.sleep(0.15)
    TOKEN = re.search(r'name="nt-token" content="([^"]+)"', urllib.request.urlopen(BASE + "/").read().decode()).group(1)
    ok("/api/doctor needs the session token", req("/api/doctor", {})[0] == 403 and req("/api/doctor", {"X-ExTerm": "wrong"})[0] == 403)
    ok("/api/doctor refuses a cross-site Origin", req("/api/doctor", {"X-ExTerm": TOKEN, "Origin": "https://evil.example"})[0] == 403)
    st, body = req("/api/doctor", {"X-ExTerm": TOKEN}); j = json.loads(body)
    ok("/api/doctor returns the checks as JSON", st == 200 and isinstance(j.get("checks"), list) and row(j["checks"], "Python") and not row(j["checks"], "Coinbase"), body[:300])
    st2, body2 = req("/api/doctor", {"X-ExTerm": TOKEN}); ok("repeat calls are served from a short cache", st2 == 200 and body2 == body)
    page = urllib.request.urlopen(BASE + "/").read().decode()
    ok("the served page ships the phase 2 code under the pinned CSP", "ChartTrade" in page and "script-src 'sha256-" in page and "default-src 'none'" in page)
finally:
    proc.terminate(); proc.wait(5)

print("\n".join(res))
n = sum(r.startswith("PASS") for r in res)
print("%d/%d passed" % (n, len(res)))
sys.exit(0 if n == len(res) else 1)
