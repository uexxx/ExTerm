# ExTerm v17.5 launcher test: the 4 dedicated execution lanes. Pure job maths (OHLC, wash entropy, Bellman-Ford arb, Merton
# percentiles, book shock, Kelly), allow-list + argument caps, real process isolation (each lane's jobs run in a different PID
# from this process and from each other), a heavy quant job does not block the ingest lane, thread fallback, and the HTTP
# endpoints (token-gated) against a live serve.py. No network.
import json, os, pathlib, subprocess, sys, tempfile, threading, time, urllib.request, re
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.argv = ["serve.py", "8765", "--no-browser"]
import serve
res = []
def ok(n, c, i=""): res.append(("PASS " if c else "FAIL ") + n + ("" if c or not i else " - " + str(i)[:300]))

def main():
    # pure jobs
    b = serve._lane_ohlc([[0, 10, 1], [400, 12, 2], [900, 9, 1], [1000, 11, 5], [1999, 13, 1]], 1000)["bars"]
    ok("ingest: ticks -> OHLCV bars", b == [[0, 10, 12, 9, 9, 4.0], [1000, 11, 13, 11, 13, 6.0]], b)
    w1 = serve._lane_entropy([["A", "B"] if i % 2 else ["B", "A"] for i in range(50)])["score"]; w2 = serve._lane_entropy([["w%d" % i, "x%d" % (i * 7)] for i in range(50)])["score"]
    ok("forensics: wash score high for a ping-pong pair, ~0 for distinct wallets", w1 >= 90 and w2 <= 5, (w1, w2))
    bf = serve._lane_bellman(["USD", "EUR", "GBP"], [["USD", "EUR", 0.9], ["EUR", "GBP", 0.9], ["GBP", "USD", 1.3]])
    ok("forensics: Bellman-Ford finds the triangular arb (0.9 x 0.9 x 1.3 = 1.053)", bf["arb"] and abs(bf["profit"] - 0.053) < 1e-9 and bf["cycle"][0] == bf["cycle"][-1], bf)
    ok("forensics: no arb when the cycle loses", not serve._lane_bellman(["A", "B"], [["A", "B", 0.5], ["B", "A", 1.9]])["arb"])
    m0 = serve._lane_merton(100, 0.1, 0.05, 0, 0, 0.01, 1.0, 50, 400, 7)
    ok("quant: Merton (lambda = 0) median within 1 % of S0*exp((mu - s^2/2)T)", abs(m0["p50"] - 100 * __import__("math").exp(0.1 - 0.00125)) < 1.1 and m0["p10"] < m0["p50"] < m0["p90"], m0)
    ok("quant: Merton is seeded / deterministic", serve._lane_merton(100, 0.05, 0.6, 3, -0.04, 0.08, 0.08, 30, 60, 3) == serve._lane_merton(100, 0.05, 0.6, 3, -0.04, 0.08, 0.08, 30, 60, 3))
    s1 = serve._lane_shock(100, 40, 4, 500000, 100000, 1, 0, 1, "sell"); s2 = serve._lane_shock(100, 40, 4, 500000, 100000, 0.2, 0.6, 3, "sell")
    ok("quant: shocked book (thin, spoof pull, vol x3) slips far more than the calm book", s2["slipBps"] > s1["slipBps"] * 5 and s2["levels"] > s1["levels"], (s1, s2))
    k = serve._lane_kelly(0.55, 1.0, 10000, 0.25)
    ok("exec: Kelly f* = p - (1-p)/b, size capped", abs(k["kelly"] - 0.1) < 1e-12 and abs(k["size"] - 1000) < 1e-6)
    # allow-list + caps
    ok("allow-list: unknown lane / job rejected", not serve.lane_args_ok("quant", "eval", [1]) and not serve.lane_args_ok("os", "ping", [1]))
    ok("caps: oversized Monte Carlo rejected (steps x paths > 2M)", not serve.lane_args_ok("quant", "merton", [100, 0.05, 0.6, 3, -0.04, 0.08, 0.1, 2000, 5000, 1]))
    ok("caps: non-numeric / bool / NaN arguments rejected", not serve.lane_args_ok("exec", "kelly", [True, 1, 1, 1]) and not serve.lane_args_ok("exec", "kelly", [0.5, float("nan"), 1, 1]) and not serve.lane_args_ok("quant", "shock", [1, 2, 3, 4, 5, 6, 7, 8, "sideways"]))
    # process isolation
    L = serve.Lanes("process")
    try:
        pids = {lane: L.run(lane, "ping", [1])["pid"] for lane, _ in serve.Lanes.NAMES}
        ok("isolation: 4 lanes, 4 separate worker processes, none is this process", len(set(pids.values())) == 4 and os.getpid() not in pids.values(), pids)
        pub = L.public()
        ok("telemetry: every lane reports kind=process, isolated, jobs, avg / p99 ms", all(r["kind"] == "process" and r["isolated"] and r["jobs"] == 1 and r["avg"] > 0 for r in pub["lanes"]) and len(pub["lanes"]) == 4, pub)
        # heavy quant job does not block ingest
        heavy = threading.Thread(target=lambda: L.run("quant", "merton", [100, 0.05, 0.6, 3, -0.04, 0.08, 0.1, 400, 2000, 1]))
        t0 = time.perf_counter(); heavy.start(); time.sleep(0.15)
        t1 = time.perf_counter(); L.run("ingest", "ohlc", [[[i * 10, 100 + i % 7, 1] for i in range(5000)], 1000]); lat = (time.perf_counter() - t1) * 1000
        busy = L.public()["lanes"][2]["state"]; heavy.join(); total = (time.perf_counter() - t0) * 1000
        ok("parallel: ingest answers in < 250 ms while the quant lane runs an 800k-step Monte Carlo", lat < 250 and total > lat * 3 and busy == "busy", {"ingest_ms": round(lat, 1), "quant_total_ms": round(total), "quant_state": busy})
    finally:
        L.shutdown()
    T = serve.Lanes("thread")
    try:
        r = T.run("exec", "ping", [5])
        ok("fallback: EXTERM_LANES=thread runs the same jobs on dedicated threads", r["pong"] == 5 and T.public()["lanes"][3]["kind"] == "thread")
    finally:
        T.shutdown()
    # live HTTP
    port = 8890; data = tempfile.mkdtemp(prefix="ntlanes-")
    srv = subprocess.Popen([sys.executable, str(ROOT / "serve.py"), str(port), "--no-browser", "--no-bots", "--no-alerts", "--no-update-check", "--offline", "--no-feed"], cwd=str(ROOT), env=dict(os.environ, EXTERM_DATA=data), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        base = "http://127.0.0.1:%d" % port; page = b""
        for _ in range(80):
            try:
                page = urllib.request.urlopen(base + "/", timeout=2).read(); break
            except Exception:
                time.sleep(0.25)
        tok = re.search(rb'name="nt-token" content="([^"]+)"', page).group(1).decode()
        def call(path, body=None, token=tok):
            req = urllib.request.Request(base + path, data=None if body is None else json.dumps(body).encode(), headers={"X-ExTerm": token, "Content-Type": "application/json"}, method="GET" if body is None else "POST")
            try:
                with urllib.request.urlopen(req, timeout=60) as r: return r.status, json.loads(r.read() or b"{}")
            except urllib.error.HTTPError as e: return e.code, {}
        st, j = call("/api/lanes", token="wrong")
        ok("http: /api/lanes requires the session token", st == 403)
        st, j = call("/api/lanes")
        ok("http: GET /api/lanes lists the 4 lanes (cold until used)", st == 200 and [r["lane"] for r in j["lanes"]] == ["ingest", "forensics", "quant", "exec"], j)
        st, j = call("/api/lanes/run", {"lane": "quant", "job": "merton", "args": [100, 0.05, 0.6, 3, -0.04, 0.08, 0.08, 30, 100, 1]})
        ok("http: POST /api/lanes/run executes a Merton job on the quant lane", st == 200 and j["ok"] and j["out"]["p10"] < j["out"]["p90"], j)
        st, j = call("/api/lanes/run", {"lane": "quant", "job": "__import__", "args": []})
        ok("http: non-allow-listed job -> 400", st == 400)
        st, j = call("/api/lanes")
        q = [r for r in j["lanes"] if r["lane"] == "quant"][0]
        ok("http: quant lane now isolated in its own process with 1 job", q["jobs"] == 1 and q["kind"] in ("process", "thread"), q)
    finally:
        srv.terminate()
        try: srv.wait(10)
        except Exception: srv.kill()
    print("\n".join(res)); f = sum(1 for x in res if x.startswith("FAIL")); print("\nv17.5 lanes: %d passed, %d failed" % (len(res) - f, f)); sys.exit(1 if f else 0)

if __name__ == "__main__":
    main()
