# ExTerm v17.0 operations test (no network): QR encoder (published Reed-Solomon / format / version vectors + an independent
# decode of our own matrices), LAN host gate, 5-step arming receipt, 10-gate risk firewall, HMAC webhook dispatcher,
# shared bots.json merge between launcher and bot process, compact OHLCV packing.
import hashlib, hmac, json, pathlib, sys, tempfile, time
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
sys.argv = ["serve.py", "8765", "--no-browser"]
import serve, exterm_ops as O
res = []
def ok(n, c, i=""): res.append(("PASS " if c else "FAIL ") + n + ("" if c or not i else " - " + str(i)[:240]))

# ── QR ──
ok("Reed-Solomon matches the published 1-M 'HELLO WORLD' vector", O.rs_ec([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17], 10) == [196, 35, 39, 119, 235, 215, 231, 226, 93, 23])
ok("format bits: level M, mask 0 = 101010000010010; mask 5 = 100000011001110", O.qr_format_bits(0) == 0b101010000010010 and O.qr_format_bits(5) == 0b100000011001110)
ok("version info: v7 = 000111110010010100", O.qr_version_bits(7) == 0b000111110010010100)

def decode(M):
    """Independent reader: format bits → mask, unmask, zigzag, de-interleave, byte mode."""
    n = len(M); ver = (n - 17) // 4
    fb = [M[i][8] for i in range(6)] + [M[7][8], M[8][8], M[8][7]] + [M[8][14 - i] for i in range(9, 15)]
    f = sum(int(b) << i for i, b in enumerate(fb))
    mask = next(m for m in range(8) if O.qr_format_bits(m) == f)
    fb2 = [M[8][n - 1 - i] for i in range(8)] + [M[n - 15 + i][8] for i in range(8, 15)]
    assert sum(int(b) << i for i, b in enumerate(fb2)) == f, "format copies disagree"
    fn = O._MASKS[mask]
    res_ = [[False] * n for _ in range(n)]
    for r in range(9):
        for c in range(9): res_[r][c] = True
    for r in range(9):
        for c in range(n - 8, n): res_[r][c] = True
    for r in range(n - 8, n):
        for c in range(9): res_[r][c] = True
    for i in range(n): res_[6][i] = res_[i][6] = True
    al = O._QR_ALIGN[ver]
    for r in al:
        for c in al:
            if (r < 9 and c < 9) or (r < 9 and c > n - 9) or (r > n - 9 and c < 9): continue
            for dr in range(-2, 3):
                for dc in range(-2, 3): res_[r + dr][c + dc] = True
    if ver >= 7:
        for i in range(6):
            for j in range(3): res_[i][n - 11 + j] = res_[n - 11 + j][i] = True
    bits = []; up = True; c = n - 1
    while c > 0:
        if c == 6: c -= 1
        for k in range(n):
            r = n - 1 - k if up else k
            for cc in (c, c - 1):
                if not res_[r][cc]: bits.append(int(M[r][cc]) ^ int(fn(r, cc)))
        up = not up; c -= 2
    ecn, groups = O._QR_M[ver]; sizes = [d for nb, d in groups for _ in range(nb)]
    cws = [int("".join(map(str, bits[i:i + 8])), 2) for i in range(0, len(bits) - 7, 8)]
    blocks = [[] for _ in sizes]; k = 0
    for i in range(max(sizes)):
        for b, s in enumerate(sizes):
            if i < s: blocks[b].append(cws[k]); k += 1
    ecb = [[] for _ in sizes]
    for i in range(ecn):
        for b in range(len(sizes)): ecb[b].append(cws[k]); k += 1
    for b in range(len(sizes)): assert O.rs_ec(blocks[b], ecn) == ecb[b], "EC mismatch in block %d" % b
    data = [x for b in blocks for x in b]
    s = "".join(format(x, "08b") for x in data)
    assert s[:4] == "0100", "not byte mode"
    nl = 8 if ver < 10 else 16; ln = int(s[4:4 + nl], 2)
    return bytes(int(s[4 + nl + 8 * i: 12 + nl + 8 * i], 2) for i in range(ln)).decode("utf-8")

