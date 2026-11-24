# ExTerm v17.9 lane maths harness: called by test/v179.test.js, prints one JSON object (no network, temporary data dir)
import json, math, os, pathlib, sys, tempfile, time
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT)); sys.argv = ["serve.py", "8765", "--no-browser"]
import serve as s
import grok_exterm_bridge as gb
D = tempfile.mkdtemp(prefix="xt179py-"); out = {}
# OHLCV
bars = [[0, 10, 11, 9, 10.5, 1], [20, 10.5, 12, 10, 11, 2], [40, 11, 11.5, 8, 9, 3], [60, 9, 9.5, 8.5, 9.2, 4]]
out["agg"] = s.agg_bars(bars, "1m"); out["wk"] = s.bucket_of(1795500000, "1w"); out["wkday"] = time.gmtime(out["wk"]).tm_wday; out["mo"] = list(time.gmtime(s.bucket_of(1795500000, "1M"))[:4])
out["stitch"] = s.stitch([[0, 10, 11, 9, 10.5, 1]], [[10000, 12, 1], [30000, 8, 1], [59000, 9.9, 1], [61000, 10.2, 2]], "1m")
out["agg1M"] = s.agg_bars([[s.bucket_of(1795500000, "1d") + i * 86400, 1 + i, 2 + i, 0.5, 1.5 + i, 1] for i in range(40)], "1M")
out["sample"] = [len(s.sample_bars("BTC-USD", tf, 120, 60000)) for tf in s.TF_SEC] + [s.sample_bars("BTC-USD", "1h", 50, 60000)[-1][4]]
# Lane 11
calls = [{"strike": k, "oi": 1000 + (k - 95) * 300, "iv": 0.2} for k in range(95, 106)]; puts = [{"strike": k, "oi": 3000 - (k - 95) * 250, "iv": 0.22} for k in range(95, 106)]
out["gex"] = s.gex_levels(100.0, calls, puts, 1 / 365)
t0 = 1795478400 + 14 * 3600 + 1800; ses = []
for i in range(60):
    c = 100 + (0.02 * i if i < 30 else (0.6 - 0.03 * (i - 30) if i < 50 else 0.3 + 0.2 * (i - 50)))
    ses.append([t0 + i * 60, c, c + 0.05, c - 0.05, c, 1000])
