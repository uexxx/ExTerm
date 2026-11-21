#!/usr/bin/env python3
# Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited.
"""ExTerm v17.0 operations module (standard library only), imported by serve.py only when needed:

  QR pairing     qr_matrix / qr_svg / qr_ascii: a self-contained QR encoder (byte mode, ECC level M, versions 1-10)
  LAN mode       lan_ips / lan_host_ok: which Host headers a --lan launcher accepts
  24/7 daemon    python serve.py --bot-daemon --headless
                   process 1  ingest      one PriceFeed for every bot / alert symbol -> SQLite WAL `prices` (1 upstream, many readers)
                   process 2  bots        the paper bots behind a 10-gate deterministic risk firewall; trades / blocks -> digest,
                                          signals -> SQLite `outbox`
                   process 3  dispatcher  async retry queue: Telegram / Discord notices and HMAC-SHA256-signed JSON webhooks to a
                                          local bridge, the webhooks only while a verified 5-step arming receipt exists
                 the launcher process keeps serving the UI and supervises the three (watchdog + heartbeats, restart with backoff)
"""
import hashlib, hmac, json, os, pathlib, secrets, socket, sqlite3, sys, threading, time, urllib.request

# ════════════════════════════════════════ QR encoder ════════════════════════════════════════
# ECC level M only. (ec codewords per block, [(blocks, data codewords per block), ...]) for versions 1..10
_QR_M = {1: (10, [(1, 16)]), 2: (16, [(1, 28)]), 3: (26, [(1, 44)]), 4: (18, [(2, 32)]), 5: (24, [(2, 43)]),
         6: (16, [(4, 27)]), 7: (18, [(4, 31)]), 8: (22, [(2, 38), (2, 39)]), 9: (22, [(3, 36), (2, 37)]), 10: (26, [(4, 43), (1, 44)])}
_QR_ALIGN = {1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]}
_EXP = [0] * 512; _LOG = [0] * 256
_x = 1
for _i in range(255):
    _EXP[_i] = _x; _LOG[_x] = _i; _x <<= 1
    if _x & 0x100: _x ^= 0x11D
for _i in range(255, 512): _EXP[_i] = _EXP[_i - 255]

def _gmul(a, b):
    return 0 if a == 0 or b == 0 else _EXP[_LOG[a] + _LOG[b]]

def rs_ec(data, n):
    """Reed-Solomon error-correction codewords (GF(256), primitive 0x11D) for `data`, n codewords."""
    g = [1]
    for i in range(n):  # generator = prod (x - a^i)
        ng = [0] * (len(g) + 1)
        for j, c in enumerate(g):
            ng[j] ^= c; ng[j + 1] ^= _gmul(c, _EXP[i])
        g = ng
    rem = list(data) + [0] * n
    for i in range(len(data)):
        c = rem[i]
        if c:
            for j in range(1, len(g)): rem[i + j] ^= _gmul(g[j], c)
    return rem[len(data):]

def _bch(value, poly, bits):
    v = value << bits
    for i in range(v.bit_length() - 1, bits - 1, -1):
        if v >> i & 1: v ^= poly << (i - bits)
    return (value << bits) | v

def qr_format_bits(mask):
    return _bch((0b00 << 3) | mask, 0x537, 10) ^ 0x5412  # 00 = ECC level M

def qr_version_bits(ver):
    return _bch(ver, 0x1F25, 12)

def _qr_codewords(data, ver):
    ecn, groups = _QR_M[ver]; cap = sum(b * d for b, d in groups)
    bits = [0, 1, 0, 0] + [int(c) for c in format(len(data), "08b" if ver < 10 else "016b")]
    for byte in data: bits += [int(c) for c in format(byte, "08b")]
    bits += [0] * min(4, cap * 8 - len(bits))
    bits += [0] * ((8 - len(bits) % 8) % 8)
    cw = [int("".join(map(str, bits[i:i + 8])), 2) for i in range(0, len(bits), 8)]
    k = 0
    while len(cw) < cap: cw.append((0xEC, 0x11)[k % 2]); k += 1
    blocks, pos = [], 0
    for nb, nd in groups:
        for _ in range(nb): blocks.append(cw[pos:pos + nd]); pos += nd
    ecs = [rs_ec(b, ecn) for b in blocks]
    final = []
    for i in range(max(len(b) for b in blocks)):
        for b in blocks:
            if i < len(b): final.append(b[i])
    for i in range(ecn):
        for e in ecs: final.append(e[i])
    return final