texts = ["http://192.168.1.20:8765/?pair=Ab3_x-9QzLmN0pQrStUvWxYz", "http://100.101.102.103:8765/?pair=" + "k" * 24, "x" * 140, "ExTerm"]
dec = []
for t in texts:
    try: dec.append(decode(O.qr_matrix(t)) == t)
    except Exception as e: dec.append(repr(e))
ok("QR round-trip: an independent decoder reads back pairing URLs (v2-v7, incl. version info blocks and multi-block interleave)", all(x is True for x in dec), dec)
M = O.qr_matrix(texts[0])
ok("QR geometry: finder patterns, timing pattern, dark module", M[0][0] and M[0][6] and M[6][0] and not M[1][1] and M[3][3] and M[6][8] and not M[6][9] and M[len(M) - 8][8])
svg = O.qr_svg(texts[0])
ok("QR SVG: one path, no script / external refs", svg.startswith("<svg") and svg.count("<path") == 1 and "script" not in svg and "href" not in svg)
ok("QR ASCII: half-block rows", len(O.qr_ascii("ExTerm").splitlines()) >= 12)
try: O.qr_matrix("x" * 400); ok("QR: refuses text beyond version 10", False)
except ValueError: ok("QR: refuses text beyond version 10", True)

# ── LAN ──
ok("LAN host gate: private + Tailscale IPs and *.ts.net pass", all(O.lan_host_ok(h) for h in ("192.168.1.20", "10.0.0.5", "172.20.1.1", "100.101.102.103", "box.tail1234.ts.net", "localhost")))
ok("LAN host gate: public IPs, arbitrary names and rebinding look-alikes are refused", not any(O.lan_host_ok(h) for h in ("8.8.8.8", "evil.com", "192.168.1.20.nip.io", "100.128.0.1", "172.32.0.1", "ts.net.evil.com", "")))

# ── arming ──
d = pathlib.Path(tempfile.mkdtemp()); O.ensure_db(d)
good = {"disclosure": True, "cashCap": 2500, "maxSlipBps": 25, "stopAck": True, "phrase": "ARM LIVE BOT"}
errs = []
for k, v in (("disclosure", False), ("cashCap", 0), ("maxSlipBps", 900), ("stopAck", False), ("phrase", "arm live bot")):
    try: O.arm(d, dict(good, **{k: v})); errs.append(None)
    except ValueError as e: errs.append(str(e)[:7])
ok("arming: each of the 5 steps is enforced in order", errs == ["step 1:", "step 2:", "step 3:", "step 4:", "step 5:"], errs)
rec = O.arm(d, good)
ok("arming: a valid receipt verifies", O.armed(d) is not None and O.armed(d)["cashCap"] == 2500)
p = d / "arming.json"; j = json.loads(p.read_text()); j["cashCap"] = 999999; p.write_text(json.dumps(j))
ok("arming: a tampered receipt (raised cash cap) is rejected", O.armed(d) is None)
O.arm(d, good); ok("arming: receipts expire after 30 days", O.armed(d, now=time.time() + 31 * 86400) is None)
O.disarm(d); ok("arming: disarm removes it", O.armed(d) is None)

# ── risk firewall ──
cfg = dict(O.CFG_DEFAULTS); now = time.time()
def bot(**kw):
    b = {"name": "t", "sym": "AAPL", "tf": "1h", "spec": {"risk": {"sl": 2}}, "cash": 1000, "capital": 1000, "equity": 1000, "dayEq": 1000, "fee": 0.001, "slip": 0.0005, "trades": [], "shieldUntil": 0}
    b.update(kw); return b