out["orb"] = s.orb_avwap(ses); out["pinEst"] = [round(s.pin_est([[i, 1, 1, 1, 1 + i * 0.01, 10] for i in range(30)]), 3), round(s.pin_est([[i, 1, 1, 1, 1 + (i % 2) * 0.01, 10] for i in range(30)]), 3)]
import random; R = random.Random(5); mk = [R.gauss(0, 0.01) for _ in range(60)]
rets = {k: [m + R.gauss(0, 0.004) for m in mk] for k in ("A", "B", "C", "D", "E", "F")}; rets["F"][-1] += 0.05
res, modes = s.rmt_residuals(rets); out["rmt"] = {"top": max(res, key=lambda k: abs(res[k])), "modes": modes}
# Lane 12 / 13
out["micro"] = round(s.micro_price(100, 9, 101, 1), 3)
out["ent"] = [round(s.entropy_norm(["a"] * 10), 3), round(s.entropy_norm(list("abcdefghij")), 3)]; out["top3"] = round(s.top_share(["a", "b", "c", "d"], [70, 10, 10, 10]), 3)
out["impact"] = [round(s.amm_impact_pct(1000, 200000), 3), round(s.amm_impact_pct(1000, 50000), 3)]; out["half"] = [s.retention_half_life(40, 120, 480) == float("inf"), round(s.retention_half_life(5, 60, 240), 2)]
out["shield"] = [s.rug_shield_v2({"impact": 1, "top3": 0.1, "entropy": 0.8, "freeze": False, "lpLocked": True, "netBuy": 0.2})[0], s.rug_shield_v2({"impact": 3, "top3": 0.1, "entropy": 0.8, "freeze": False, "lpLocked": True, "netBuy": 0.2})[0], s.rug_shield_v2({"impact": 1, "top3": 0.1, "entropy": 0.8, "freeze": True, "netBuy": 0.2})[0], [c[1] for c in s.rug_shield_v2({"impact": 1, "netBuy": 0.1})[1]]]
# Lane 14
x = [R.random() for _ in range(300)]; y = [0.0] + [v + R.random() * 0.1 for v in x[:-1]]
out["te"] = [round(s.transfer_entropy(x, y), 3), round(s.transfer_entropy(y, x), 3)]
b = s.BOCPDpy(1 / 50); cp = []
for i in range(120): b.push((0 if i < 60 else 5) + math.sin(i * 1.7) * 0.3); cp.append(round(b.cp, 3))
out["bocpd"] = [max(cp[40:59]), cp[60], cp[110], b.map]
good = {"sym": "BTC-USD", "mkt": "crypto", "side": "buy", "setup": "Funding extreme squeeze", "score": 0.85, "px": 100.0, "atr": 1.0, "liq": 5e6, "feat": {"funding8hBps": -6, "microSkewBps": 1.0}}
thin = dict(good, sym="oc:solana:Thin", mkt="onchain", liq=20000, feat={"impact": 4.5})
cs = s.consensus([good, thin], [], 0.1); out["cons"] = [[c["sym"], c["agree"], c["peer"], c["votes"]["RISK-GUARD"]] for c in cs]
# Lane 15
t = time.perf_counter(); m1 = s.mc_stress(good); m2 = s.mc_stress(thin); out["mc"] = [m1, m2, round((time.perf_counter() - t) * 1000)]
out["mcSeed"] = s.mc_stress(good) == m1
# Lane 16
cg = dict(cs[0], mc=dict(m1, verdict="PASS", slipPct=0.1)); journal = [{"sym": "BTC-USD", "setup": "Funding extreme squeeze", "pnl": 10}] * 4 + [{"sym": "BTC-USD", "setup": "Funding squeeze", "pnl": -3}]
out["tierS"] = s.tier_of(cg, {"BTC": {tf: 1 for tf in s.MTF}}, journal, {"cp": 0.1})
out["tierP"] = s.tier_of(dict(cs[0], mc={}), {}, [], {"cp": 0.1})
out["tierW"] = s.tier_of(dict(cs[1], mc=m2), {}, [], {"cp": 0.9})
out["jm"] = s.journal_match(good, journal)
# Lane 17
out["route"] = s.route_plan({"sym": "oc:solana:Pool", "usd": 6000, "liq": 300000, "volPerMin": 2000, "pov": 0.1, "sl": 0.9, "tp": 1.3, "wallets": 7}, {"p50": 5000, "p75": 12000, "p90": 50000, "src": "test"})
out["routeC"] = s.route_plan({"sym": "BTC-USD", "usd": 1000, "liq": 5e6})
st17 = {}; s._call17(st17, "bracket", {"id": "a", "sym": "X", "side": "buy", "sl": 95, "tp": 110}); s._call17(st17, "bracket", {"id": "b", "sym": "X", "side": "sell", "sl": 105, "tp": 90})
out["brk"] = [s._call17(st17, "tick", {"sym": "X", "px": 100})["triggered"], s._call17(st17, "tick", {"sym": "X", "px": 94})["triggered"], s._call17(st17, "tick", {"sym": "X", "px": 89})["triggered"], len(st17["br"])]
# Lane 18
base = {"sym": "BTC-USD", "usd": 500, "px": 100, "atr": 1, "equity": 10000, "winp": 0.55, "payoff": 2}
st18 = {"data": D, "feed": {"lane13": {"forensics": {"oc:solana:Honey": {"honeypot": True, "freeze": True, "impact": 0.5}}}}}
fails = lambda r: [c["name"] for c in r["checks"] if c["state"] == "fail"]
out["fw"] = {"ok": s.risk_check(base, st18)["verdict"], "honey": fails(s.risk_check(dict(base, sym="oc:solana:Honey"), st18)), "slip": fails(s.risk_check(dict(base, slipPct=2.5), st18)), "size": fails(s.risk_check(dict(base, usd=9000), st18)),
             "var": fails(s.risk_check(dict(base, positions=[{"usd": 9000, "vol": 0.06}] * 3), st18)), "loss": fails(s.risk_check(dict(base, lossTimes=[time.time() - 600, time.time() - 300, time.time() - 60]), st18)), "dead": fails(s.risk_check(dict(base, feedAgeSec=5.2), st18)), "max": s.risk_check(base, st18)["maxUsd"]}
