#!/usr/bin/env python3
"""v14 launcher tests: the GitHub update check (parsing, version compare, URL and notes validation, caching, errors)
and its HTTP surface (token, --no-update-check, caps)."""
import json, os, pathlib, re, socket, subprocess, sys, tempfile, time, urllib.request, urllib.error

HERE = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
sys.argv = [sys.argv[0]]
import serve  # noqa: E402

res = []
def ok(name, cond, info=""):
    res.append(("PASS " if cond else "FAIL ") + name + (" — " + str(info)[:300] if info and not cond else ""))
REL = "https://github.com/%s/releases/tag/" % serve.UPDATE_REPO
def fresh(rel, now=None):
    serve._upd.update(ts=0, data=None); seen = []
    def fetch(url): seen.append(url); return rel() if callable(rel) else rel
    return serve.update_info(fetch=fetch, now=now or time.time()), seen

ok("version is 15.x or later", re.match(r"^1[5-9]\.\d+$", serve.VERSION) is not None)
r, seen = fresh({"tag_name": "v16.9", "html_url": REL + "v16.9", "body": "Faster radar\n\n- fixes"})
ok("a newer release is reported", r["newer"] is True and r["latest"] == "16.9" and r["current"] == serve.VERSION and r["url"] == REL + "v16.9", r)
ok("it asks only the fixed GitHub API URL", seen == ["https://api.github.com/repos/%s/releases/latest" % serve.UPDATE_REPO], seen)
ok("notes are flattened to one plain line", r["notes"] == "Faster radar - fixes", r["notes"])
r, _ = fresh({"tag_name": "13.9", "html_url": REL + "13.9"}); ok("an older release is not newer", r["newer"] is False and r["latest"] == "13.9")
r, _ = fresh({"tag_name": "v" + serve.VERSION, "html_url": REL + "v" + serve.VERSION}); ok("the same version is not newer", r["newer"] is False)
r, _ = fresh({"tag_name": "v16.10", "html_url": REL + "v16.10"}); ok("16.10 counts as newer than 16.0 (numeric, not text)", r["newer"] is True)
for bad_url in ["https://evil.example/releases/x", "javascript:alert(1)", "https://github.com/someone-else/exterm/releases/x", "http://github.com/%s/releases/x" % serve.UPDATE_REPO]:
    r, _ = fresh({"tag_name": "v99", "html_url": bad_url})
    ok("a release link off the project's GitHub is rejected (%s)" % bad_url[:30], r["newer"] is False and r["url"] is None)
for tag in ["<script>", "latest", "", None, "v1.2.3.4.5"]:
    r, _ = fresh({"tag_name": tag, "html_url": REL + "x"})
    ok("a junk tag is ignored (%r)" % (tag,), r["newer"] is False and r["latest"] is None)
r, _ = fresh({"tag_name": "v15", "html_url": REL + "v15", "body": "a‮b\x07c" + "x" * 5000})
ok("bidi/control characters stripped, notes capped at 600", "‮" not in r["notes"] and "\x07" not in r["notes"] and len(r["notes"]) == 600, len(r["notes"]))
r, _ = fresh(lambda: (_ for _ in ()).throw(OSError("network down")))
ok("network errors become a quiet result, not a crash", r["newer"] is False and "network down" in r.get("error", ""), r)
r, _ = fresh("not json at all"); ok("a malformed reply is handled", r["newer"] is False)
r1, s1 = fresh({"tag_name": "v14.3", "html_url": REL + "v14.3"}, now=1000.0)
r2 = serve.update_info(fetch=lambda u: (_ for _ in ()).throw(AssertionError("should be cached")), now=1000.0 + 3600)
ok("results are cached for 6 hours", r2["latest"] == "14.3")
r3 = serve.update_info(fetch=lambda u: {"tag_name": "v14.4", "html_url": REL + "v14.4"}, now=1000.0 + 7 * 3600)
ok("…then refreshed", r3["latest"] == "14.4")

# ───────── HTTP ─────────
def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p
PORT = free_port(); tmp = pathlib.Path(tempfile.mkdtemp())
def start(*extra):
    p = subprocess.Popen([sys.executable, str(HERE / "serve.py"), str(PORT), "--no-browser", "--no-bots", "--no-alerts", *extra], cwd=str(HERE), env=dict(os.environ, EXTERM_DATA=str(tmp)), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(40):
        try: urllib.request.urlopen("http://127.0.0.1:%d/" % PORT, timeout=1); break
        except Exception: time.sleep(0.15)
    return p
BASE = "http://127.0.0.1:%d" % PORT
def req(path, token):
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE + path, headers={"X-ExTerm": token} if token else {}), timeout=20) as r: return r.status, r.read()
    except urllib.error.HTTPError as e: return e.code, e.read()
proc = start(); TOKEN = re.search(r'name="nt-token" content="([^"]+)"', urllib.request.urlopen(BASE + "/").read().decode()).group(1)
st, body = req("/api/caps", TOKEN); caps = json.loads(body)
ok("caps report v15 and the update check", caps["version"] == serve.VERSION and caps["update"] is True and caps["state"] is True, caps)
ok("/api/update needs the session token", req("/api/update", None)[0] == 403 and req("/api/update", "wrong")[0] == 403)
st, body = req("/api/update", TOKEN); j = json.loads(body)
ok("/api/update answers with the current version (offline here: nothing newer)", st == 200 and j["current"] == serve.VERSION and j["newer"] is False, body[:200])
def post(path):
    try: return urllib.request.urlopen(urllib.request.Request(BASE + path, data=b"{}", method="POST", headers={"X-ExTerm": TOKEN, "Content-Type": "application/json"}), timeout=10).status
    except urllib.error.HTTPError as e: return e.code
ok("POST /api/update is not a route", post("/api/update") == 404)
proc.terminate(); proc.wait(5)
proc = start("--no-update-check"); TOKEN = re.search(r'name="nt-token" content="([^"]+)"', urllib.request.urlopen(BASE + "/").read().decode()).group(1)
ok("--no-update-check turns it off", req("/api/update", TOKEN)[0] == 503 and json.loads(req("/api/caps", TOKEN)[1])["update"] is False)
proc.terminate()

print("\n".join(res))
n = sum(r.startswith("PASS") for r in res)
print("%d/%d passed" % (n, len(res)))
sys.exit(0 if n == len(res) else 1)
