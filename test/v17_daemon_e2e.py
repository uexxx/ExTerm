# ExTerm v17.0 end-to-end: launch `serve.py --bot-daemon --headless` in a temp data folder, confirm the three supervised
# processes report heartbeats through /api/daemon, kill one and confirm the watchdog restarts it; then `--lan`: a phone
# without the pairing secret is refused, with it the page loads, and /pair.svg is served on the computer only.
import json, os, pathlib, re, signal, socket, subprocess, sys, tempfile, time, urllib.request, urllib.error
ROOT = pathlib.Path(__file__).resolve().parent.parent
res = []
def ok(n, c, i=""): res.append(("PASS " if c else "FAIL ") + n + ("" if c or not i else " - " + str(i)[:300]))
def free():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p
def get(port, path, hdr=None, host="127.0.0.1"):
    r = urllib.request.Request("http://%s:%d%s" % (host, port, path), headers=dict({"Host": "localhost:%d" % port}, **(hdr or {})))
    try:
        with urllib.request.urlopen(r, timeout=8) as x: return x.status, x.read()
    except urllib.error.HTTPError as e: return e.code, e.read()
def wait_up(port, t=25):
    t0 = time.time()
    while time.time() - t0 < t:
        try:
            if get(port, "/manifest.webmanifest")[0] == 200: return True
        except Exception: time.sleep(0.3)
    return False

data = tempfile.mkdtemp(); port = free(); env = dict(os.environ, EXTERM_DATA=data, PYTHONIOENCODING="utf-8")
args = [sys.executable, str(ROOT / "serve.py"), str(port), "--bot-daemon", "--headless", "--no-intel", "--no-update-check", "--no-leaderboards", "--no-llm-signal"]
pr = subprocess.Popen(args, cwd=str(ROOT), env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
try:
    ok("daemon launcher starts and serves the UI", wait_up(port))
    page = get(port, "/")[1].decode("utf-8", "replace"); tok = (re.search(r'name="nt-token" content="([^"]+)"', page) or [None, ""])[1]
    H = {"X-ExTerm": tok}
    st = {}; t0 = time.time()
    while time.time() - t0 < 40:
        code, body = get(port, "/api/daemon", H); st = json.loads(body or b"{}")
        if code == 200 and sum(1 for h in st.get("heartbeats", []) if h["ok"]) == 3 and all("starting" not in h["info"] for h in st["heartbeats"]): break
        time.sleep(1)
    procs = {h["proc"]: h for h in st.get("heartbeats", [])}
    ok("3 isolated processes (ingest · bots · dispatch) report heartbeats", set(procs) == {"ingest", "bots", "dispatch"} and all(h["ok"] for h in procs.values()), st.get("heartbeats"))
    pids = {h["pid"] for h in procs.values()}
    ok("each runs in its own OS process (not threads of the launcher)", len(pids) == 3 and pr.pid not in pids, pids)
    ok("Wake-Up digest + outbox + arming status exposed read-only", "digest" in st and st["armed"] is False and "summary" in st["digest"])
    code, body = get(port, "/api/daemon/arm", H)
    ok("arming is POST-only", code in (404, 405))
    req = urllib.request.Request("http://127.0.0.1:%d/api/daemon/arm" % port, data=json.dumps({"disclosure": True, "cashCap": 1000, "maxSlipBps": 20, "stopAck": True, "phrase": "arm"}).encode(), headers=dict(H, **{"Host": "localhost:%d" % port, "Content-Type": "application/json"}), method="POST")
    try: urllib.request.urlopen(req, timeout=8); bad = None
    except urllib.error.HTTPError as e: bad = (e.code, e.read().decode())
    ok("a wrong arming phrase is refused with the failing step named", bad is not None and bad[0] == 400 and "step 5" in bad[1], bad)
    # watchdog: kill the dispatcher
    victim = procs.get("dispatch", {}).get("pid")
    if victim:
        try: os.kill(victim, signal.SIGTERM)
        except OSError: pass
    t0 = time.time(); new = None
    while time.time() - t0 < 30:
        st2 = json.loads(get(port, "/api/daemon", H)[1] or b"{}")
        d = next((h for h in st2.get("heartbeats", []) if h["proc"] == "dispatch"), None)
        if d and d["pid"] != victim and d["ok"]: new = d; break
        time.sleep(1)
    ok("watchdog restarts a killed process with a new PID", new is not None and st2.get("restarts", {}).get("dispatch", 0) >= 1, st2.get("restarts"))
finally:
    pr.terminate()
    try: pr.wait(10)
    except Exception: pr.kill()

# --lan
data2 = tempfile.mkdtemp(); port2 = free()
pr2 = subprocess.Popen([sys.executable, str(ROOT / "serve.py"), str(port2), "--lan", "--headless", "--no-intel", "--no-update-check", "--no-leaderboards", "--no-bots", "--no-feed", "--no-alerts"],
                       cwd=str(ROOT), env=dict(os.environ, EXTERM_DATA=data2, PYTHONIOENCODING="utf-8", PYTHONUNBUFFERED="1"), stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
try:
    up = wait_up(port2); ok("--lan launcher starts", up)
    sys.path.insert(0, str(ROOT)); import exterm_ops as O
    ips = O.lan_ips()
    code, svg = get(port2, "/pair.svg")
    ok("/pair.svg (QR) is served on the computer itself", code == 200 and svg.startswith(b"<svg"))
    page = get(port2, "/")[1].decode("utf-8", "replace"); tok = (re.search(r'name="nt-token" content="([^"]+)"', page) or [None, ""])[1]
    code, body = get(port2, "/api/pair", {"X-ExTerm": tok}); pu = json.loads(body or b"{}").get("url", "")
    ok("/api/pair returns the pairing URL with a per-launch secret", code == 200 and "pair=" in pu and len(pu.split("pair=")[1]) >= 20, (code, pu[:40]))
    if ips:
        ip = ips[0]
        c1, _ = get(port2, "/", host=ip, hdr={"Host": "%s:%d" % (ip, port2)})
        c2, b2 = get(port2, "/?pair=" + pu.split("pair=")[1], host=ip, hdr={"Host": "%s:%d" % (ip, port2)})
        c3, _ = get(port2, "/pair.svg", host=ip, hdr={"Host": "%s:%d" % (ip, port2)})
        c4, _ = get(port2, "/", host=ip, hdr={"Host": "evil.example:%d" % port2})
        ok("LAN: no secret → 403; right secret → the app; QR never leaves the computer; foreign Host → 421", c1 == 403 and c2 == 200 and b"nt-token" in b2 and c3 == 404 and c4 == 421, (c1, c2, c3, c4))
    else:
        ok("LAN: no private interface on this machine (skipped)", True)
finally:
    pr2.terminate()
    try: out = pr2.communicate(timeout=10)[0].decode("utf-8", "replace")
    except Exception: pr2.kill(); out = ""
ok("--lan prints the pairing URL and a terminal QR code", "Phone pairing" in out and ("█" in out or "▀" in out or "can't draw" in out), out[-300:])
print("\n".join(res)); fl = sum(r.startswith("FAIL") for r in res); print(f"\n{len(res) - fl}/{len(res)} passed"); sys.exit(1 if fl else 0)