_MASKS = [lambda r, c: (r + c) % 2 == 0, lambda r, c: r % 2 == 0, lambda r, c: c % 3 == 0, lambda r, c: (r + c) % 3 == 0,
          lambda r, c: (r // 2 + c // 3) % 2 == 0, lambda r, c: (r * c) % 2 + (r * c) % 3 == 0,
          lambda r, c: ((r * c) % 2 + (r * c) % 3) % 2 == 0, lambda r, c: ((r + c) % 2 + (r * c) % 3) % 2 == 0]

def qr_matrix(text, mask=None):
    """QR matrix (rows of bools, True = dark) for `text`: byte mode, ECC M, smallest version 1-10, best mask by ISO penalty."""
    data = text.encode("utf-8"); ver = None
    for v in range(1, 11):
        if 4 + (8 if v < 10 else 16) + 8 * len(data) <= sum(b * d for b, d in _QR_M[v][1]) * 8: ver = v; break
    if ver is None: raise ValueError("text too long for a version-10 QR code")
    final = _qr_codewords(data, ver); size = 17 + 4 * ver
    M = [[None] * size for _ in range(size)]
    def finder(r, c):
        for dr in range(-1, 8):
            for dc in range(-1, 8):
                rr, cc = r + dr, c + dc
                if 0 <= rr < size and 0 <= cc < size:
                    M[rr][cc] = (0 <= dr <= 6 and dc in (0, 6)) or (0 <= dc <= 6 and dr in (0, 6)) or (2 <= dr <= 4 and 2 <= dc <= 4)
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0)
    for i in range(8, size - 8): M[6][i] = M[i][6] = i % 2 == 0
    al = _QR_ALIGN[ver]
    for r in al:
        for c in al:
            if (r < 9 and c < 9) or (r < 9 and c > size - 9) or (r > size - 9 and c < 9): continue  # only the finder corners are skipped
            for dr in range(-2, 3):
                for dc in range(-2, 3): M[r + dr][c + dc] = max(abs(dr), abs(dc)) != 1
    M[size - 8][8] = True  # dark module
    res = [[M[r][c] is not None for c in range(size)] for r in range(size)]
    for i in range(9): res[8][i] = res[i][8] = True
    for i in range(8): res[8][size - 1 - i] = res[size - 1 - i][8] = True
    if ver >= 7:
        for i in range(6):
            for j in range(3): res[i][size - 11 + j] = res[size - 11 + j][i] = True
    stream = [int(b) for byte in final for b in format(byte, "08b")]
    idx = 0; up = True; c = size - 1
    while c > 0:
        if c == 6: c -= 1
        for k in range(size):
            r = size - 1 - k if up else k
            for cc in (c, c - 1):
                if not res[r][cc]:
                    M[r][cc] = bool(stream[idx]) if idx < len(stream) else False; idx += 1
        up = not up; c -= 2
    def place_info(G, m):
        f = qr_format_bits(m); fb = [(f >> i) & 1 for i in range(15)]  # fb[0] = LSB
        for i in range(6): G[i][8] = bool(fb[i])
        G[7][8] = bool(fb[6]); G[8][8] = bool(fb[7]); G[8][7] = bool(fb[8])
        for i in range(9, 15): G[8][14 - i] = bool(fb[i])
        for i in range(8): G[8][size - 1 - i] = bool(fb[i])
        for i in range(8, 15): G[size - 15 + i][8] = bool(fb[i])
        G[size - 8][8] = True
        if ver >= 7:
            vb = qr_version_bits(ver)
            for i in range(18):
                bit = bool((vb >> i) & 1); a, b = i // 3, size - 11 + i % 3
                G[a][b] = bit; G[b][a] = bit
    def penalty(G):
        p = 0
        for line in list(G) + [list(x) for x in zip(*G)]:
            run = 1
            for i in range(1, size):
                if line[i] == line[i - 1]: run += 1
                else:
                    if run >= 5: p += run - 2
                    run = 1
            if run >= 5: p += run - 2
            s = "".join("1" if x else "0" for x in line)
            p += 40 * (s.count("10111010000") + s.count("00001011101"))
        for r in range(size - 1):
            for c2 in range(size - 1):
                if G[r][c2] == G[r][c2 + 1] == G[r + 1][c2] == G[r + 1][c2 + 1]: p += 3
        dark = sum(sum(1 for x in row if x) for row in G)
        return p + 10 * (abs(dark * 100 // (size * size) - 50) // 5)
    best = None
    for m in (range(8) if mask is None else [mask]):
        G = [row[:] for row in M]
        for r in range(size):
            for c2 in range(size):
                if not res[r][c2] and _MASKS[m](r, c2): G[r][c2] = not G[r][c2]
        place_info(G, m); sc = penalty(G)
        if best is None or sc < best[0]: best = (sc, G)
    return [[bool(x) for x in row] for row in best[1]]

def qr_svg(text, scale=6, quiet=4, dark="#0B0B0D", light="#FFFFFF"):
    M = qr_matrix(text); n = len(M); w = (n + 2 * quiet) * scale
    path = "".join("M%d %dh%dv%dh-%dz" % ((c + quiet) * scale, (r + quiet) * scale, scale, scale, scale) for r in range(n) for c in range(n) if M[r][c])
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" role="img" aria-label="ExTerm pairing QR code">'
            '<rect width="100%%" height="100%%" fill="%s"/><path d="%s" fill="%s"/></svg>') % (w, w, w, w, light, path, dark)

def qr_ascii(text, quiet=2):
    """Terminal QR with half blocks (two module rows per line), drawn light-on-dark so phone cameras read it from a dark console."""
    M = qr_matrix(text); n = len(M) + 2 * quiet
    P = [[False] * n for _ in range(quiet)] + [[False] * quiet + row + [False] * quiet for row in M] + [[False] * n for _ in range(quiet + 1)]
    return "\n".join("".join(" " if (a and b) else "▄" if a else "▀" if b else "█" for a, b in zip(P[r], P[r + 1])) for r in range(0, len(P) - 1, 2))

# ════════════════════════════════════════ LAN mode ════════════════════════════════════════
def _lan_ip(h):
    p = (h or "").split(".")
    if len(p) != 4 or not all(x.isdigit() and 0 <= int(x) <= 255 for x in p): return False
    a, b = int(p[0]), int(p[1])
    return a == 10 or (a == 172 and 16 <= b <= 31) or (a == 192 and b == 168) or (a == 100 and 64 <= b <= 127)  # 100.64/10 = Tailscale

def lan_ips():
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(("192.0.2.1", 9)); ips.add(s.getsockname()[0]); s.close()  # UDP connect: no packet sent
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET): ips.add(info[4][0])
    except OSError:
        pass
    return sorted((ip for ip in ips if _lan_ip(ip)), key=lambda ip: (not ip.startswith("100."), ip))  # Tailscale (encrypted) first