(pathlib.Path(D) / "macro.json").write_text(json.dumps([["CPI", time.strftime("%Y-%m-%d %H:%M", time.gmtime(time.time() + 900))]]))
out["fw"]["macro"] = fails(s.risk_check(base, st18))
pin = []
for job, a in [("arm", {"mode": "LIVE", "pin": "1234"}), ("pin", {"pin": "12"}), ("pin", {"pin": "482913"}), ("arm", {"mode": "LIVE", "pin": "000000"})] + [("arm", {"mode": "LIVE", "pin": "111111"})] * 4 + [("arm", {"mode": "LIVE", "pin": "482913"})]:
    try: pin.append(["ok", s._call18(st18, job, a)["mode"]])
    except ValueError as e: pin.append(["err", str(e)[:40]])
st18["lockUntil"] = 0; pin.append(["ok", s._call18(st18, "arm", {"mode": "LIVE", "pin": "482913"})["mode"]]); pin.append(["ok", s._call18(st18, "arm", {"mode": "PAPER"})["mode"]])
out["pin"] = pin; out["pinFile"] = sorted(json.loads((pathlib.Path(D) / "arming.json").read_text()).keys()); out["pinPlain"] = "482913" in (pathlib.Path(D) / "arming.json").read_text()
# Lane 19
out["ratchet"] = [s.ratchet_stop("buy", 100, 2, 101, 1, 98), s.ratchet_stop("buy", 100, 2, 102.2, 1, 98), s.ratchet_stop("buy", 100, 2, 105.2, 1, 100), s.ratchet_stop("buy", 100, 2, 108, 1, 103), s.ratchet_stop("buy", 100, 2, 106, 1, 107.4), s.ratchet_stop("sell", 100, 2, 94, 1, 102)]
out["manage"] = [s.manage_position({"side": "buy", "ageMs": 320, "vpin": 0.82, "flowSign": -1})["action"], s.manage_position({"side": "buy", "ageMs": 900, "vpin": 0.82, "flowSign": -1, "entry": 100, "rUnit": 1, "px": 100, "stop": 99})["action"], s.manage_position({"side": "buy", "ageMs": 320, "vpin": 0.82, "flowSign": 1, "entry": 100, "rUnit": 1, "px": 100, "stop": 99})["action"], s.manage_position({"side": "sell", "liqDrainPct": 31})["action"]]
led = str(pathlib.Path(D) / "led.jsonl"); cache = {}
for i in range(5): s.ledger_append(led, {"kind": "order", "id": "o%d" % i, "usd": 100 + i}, cache)
v1 = s.ledger_verify(led); lines = pathlib.Path(led).read_text().splitlines(); lines[2] = lines[2].replace('"usd":102', '"usd":999'); pathlib.Path(led).write_text("\n".join(lines) + "\n"); v2 = s.ledger_verify(led)
out["ledger"] = [v1, v2]
st19 = {"data": D}; f = s._call19(st19, "fill", {"id": "f1", "side": "buy", "expected": 100, "fill": 100.05, "qty": 1}); f2 = s._call19(st19, "fill", {"id": "f2", "side": "sell", "expected": 100, "fill": 100.05, "qty": 1})
out["fill"] = [f["slipBps"], f2["slipBps"], f2["avgBps"], s._call19(st19, "verify", {})]
# grok bridge parser
out["gb"] = [gb.parse_proposal('Sure: {"side":"buy","usd":250,"px":10,"atr":0.2,"winp":0.6,"payoff":2,"why":"x"} done'), gb.parse_proposal('{"side":"yolo","usd":1e99,"winp":7}'), gb.VERSION]
try: gb.parse_proposal("no json here"); out["gbBad"] = False
except ValueError: out["gbBad"] = True
out["workers"] = [s.LANE_WORKERS[k] for k in range(9, 20)]; out["ids"] = list(s.FAST_LANE_IDS); out["fwd"] = {str(k): list(v) for k, v in s.FAST_FWD.items()}
print(json.dumps(out, default=lambda o: None if o == float("inf") else str(o)))
