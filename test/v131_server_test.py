#!/usr/bin/env python3
"""v13.1 launcher tests: saving the terminal to this computer (/api/state, /api/journal). Unit tests of StateStore
(validation, secret stripping, journal merge/delete/clear/cap, file permissions, daily backup, corrupt file) and the
HTTP surface (token, Host / Origin checks, size limit, round trip, restart persistence)."""
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

tmp = pathlib.Path(tempfile.mkdtemp())
S = serve.StateStore(tmp / "state.json")
main = json.dumps({"settings": {"theme": "nova", "stKey": "SECRET-ST", "heliusKey": "SECRET-H"}, "ai": {"key": "sk-SECRET", "model": "x"}, "watch": ["BTC-USD"]})
E = lambda i, **k: dict({"id": "j_t%d" % i, "ts": 1700000000000 + i, "sym": "BTC-USD", "side": "buy", "price": 100.0 + i, "usd": 50, "qty": 0.5, "pnl": None, "notes": "n%d" % i, "tags": ["plan"], "mood": "calm", "snap": "data:image/jpeg;base64,AAAA"}, **k)
r = S.apply({"full": True, "keys": {"novaterm.v1": main, "nt.layouts": "[1,2]", "nt.gtCool": "999", "novaterm.builder": "{}"}, "journal": [E(1), E(2)], "savedAt": 1234})
st = S.public()
ok("keys saved", set(st["keys"]) == {"novaterm.v1", "nt.layouts", "novaterm.builder"}, st["keys"].keys())
ok("rate-limit cool-down key is not persisted", "nt.gtCool" not in st["keys"])
saved = json.loads(st["keys"]["novaterm.v1"])
ok("API keys are blanked in the saved state", "SECRET" not in st["keys"]["novaterm.v1"] and saved["settings"]["stKey"] == "" and saved["ai"]["key"] == "", st["keys"]["novaterm.v1"])
ok("non-secret settings survive", saved["settings"]["theme"] == "nova" and saved["ai"]["model"] == "x" and saved["watch"] == ["BTC-USD"])
ok("journal saved without chart snapshots", len(st["journal"]) == 2 and all("snap" not in e for e in st["journal"]))
ok("journal newest first", st["journal"][0]["id"] == "j_t2")
ok("savedAt kept", st["savedAt"] == 1234 and r["journal"] == 2 and r["keys"] == 3)
fm = stat.S_IMODE(os.stat(tmp / "state.json").st_mode)
ok("state file is private (0600)", os.name == "nt" or fm == 0o600, oct(fm))
ok("summary never reveals the full home path", "/home" not in json.dumps(S.summary()) and "Users" not in json.dumps(S.summary()))

# incremental: changed keys merge, removed keys go, other keys stay
S.apply({"keys": {"nt.layouts": "[3]"}, "removed": ["novaterm.builder"], "journal": [E(2, notes="edited")], "journalDel": ["j_t1"], "savedAt": 2000})
st = S.public()
ok("incremental update merges", st["keys"]["nt.layouts"] == "[3]" and "novaterm.v1" in st["keys"] and "novaterm.builder" not in st["keys"])
ok("journal edit + delete applied", [e["id"] for e in st["journal"]] == ["j_t2"] and st["journal"][0]["notes"] == "edited")
S.apply({"full": True, "keys": {"novaterm.v1": "{}"}, "savedAt": 3000})
ok("full save mirrors the page (drops keys the page no longer has)", list(S.public()["keys"]) == ["novaterm.v1"])
ok("full save keeps the journal log", len(S.public()["journal"]) == 1)
S.apply({"journalClear": True, "journal": [E(9)]})
ok("journal clear, then new entries", [e["id"] for e in S.public()["journal"]] == ["j_t9"])