def lan_host_ok(host):
    """Host headers a --lan launcher accepts: loopback, private / Tailscale IP literals and *.ts.net. Other DNS names are refused,
    so a DNS-rebinding page can't reach the launcher."""
    h = (host or "").lower().strip("[]")
    return h in ("localhost", "127.0.0.1", "::1") or _lan_ip(h) or (h.endswith(".ts.net") and all(c.isalnum() or c in "-." for c in h))

# ════════════════════════════════════════ daemon: storage ════════════════════════════════════════
def db_path(data_dir): return pathlib.Path(data_dir) / "daemon.db"

def db(data_dir):
    c = sqlite3.connect(str(db_path(data_dir)), timeout=10, isolation_level=None, check_same_thread=False)
    c.execute("PRAGMA journal_mode=WAL"); c.execute("PRAGMA synchronous=NORMAL"); c.execute("PRAGMA busy_timeout=10000")
    return c

def ensure_db(data_dir):
    pathlib.Path(data_dir).mkdir(parents=True, exist_ok=True)
    c = db(data_dir)
    c.executescript("""
      CREATE TABLE IF NOT EXISTS prices (sym TEXT PRIMARY KEY, price REAL, ts REAL);
      CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, created REAL, kind TEXT, payload TEXT, status TEXT DEFAULT 'pending', tries INTEGER DEFAULT 0, next_at REAL DEFAULT 0, last_err TEXT DEFAULT '');
      CREATE INDEX IF NOT EXISTS outbox_due ON outbox(status, next_at);
      CREATE TABLE IF NOT EXISTS digest (id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, kind TEXT, bot TEXT, line TEXT);
      CREATE TABLE IF NOT EXISTS heartbeat (proc TEXT PRIMARY KEY, ts REAL, pid INTEGER, info TEXT);
      CREATE TABLE IF NOT EXISTS commands (id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, cmd TEXT, arg TEXT, done INTEGER DEFAULT 0);
    """)
    c.close()
    try: os.chmod(db_path(data_dir), 0o600)
    except OSError: pass

def beat(c, proc, info=""):
    c.execute("INSERT INTO heartbeat(proc, ts, pid, info) VALUES(?,?,?,?) ON CONFLICT(proc) DO UPDATE SET ts=excluded.ts, pid=excluded.pid, info=excluded.info", (proc, time.time(), os.getpid(), str(info)[:200]))

def enqueue(c, kind, payload):
    c.execute("INSERT INTO outbox(created, kind, payload) VALUES(?,?,?)", (time.time(), kind, json.dumps(payload)[:64000]))

def command(c, cmd, arg):
    c.execute("INSERT INTO commands(ts, cmd, arg) VALUES(?,?,?)", (time.time(), cmd, json.dumps(arg)[:4000]))