gate = lambda b, **kw: O.risk_check(b, kw.get("price", 100), kw.get("ts", now * 1000), now, kw.get("cfg", cfg), kw.get("live"), kw.get("cap", 0))[1]
loss = lambda i: {"side": "sell", "pnl": -5, "ts": (now - 60 + i) * 1000}
cases = {
    "": gate(bot()),
    "stop_loss": gate(bot(spec={"risk": {}})),
    "daily_drawdown": gate(bot(equity=900)),
    "max_trades_day": gate(bot(trades=[{"side": "buy", "ts": now * 1000}] * 20)),
    "consecutive_losses": gate(bot(trades=[loss(i) for i in range(3)])),
    "macro_freeze": gate(bot(shieldUntil=now + 600)),
    "zero_overdraft": gate(bot(cash=0)),
    "slippage": gate(bot(slip=0.02)),
    "fees": gate(bot(fee=0.01)),
    "price_deviation": gate(bot(), live={"price": 102, "ts": now}),
    "stale_data": gate(bot(), ts=(now - 7200) * 1000),
}
ok("risk firewall: all 10 gates fire on their own condition and a clean bot passes", all(k == v for k, v in cases.items()), cases)
ok("risk firewall: losses older than the pause window no longer block", gate(bot(trades=[{"side": "sell", "pnl": -5, "ts": (now - 5 * 3600) * 1000}] * 3)) == "")
ok("risk firewall: gate list has exactly 10 entries", len(O.GATES) == 10)

# ── firewall bots inside the bot process: blocks + zero-overdraft sizing ──
c = O.db(d); fb = O.firewall_bots(serve, c, d)
b = bot(id="b1", cash=5000, capital=5000, equity=5000, dayEq=5000, pos=None, notify=False)
t = fb._trade(b, "buy", 100, "test", int(now * 1000))
ok("firewall bots: without an arming receipt, entries size from the bot's own capital", t is not None and abs(t["usd"] - 5000) < 1e-6, t)
fb._trade(b, "sell", 101, "exit", int(now * 1000))
O.arm(d, good); b2 = bot(id="b2", cash=5000, capital=5000, equity=5000, dayEq=5000, pos=None, notify=False)
t2 = fb._trade(b2, "buy", 100, "test", int(now * 1000))
ok("firewall bots: zero-overdraft caps the entry at the verified cash cap and keeps the rest settled", t2 is not None and abs(t2["usd"] - 2500) < 1e-6 and abs(b2["cash"] - 2500) < 1e-6, (t2, b2["cash"]))
b3 = bot(id="b3", spec={"risk": {}}, pos=None, notify=False)
ok("firewall bots: a blocked entry makes no trade and lands in the digest", fb._trade(b3, "buy", 100, "x", int(now * 1000)) is None and c.execute("SELECT COUNT(*) FROM digest WHERE kind='block'").fetchone()[0] >= 1)
st = O.status(d)
ok("Wake-Up digest: trades, blocks per gate and a one-line summary", st["digest"]["trades"] >= 3 and st["digest"]["byGate"].get("stop_loss", 0) >= 1 and st["digest"]["summary"].startswith("Overnight:") and st["armed"] is True)

# ── dispatcher ──
O.enqueue(c, "notify", {"text": "hello"}); O.enqueue(c, "webhook", {"url": "http://127.0.0.1:9999/hook", "signal": {"symbol": "AAPL", "side": "buy"}})
O.enqueue(c, "webhook", {"url": "https://evil.example/hook", "signal": {}})
got, posted = [], []
n = O.dispatch_once(c, d, serve, send_text=got.append, post=lambda u, body, h: posted.append((u, body, h)))
u, body, h = posted[0] if posted else ("", b"", {})
expect = "sha256=" + hmac.new(O.daemon_key(d), h.get("X-ExTerm-Timestamp", "").encode() + b"." + body, hashlib.sha256).hexdigest()
ok("dispatcher: notice delivered, webhook HMAC-SHA256 signed over timestamp.body", n == 2 and got == ["hello"] and h.get("X-ExTerm-Signature") == expect and json.loads(body)["armedAt"] > 0)
ok("dispatcher: a non-loopback / non-allow-listed webhook target is blocked, not retried", c.execute("SELECT status FROM outbox WHERE payload LIKE '%evil.example%'").fetchone()[0] == "blocked")
O.disarm(d); O.enqueue(c, "webhook", {"url": "http://127.0.0.1:9999/hook", "signal": {}})
O.dispatch_once(c, d, serve, send_text=got.append, post=lambda *a: posted.append(a))
ok("dispatcher: webhooks never fire without a verified arming receipt", len(posted) == 1 and c.execute("SELECT status, last_err FROM outbox ORDER BY id DESC LIMIT 1").fetchone()[0] == "blocked")
O.enqueue(c, "notify", {"text": "x"}); fails = []
def boom(t): raise OSError("telegram down")
O.dispatch_once(c, d, serve, send_text=boom)
row = c.execute("SELECT status, tries, next_at FROM outbox ORDER BY id DESC LIMIT 1").fetchone()
ok("dispatcher: a failed delivery is retried later with backoff (never raises)", row[0] == "pending" and row[1] == 1 and row[2] > time.time())