# validation
bad = [
    {"keys": {"evil": "x"}}, {"keys": {"../../etc/passwd": "x"}}, {"keys": {"nt.a": 5}}, {"keys": {"nt.a": {"x": 1}}}, {"keys": ["nt.a"]},
    {"removed": "nt.a"}, {"journal": {"id": "j_1"}}, {"journalDel": "j_1"}, {"keys": {"nt." + "a" * 80: "x"}},
    {"keys": {"nt.big": "x" * (serve.StateStore.MAX_CHARS + 10)}}, {"full": True, "keys": {"nt.k%d" % i: "1" for i in range(serve.StateStore.MAX_KEYS + 1)}},
]
ok("rejects bad saves (%d cases)" % len(bad), all(raises(lambda b=b: S.apply(b)) for b in bad), [i for i, b in enumerate(bad) if not raises(lambda b=b: S.apply(b))])
ok("a rejected save changes nothing", [e["id"] for e in S.public()["journal"]] == ["j_t9"] and list(S.public()["keys"]) == ["novaterm.v1"])
junk = [{"id": "x1", "ts": 1, "sym": "A"}, {"id": "j_../x", "ts": 1, "sym": "A"}, {"id": "j_ok1", "sym": "A"}, {"id": "j_ok2", "ts": 1, "sym": 5}, "str", None,
        {"id": "j_ok3", "ts": 1, "sym": "A", "notes": "x" * 20000}, {"id": "j_ok4", "ts": True, "sym": "A"}]
S.apply({"journal": junk})
ok("malformed journal entries are skipped", [e["id"] for e in S.public()["journal"]] == ["j_t9", "j_ok3"] or [e["id"] for e in S.public()["journal"]] == ["j_t9"], [e["id"] for e in S.public()["journal"]])
e3 = [e for e in S.public()["journal"] if e["id"] == "j_ok3"]
ok("long notes are truncated", not e3 or len(e3[0]["notes"]) <= 2000)
S.apply({"journal": [E(5, plan={"sl": 1, "tp": "x", "evil": 3}, extra="<script>", tags=["a", 1, "b" * 50])]})
e5 = [e for e in S.public()["journal"] if e["id"] == "j_t5"][0]
ok("unknown fields dropped, plan/tags cleaned", "extra" not in e5 and e5["plan"] == {"sl": 1} and e5["tags"] == ["a", "b" * 20], e5)
ok("future savedAt is clamped", S.apply({"savedAt": 10 ** 15})["savedAt"] <= time.time() * 1000 + 86400001)

# cap: oldest roll off only past MAX_JOURNAL
S2 = serve.StateStore(tmp / "cap.json"); S2.MAX_JOURNAL = 50
S2.apply({"journal": [E(i) for i in range(40)]}); S2.apply({"journal": [E(i) for i in range(40, 80)]})
ids = {e["id"] for e in S2.public(True)["journal"]}
ok("journal keeps the newest entries at the cap", len(ids) == 50 and "j_t79" in ids and "j_t0" not in ids)
S2.SEND_JOURNAL = 10
ok("page gets the newest slice, export gets all", len(S2.public()["journal"]) == 10 and len(S2.public(True)["journal"]) == 50 and S2.public()["journalTotal"] == 50)

# persistence, corrupt file, backup
S3 = serve.StateStore(tmp / "state.json")
ok("reloads from disk", "novaterm.v1" in S3.public()["keys"] and any(e["id"] == "j_t9" for e in S3.public()["journal"]))
ok("one dated backup per day", len(list((tmp / "state-backups").glob("state-*.json"))) == 1)
(tmp / "bad.json").write_text("{not json")
ok("corrupt file starts empty instead of crashing", serve.StateStore(tmp / "bad.json").public()["keys"] == {})
(tmp / "hostile.json").write_text(json.dumps({"keys": {"evil": "x", "nt.ok": "y", "nt.n": 5}, "journal": [{"id": "bad"}, E(1)], "savedAt": "x"}))
try:
    H = serve.StateStore(tmp / "hostile.json").public(); hostile_ok = list(H["keys"]) == ["nt.ok"] and len(H["journal"]) == 1
except Exception as ex:
    hostile_ok = False
ok("a hand-edited file is re-validated on load", hostile_ok)

# ───────── HTTP surface ─────────
def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p
PORT = free_port()
env = dict(os.environ, EXTERM_DATA=str(tmp / "srv"))
def start():
    p = subprocess.Popen([sys.executable, str(HERE / "serve.py"), str(PORT), "--no-browser"], cwd=str(HERE), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(40):
        try: urllib.request.urlopen("http://127.0.0.1:%d/" % PORT, timeout=1); break
        except Exception: time.sleep(0.15)
    return p
proc = start()
BASE = "http://127.0.0.1:%d" % PORT
TOKEN = re.search(r'name="nt-token" content="([^"]+)"', urllib.request.urlopen(BASE + "/").read().decode()).group(1)
def req(path, method="GET", body=None, headers=None, token=True):
    h = {"Content-Type": "application/json"}
    if token: h["X-ExTerm"] = TOKEN
    h.update(headers or {})
    data = body if isinstance(body, (bytes, type(None))) else json.dumps(body).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE + path, data=data, headers=h, method=method), timeout=15) as r:
            return r.status, r.read(), r.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read(), e.headers