def digest_add(c, kind, bot, line):
    c.execute("INSERT INTO digest(ts, kind, bot, line) VALUES(?,?,?,?)", (time.time(), kind, str(bot)[:60], str(line)[:300]))
    c.execute("DELETE FROM digest WHERE id IN (SELECT id FROM digest ORDER BY id DESC LIMIT -1 OFFSET 5000)")

class FileLock:
    """Cross-process lock for bots.json (the launcher edits configs, the bot process owns trading state)."""
    def __init__(self, path, stale=30.0): self.path = str(path) + ".lock"; self.stale = stale; self.fd = None
    def __enter__(self):
        t0 = time.time()
        while True:
            try:
                self.fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600); os.write(self.fd, str(os.getpid()).encode()); return self
            except FileExistsError:
                try:
                    if time.time() - os.path.getmtime(self.path) > self.stale: os.remove(self.path); continue  # a crashed holder
                except OSError: pass
                if time.time() - t0 > 15: raise TimeoutError("bots.json is locked")
                time.sleep(0.02)
    def __exit__(self, *a):
        try: os.close(self.fd)
        except OSError: pass
        try: os.remove(self.path)
        except OSError: pass

CFG_DEFAULTS = {"maxTradesDay": 20, "maxConsecLoss": 3, "pauseHours": 4.0, "dailyDD": 5.0, "maxSlipPct": 1.0, "maxFeePct": 0.5, "maxDevPct": 0.75,
                "staleSec": 180, "cashCap": 0.0, "webhook": "", "every": 30}

def load_cfg(data_dir):
    d = dict(CFG_DEFAULTS)
    try:
        j = json.loads((pathlib.Path(data_dir) / "daemon.json").read_text())
        for k, v in CFG_DEFAULTS.items():
            x = j.get(k)
            if isinstance(v, str) and isinstance(x, str): d[k] = x[:500]
            elif not isinstance(v, str) and isinstance(x, (int, float)) and not isinstance(x, bool) and x >= 0: d[k] = type(v)(x)
    except Exception:
        pass
    return d