# ── shared bots.json between the launcher (configs) and the bot process (state) ──
d2 = pathlib.Path(tempfile.mkdtemp()); S = O.shared_bots_class(serve)
spec = {"v": 1, "name": "RSI dip", "entry": {"all": [{"a": {"k": "rsi", "n": 14}, "op": "<", "b": {"k": "const", "v": 30}}]},
        "exit": {"any": [{"a": {"k": "rsi", "n": 14}, "op": ">", "b": {"k": "const", "v": 70}}]}, "risk": {"sl": 2, "tp": 4}}
L = S(path=d2 / "bots.json"); cmds = []; L.cmd = lambda a, b: cmds.append((a, b))
try:
    L.upsert({"id": "bot1", "sym": "AAPL", "tf": "1h", "spec": spec, "capital": 1000})
    B = O.firewall_bots(serve, O.db(d2), d2)
    B._merge_from_disk(); B.bots[0]["cash"] = 777.0; B.save()  # bot process trades
    L.upsert({"id": "bot1", "sym": "AAPL", "tf": "1h", "spec": spec, "capital": 1000, "name": "renamed"})  # launcher edits config
    B.save()  # bot process saves its state again
    disk = json.loads((d2 / "bots.json").read_text())["bots"][0]
    ok("shared bots: launcher config edits and bot-process state both survive concurrent saves", disk["name"] == "renamed" and disk["cash"] == 777.0, disk.get("name"))
    L.close("bot1"); L.shield(minutes=30)
    ok("shared bots: launcher close / macro shield become commands for the bot process", cmds == [("close", "bot1"), ("shield", {"pause": True, "tighten": False, "minutes": 30, "stop_pct": 1.0, "clear": False})])
except Exception as e:
    ok("shared bots: launcher config edits and bot-process state both survive concurrent saves", False, repr(e))

# ── OHLCV packing ──
bin_k = json.dumps([[1700000000000 + i * 60000, "97123.45000000", "97200.00000000", "97050.10000000", "97180.99000000", "12.34567000", 1700000059999 + i * 60000,
                     "1198765.43210000", 1523, "6.17283500", "599382.71605000", "0"] for i in range(500)]).encode()  # real Binance kline shape
pk = serve.pack_ohlcv("api.binance.com", bin_k)
ok("pack: Binance klines → [[t,o,h,l,c,v]] in seconds, ≥ 65% smaller", pk is not None and json.loads(pk)[0] == [1700000000, 97123.45, 97200.0, 97050.1, 97180.99, 12.34567] and len(pk) <= 0.35 * len(bin_k), (len(pk or b""), len(bin_k)))
ok("pack: Coinbase [t,l,h,o,c,v] is re-ordered to OHLC", json.loads(serve.pack_ohlcv("api.exchange.coinbase.com", b"[[100,1,3,2,2.5,9]]")) == [[100, 2.0, 3.0, 1.0, 2.5, 9.0]])
ok("pack: unknown formats are left alone", serve.pack_ohlcv("api.coingecko.com", b"{}") is None and serve.pack_ohlcv("api.binance.com", b"nope") is None)
ok("keep-alive pool exists and is used for the default opener only", hasattr(serve, "POOL") and "opener is OPENER" in pathlib.Path(serve.__file__).read_text(encoding="utf-8"))

print("\n".join(res)); fl = sum(r.startswith("FAIL") for r in res); print(f"\n{len(res) - fl}/{len(res)} passed"); sys.exit(1 if fl else 0)