st, body, _ = req("/api/caps")
ok("caps report state saving", st == 200 and json.loads(body).get("state") is True, body)
ok("GET /api/state needs the token", req("/api/state", token=False)[0] == 403)
ok("POST /api/state needs the token", req("/api/state", "POST", {"keys": {"nt.a": "1"}}, token=False)[0] == 403)
ok("journal export needs the token", req("/api/journal", token=False)[0] == 403)
ok("wrong token refused", req("/api/state", headers={"X-ExTerm": "nope"})[0] == 403)
ok("cross-site Origin refused", req("/api/state", headers={"Origin": "https://evil.example"})[0] == 403)
ok("DNS-rebinding Host refused", req("/api/state", headers={"Host": "evil.example:%d" % PORT})[0] == 421)
ok("non-JSON body refused", req("/api/state", "POST", b"keys=1", headers={"Content-Type": "text/plain"})[0] == 400)
ok("JSON array body refused", req("/api/state", "POST", b"[1]")[0] == 400)
ok("bad key refused over HTTP", req("/api/state", "POST", {"keys": {"evil": "1"}})[0] == 400)
big = b'{"keys":{"nt.big":"' + b"x" * (21 * 1024 * 1024) + b'"}}'
try: big_st = req("/api/state", "POST", big)[0]
except Exception: big_st = 413  # server may close the connection while we are still sending
ok("over-size save refused", big_st in (400, 413), big_st)
st0, body0, _ = req("/api/state")
ok("empty store at first", st0 == 200 and json.loads(body0)["keys"] == {}, body0)
st, body, _ = req("/api/state", "POST", {"full": True, "keys": {"novaterm.v1": main, "nt.ws": "[]"}, "journal": [E(1), E(2)], "savedAt": 5555})
ok("save over HTTP", st == 200 and json.loads(body)["ok"] is True and json.loads(body)["journal"] == 2, body)
ok("state file written privately", (tmp / "srv" / "state.json").exists() and (os.name == "nt" or stat.S_IMODE(os.stat(tmp / "srv" / "state.json").st_mode) == 0o600))
ok("no API key reached the disk", "SECRET" not in (tmp / "srv" / "state.json").read_text())
proc.terminate(); proc.wait(5)
proc = start()  # new launch = new token, same data folder
TOKEN = re.search(r'name="nt-token" content="([^"]+)"', urllib.request.urlopen(BASE + "/").read().decode()).group(1)
st, body, _ = req("/api/state")
j = json.loads(body)
ok("survives a launcher restart", st == 200 and j["savedAt"] == 5555 and "nt.ws" in j["keys"] and len(j["journal"]) == 2, body[:200])
st, body, _ = req("/api/journal")
ok("journal export returns every entry", st == 200 and len(json.loads(body)) == 2)
ok("summary endpoint", json.loads(req("/api/state/summary")[1])["journal"] == 2)
ok("unknown state route is 404", req("/api/state/../../etc")[0] in (404, 400))
proc.terminate(); proc.wait(5)
# --no-state turns it off
p2 = subprocess.Popen([sys.executable, str(HERE / "serve.py"), str(PORT), "--no-browser", "--no-state"], cwd=str(HERE), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(40):
    try: urllib.request.urlopen(BASE + "/", timeout=1); break
    except Exception: time.sleep(0.15)
TOKEN = re.search(r'name="nt-token" content="([^"]+)"', urllib.request.urlopen(BASE + "/").read().decode()).group(1)
ok("--no-state turns saving off (503)", req("/api/state")[0] == 503)
p2.terminate()

print("\n".join(res))
n = sum(r.startswith("PASS") for r in res)
print("%d/%d passed" % (n, len(res)))
sys.exit(0 if n == len(res) else 1)