def daemon_key(data_dir):
    p = pathlib.Path(data_dir) / "daemon.key"
    try:
        k = p.read_text().strip()
        if len(k) >= 32: return k.encode()
    except OSError:
        pass
    k = secrets.token_hex(32); p.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(str(p), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f: f.write(k)
    return k.encode()

# ════════════════════════════════════════ 5-step arming receipt ════════════════════════════════════════
ARM_PHRASE = "ARM LIVE BOT"
ARM_TTL = 30 * 86400

def arm(data_dir, steps):
    """Validate the five steps and write a signed receipt. Raises ValueError naming the first failed step."""
    s = steps if isinstance(steps, dict) else {}
    if s.get("disclosure") is not True: raise ValueError("step 1: accept the AS IS risk disclosure")
    try: cap = float(s.get("cashCap"))
    except (TypeError, ValueError): cap = 0
    if not (0 < cap <= 1e9): raise ValueError("step 2: set a positive settled-cash cap")
    try: slip = float(s.get("maxSlipBps"))
    except (TypeError, ValueError): slip = 0
    if not (0 < slip <= 500): raise ValueError("step 3: max slippage must be 1-500 bps")
    if s.get("stopAck") is not True: raise ValueError("step 4: acknowledge the mandatory stop-loss and kill-switch")
    if s.get("phrase") != ARM_PHRASE: raise ValueError('step 5: type exactly "%s"' % ARM_PHRASE)
    body = {"cashCap": cap, "maxSlipBps": slip, "ts": int(time.time()), "v": 1}
    canon = json.dumps(body, sort_keys=True, separators=(",", ":")).encode()
    rec = dict(body, sig=hmac.new(daemon_key(data_dir), canon, hashlib.sha256).hexdigest())
    fd = os.open(str(pathlib.Path(data_dir) / "arming.json"), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f: json.dump(rec, f)
    return rec

def disarm(data_dir):
    try: (pathlib.Path(data_dir) / "arming.json").unlink()
    except OSError: pass

def armed(data_dir, now=None):
    """The verified receipt, or None (missing, tampered, expired)."""
    try: rec = json.loads((pathlib.Path(data_dir) / "arming.json").read_text())
    except Exception: return None
    if not isinstance(rec, dict): return None
    sig = str(rec.pop("sig", ""))
    canon = json.dumps(rec, sort_keys=True, separators=(",", ":")).encode()
    if not hmac.compare_digest(sig, hmac.new(daemon_key(data_dir), canon, hashlib.sha256).hexdigest()): return None
    if (now or time.time()) - float(rec.get("ts", 0)) > ARM_TTL: return None
    return rec

# ════════════════════════════════════════ 10-gate risk firewall ════════════════════════════════════════
GATES = ("stop_loss", "daily_drawdown", "max_trades_day", "consecutive_losses", "macro_freeze", "zero_overdraft", "slippage", "fees", "price_deviation", "stale_data")
TF_SEC = {"1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400}

def risk_check(b, price, ts_ms, now, cfg, live=None, cash_cap=0.0):
    """Deterministic entry gate for one bot. Returns (True, '', '') or (False, gate, reason). Exits are never gated."""
    r = (b.get("spec") or {}).get("risk") or {}
    if not (r.get("sl") or 0) > 0: return False, "stop_loss", "no stop-loss in the rules: entries need a mandatory stop"
    eq = b.get("equity") or b.get("cash") or 0; day_eq = b.get("dayEq"); lim = b.get("maxDailyLoss") or cfg["dailyDD"]
    if day_eq and eq < day_eq * (1 - lim / 100): return False, "daily_drawdown", "daily drawdown kill-switch (%.1f%%)" % lim
    day = int(now // 86400)
    today = [t for t in b.get("trades", []) if t.get("side") == "buy" and int((t.get("ts") or 0) / 1000 // 86400) == day]
    if len(today) >= cfg["maxTradesDay"]: return False, "max_trades_day", "max %d entries per day reached" % cfg["maxTradesDay"]
    closed = [t for t in b.get("trades", []) if t.get("side") == "sell" and t.get("pnl") is not None]; n = int(cfg["maxConsecLoss"])
    if n > 0 and len(closed) >= n and all(t["pnl"] < 0 for t in closed[-n:]) and now < (closed[-1].get("ts") or 0) / 1000 + cfg["pauseHours"] * 3600:
        return False, "consecutive_losses", "%d losses in a row: paused for %g h" % (n, cfg["pauseHours"])
    if (b.get("shieldUntil") or 0) > now: return False, "macro_freeze", "macro catalyst freeze (World Monitor)"
    cash = b.get("cash") or 0
    cap = min(b.get("capital") or cash, cash_cap or float("inf"), cfg["cashCap"] or float("inf"))
    if cash <= 0 or cap <= 0: return False, "zero_overdraft", "no settled cash allocated"
    if (b.get("slip") or 0) * 100 > cfg["maxSlipPct"]: return False, "slippage", "slippage %.2f%% above the %.2f%% abort threshold" % (b["slip"] * 100, cfg["maxSlipPct"])
    if (b.get("fee") or 0) * 100 > cfg["maxFeePct"]: return False, "fees", "fee %.2f%% above the %.2f%% abort threshold" % (b["fee"] * 100, cfg["maxFeePct"])
    if live and live.get("price") and now - (live.get("ts") or 0) < 120 and price > 0:
        dev = abs(live["price"] / price - 1) * 100
        if dev > cfg["maxDevPct"]: return False, "price_deviation", "live price %.2f%% away from the signal bar (spread / gap abort)" % dev
    if ts_ms and now - ts_ms / 1000 > cfg["staleSec"] + TF_SEC.get(b.get("tf"), 3600): return False, "stale_data", "signal bar is stale"
    return True, "", ""

STATE_KEYS = ("cash", "pos", "trades", "lastBar", "status", "dayStart", "dayEq", "halted", "shieldUntil", "price", "equity")

def shared_bots_class(serve):
    """BgBots sharing bots.json across processes under a file lock. owns_state=True (bot process): config from disk, trading state from
    memory. owns_state=False (launcher): edits configs only; close / macro shield become commands for the bot process."""
    class SharedBots(serve.BgBots):
        owns_state = False
        cmd = None  # launcher: callable(cmd, arg)

        def _merge_from_disk(self):
            try: disk = json.loads(self.path.read_text()).get("bots") or []
            except Exception: return
            mem = {b["id"]: b for b in self.bots}; out = []
            for d in disk[: self.MAX]:
                try: nb = self.clean_bot(d, d)
                except ValueError: continue
                m = mem.get(nb["id"])
                if m is not None:
                    for k in STATE_KEYS:
                        if k in m: nb[k] = m[k]
                out.append(nb)
            self.bots = out

        def save(self):
            with FileLock(self.path):
                if self.owns_state:
                    with self.lock: self._merge_from_disk()
                serve.BgBots.save(self)

        def upsert(self, b):
            with FileLock(self.path):
                if self.owns_state:
                    with self.lock: self._merge_from_disk()
                else: self.load()
                with self.lock:
                    cur = next((x for x in self.bots if x["id"] == str(b.get("id", ""))), None)
                    if cur is None and len(self.bots) >= self.MAX: raise ValueError("at most %d background bots" % self.MAX)
                    nb = self.clean_bot(b, cur)
                    if cur and (cur["sym"] != nb["sym"] or cur["tf"] != nb["tf"] or cur["spec"] != nb["spec"]) and cur.get("pos"):
                        raise ValueError("close this bot's position before changing its market, timeframe or rules")
                    if cur: self.bots[self.bots.index(cur)] = nb
                    else: self.bots.append(nb)
                serve.BgBots.save(self)
            return nb

        def remove(self, bid):
            with FileLock(self.path):
                if not self.owns_state: self.load()
                with self.lock: self.bots = [x for x in self.bots if x["id"] != bid]
                serve.BgBots.save(self)

        def close(self, bid):
            if self.owns_state or not self.cmd: return serve.BgBots.close(self, bid)
            self.cmd("close", bid); return None  # the bot process closes it on its next pass

        def shield(self, pause=True, tighten=False, minutes=60, stop_pct=1.0, clear=False):
            if self.owns_state or not self.cmd: return serve.BgBots.shield(self, pause, tighten, minutes, stop_pct, clear)
            self.cmd("shield", {"pause": pause, "tighten": tighten, "minutes": minutes, "stop_pct": stop_pct, "clear": clear}); return len(self.bots)

        def public(self):
            if not self.owns_state: self.load()
            return serve.BgBots.public(self)
    return SharedBots

# ════════════════════════════════════════ child processes ════════════════════════════════════════
def _boot_child(data_dir, proc):
    os.environ["EXTERM_DATA"] = str(data_dir)
    sys.argv = [sys.argv[0] if sys.argv else "serve.py", "--no-browser", "--headless"]
    here = str(pathlib.Path(__file__).resolve().parent)
    if here not in sys.path: sys.path.insert(0, here)
    import serve  # noqa: E402  (a fresh copy in this process; its __main__ block does not run)
    c = db(data_dir); beat(c, proc, "starting")
    return serve, c

def proc_ingest(data_dir):
    """Process 1: one upstream PriceFeed for every bot / alert symbol, published to SQLite for every reader."""
    serve, c = _boot_child(data_dir, "ingest")
    def wanted():
        syms = []
        for f, key in (("bots.json", "bots"), ("alerts.json", "alerts")):
            try: syms += [x.get("sym") for x in (json.loads((pathlib.Path(data_dir) / f).read_text()).get(key) or []) if x.get("active", True)]
            except Exception: pass
        return [s for s in syms if s]
    feed = serve.PriceFeed(extra=wanted)
    threading.Thread(target=feed.run, daemon=True, name="feed").start()
    while True:
        try:
            rows = []
            with feed.lock:
                for s, v in feed.cache.items():
                    p = v.get("price") if isinstance(v, dict) else None
                    if p: rows.append((s, float(p), float(v.get("ts") or time.time())))
            if rows: c.executemany("INSERT INTO prices(sym, price, ts) VALUES(?,?,?) ON CONFLICT(sym) DO UPDATE SET price=excluded.price, ts=excluded.ts", rows)
            beat(c, "ingest", "%d symbols live" % len(rows))
        except Exception as e:
            try: beat(c, "ingest", "error: %s" % str(e)[:120])
            except Exception: pass
        time.sleep(1.0)

def firewall_bots(serve, c, data_dir):
    """Process 2's bot engine: paper bots whose every entry passes risk_check; trades and blocks go to the digest, signals to the outbox."""
    Shared = shared_bots_class(serve)
    class FirewallBots(Shared):
        owns_state = True
        def _trade(self, b, side, price, reason, ts):
            if side == "buy" and not b.get("pos"):
                cfg = load_cfg(data_dir); rec = armed(data_dir)
                row = c.execute("SELECT price, ts FROM prices WHERE sym=?", (b["sym"],)).fetchone()
                ok, gate, why = risk_check(b, price, ts, self.now(), cfg, {"price": row[0], "ts": row[1]} if row else None, (rec or {}).get("cashCap") or 0)
                if not ok:
                    digest_add(c, "block", b["name"], "%s entry blocked by %s: %s" % (b["sym"], gate, why)); b["status"] = "firewall: " + why
                    return None
                cap = min((rec or {}).get("cashCap") or float("inf"), cfg["cashCap"] or float("inf"), b.get("capital") or float("inf"))
                reserve = max(0.0, b["cash"] - cap)  # zero-overdraft: size from at most the verified cash cap
                b["cash"] -= reserve
                try: t = serve.BgBots._trade(self, b, side, price, reason, ts)
                finally: b["cash"] += reserve
            else:
                t = serve.BgBots._trade(self, b, side, price, reason, ts)
            if t:
                digest_add(c, "trade", b["name"], "%s %s %s @ %s%s" % (b["name"], ("SHORT" if t.get("short") else "BUY") if t["side"] == "buy" else "EXIT", b["sym"], "{:,.8g}".format(t["price"]), "" if t.get("pnl") is None else " P&L {:+,.2f}".format(t["pnl"])))
                url = load_cfg(data_dir).get("webhook")
                if url:
                    p = b.get("pos") or {}
                    enqueue(c, "webhook", {"url": url, "signal": {"bot": b["name"], "symbol": b["sym"], "side": t["side"], "short": bool(t.get("short")), "price": t["price"], "qty": t["qty"],
                                                                  "stop_loss": p.get("sl"), "take_profit": p.get("tp"), "reason": reason, "ts": t["ts"], "source": "exterm-daemon"}})
            return t
        def tick(self):
            for cid, cmd, arg in c.execute("SELECT id, cmd, arg FROM commands WHERE done=0 ORDER BY id").fetchall():
                try:
                    a = json.loads(arg)
                    if cmd == "close": serve.BgBots.close(self, a)
                    elif cmd == "shield" and isinstance(a, dict): serve.BgBots.shield(self, **{k: a[k] for k in ("pause", "tighten", "minutes", "stop_pct", "clear") if k in a})
                except Exception as e:
                    digest_add(c, "error", "", "command %s failed: %s" % (cmd, str(e)[:100]))
                finally:
                    c.execute("UPDATE commands SET done=1 WHERE id=?", (cid,))
            with FileLock(self.path):
                with self.lock: self._merge_from_disk()
            return serve.BgBots.tick(self)
    return FirewallBots(path=pathlib.Path(data_dir) / "bots.json", notify=lambda text: enqueue(c, "notify", {"text": text}))

def proc_bots(data_dir):
    """Process 2: bots + 10-gate risk firewall + Wake-Up digest."""
    serve, c = _boot_child(data_dir, "bots")
    bots = firewall_bots(serve, c, data_dir)
    while True:
        try:
            made = bots.tick(); beat(c, "bots", "%d bots, %d trades this pass" % (len(bots.bots), len(made)))
        except Exception as e:
            try: beat(c, "bots", "error: %s" % str(e)[:120])
            except Exception: pass
        time.sleep(max(5, int(load_cfg(data_dir)["every"])))

def sign(key, ts, body):
    return "sha256=" + hmac.new(key, str(ts).encode() + b"." + body, hashlib.sha256).hexdigest()

def dispatch_once(c, data_dir, serve, send_text=None, post=None, now=None):
    """Deliver due outbox rows (never raises). Webhooks need a verified arming receipt and an allowed (loopback / LAN) target."""
    now = now or time.time(); sent = 0
    for rid, kind, payload, tries in c.execute("SELECT id, kind, payload, tries FROM outbox WHERE status='pending' AND next_at<=? ORDER BY id LIMIT 20", (now,)).fetchall():
        try:
            p = json.loads(payload)
            if kind == "notify":
                (send_text or (lambda t: serve.Alerts(path=pathlib.Path(data_dir) / "alerts.json").send(t)))(p.get("text", ""))
            elif kind == "webhook":
                rec = armed(data_dir)
                if rec is None: raise PermissionError("not armed: complete the 5-step arming receipt first")
                url = p.get("url", "")
                if not serve.hook_target_ok(url): raise PermissionError("webhook target not allowed (loopback or allow-listed LAN only)")
                body = json.dumps(dict(p.get("signal") or {}, armedAt=rec["ts"]), separators=(",", ":")).encode()
                ts = int(now); hdr = {"Content-Type": "application/json", "User-Agent": "ExTerm-Daemon/17.0", "X-ExTerm-Timestamp": str(ts), "X-ExTerm-Signature": sign(daemon_key(data_dir), ts, body)}
                if post: post(url, body, hdr)
                else:
                    with urllib.request.build_opener(serve.NoRedirect()).open(urllib.request.Request(url, data=body, headers=hdr, method="POST"), timeout=10) as r: r.read(4096)
            else:
                raise PermissionError("unknown outbox kind")
            c.execute("UPDATE outbox SET status='sent', tries=? WHERE id=?", (tries + 1, rid)); sent += 1
        except PermissionError as e:
            c.execute("UPDATE outbox SET status='blocked', last_err=? WHERE id=?", (str(e)[:200], rid))
        except Exception as e:
            t = tries + 1
            c.execute("UPDATE outbox SET tries=?, next_at=?, last_err=?, status=? WHERE id=?", (t, now + min(3600, 5 * 2 ** t), str(e)[:200], "failed" if t >= 8 else "pending", rid))
    return sent

def proc_dispatch(data_dir):
    """Process 3: outbound notices + signed webhooks, retried with backoff, never blocking the bots."""
    serve, c = _boot_child(data_dir, "dispatch")
    while True:
        try:
            n = dispatch_once(c, data_dir, serve); pend = c.execute("SELECT COUNT(*) FROM outbox WHERE status='pending'").fetchone()[0]
            beat(c, "dispatch", "sent %d, %d pending" % (n, pend))
        except Exception as e:
            try: beat(c, "dispatch", "error: %s" % str(e)[:120])
            except Exception: pass
        time.sleep(1.0)

# ════════════════════════════════════════ supervisor (launcher process) ════════════════════════════════════════
PROCS = {"ingest": proc_ingest, "bots": proc_bots, "dispatch": proc_dispatch}

class Supervisor:
    """Starts the three processes, restarts any that exit or stop sending heartbeats (exponential backoff, max 60 s)."""
    def __init__(self, data_dir, procs=None, stale=90.0):
        import multiprocessing as mp
        self.data_dir = str(data_dir); self.ctx = mp.get_context("spawn"); self.procs = procs or PROCS; self.stale = stale
        self.p, self.t0 = {}, {}; self.restarts = {k: 0 for k in self.procs}; self.next_at = {k: 0.0 for k in self.procs}; self.stop = False
        ensure_db(self.data_dir)

    def _spawn(self, name):
        pr = self.ctx.Process(target=self.procs[name], args=(self.data_dir,), name="exterm-" + name, daemon=True); pr.start()
        self.p[name] = pr; self.t0[name] = time.time()

    def check(self):
        c = db(self.data_dir)
        try: hb = {r[0]: r[1] for r in c.execute("SELECT proc, ts FROM heartbeat").fetchall()}
        finally: c.close()
        now = time.time()
        for name in self.procs:
            pr = self.p.get(name)
            if pr is not None and pr.is_alive() and now - self.t0[name] > self.stale and now - hb.get(name, 0) > self.stale:
                sys.stderr.write("[ExTerm daemon] %s stopped sending heartbeats: restarting\n" % name)
                try: pr.terminate(); pr.join(5)
                except Exception: pass
            if (pr is None or not pr.is_alive()) and now >= self.next_at[name]:
                if pr is not None:
                    self.restarts[name] += 1; self.next_at[name] = now + min(60, 2 ** min(self.restarts[name], 6))
                    sys.stderr.write("[ExTerm daemon] %s exited (code %s): restarting\n" % (name, pr.exitcode))
                self._spawn(name)

    def run(self):
        while not self.stop:
            try: self.check()
            except Exception as e: sys.stderr.write("[ExTerm daemon] watchdog: %s\n" % str(e)[:120])
            time.sleep(2)

    def shutdown(self):
        self.stop = True
        for pr in self.p.values():
            try: pr.terminate()
            except Exception: pass

def status(data_dir, sup=None, hours=24):
    """Read-only daemon status + the overnight Wake-Up Digest (no secrets)."""
    c = db(data_dir)
    try:
        now = time.time()
        hb = [{"proc": r[0], "age": round(now - r[1], 1), "pid": r[2], "info": r[3], "ok": now - r[1] < 60} for r in c.execute("SELECT proc, ts, pid, info FROM heartbeat ORDER BY proc")]
        ob = dict(c.execute("SELECT status, COUNT(*) FROM outbox GROUP BY status").fetchall())
        rows = c.execute("SELECT ts, kind, bot, line FROM digest WHERE ts>=? ORDER BY id DESC LIMIT 200", (now - hours * 3600,)).fetchall()
    finally:
        c.close()
    trades = [r for r in rows if r[1] == "trade"]; blocks = [r for r in rows if r[1] == "block"]; gates = {}
    for r in blocks:
        g = next((x for x in GATES if (" by %s:" % x) in r[3]), "other"); gates[g] = gates.get(g, 0) + 1
    rec = armed(data_dir)
    summary = "Overnight: %d trade%s, %d entr%s blocked by the risk firewall%s." % (len(trades), "" if len(trades) == 1 else "s", len(blocks), "y" if len(blocks) == 1 else "ies", (" (top gate: %s)" % max(gates, key=gates.get)) if gates else "")
    return {"heartbeats": hb, "outbox": ob, "armed": bool(rec), "armedAt": rec["ts"] if rec else None, "restarts": dict(sup.restarts) if sup else {},
            "digest": {"hours": hours, "trades": len(trades), "blocked": len(blocks), "byGate": gates, "summary": summary,
                       "lines": [{"ts": int(r[0] * 1000), "kind": r[1], "bot": r[2], "line": r[3]} for r in rows[:50]]}}
