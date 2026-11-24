#!/usr/bin/env python3
# Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited.
"""ExTerm launcher: serves the app at http://localhost:8765 and provides a small
CORS proxy (/proxy?u=...) for the public market-data APIs, in case your browser blocks
direct requests. Standard library only. Usage:  python3 serve.py [port]   ·   health check:  python3 serve.py --doctor [--offline]"""
import http.server, hashlib, json, time, os, pathlib, shutil, socket, ssl, subprocess, sys, urllib.parse, urllib.request, webbrowser

ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
PORT = int(ARGS[0]) if ARGS else 8765
HEADLESS = "--headless" in sys.argv  # v17.0: 24/7 boxes / Docker: never open a browser
NO_BROWSER = "--no-browser" in sys.argv or HEADLESS
LAN = "--lan" in sys.argv  # v17.0: phone pairing over Wi-Fi / Tailscale (QR code); off by default
DAEMON = "--bot-daemon" in sys.argv  # v17.0: 3-process 24/7 daemon (exterm_ops.py)
OPS = None  # exterm_ops, imported only for --lan / --bot-daemon
SUP = None  # daemon supervisor
PAIR = ""  # --lan pairing secret (fresh per launch)
HERE = pathlib.Path(__file__).resolve().parent
APP = HERE / "exterm.html"
if not APP.exists():
    APP = HERE / "dist" / "exterm.html"
ALLOW = {  # only these public API hosts can be proxied
    "api.exchange.coinbase.com", "api.coinbase.com", "api.kraken.com", "api.coingecko.com",
    "api.alternative.me", "min-api.cryptocompare.com", "ethereum-rpc.publicnode.com",
    "eth.llamarpc.com", "1rpc.io", "cloudflare-eth.com", "blockchain.info", "mempool.space",
    "router.huggingface.co", "openrouter.ai", "api.openai.com",
    "query1.finance.yahoo.com", "query2.finance.yahoo.com",
    "api.mainnet-beta.solana.com", "solana-rpc.publicnode.com", "solana.drpc.org", "solana.api.onfinality.io", "api.dexscreener.com", "lite-api.jup.ag", "api.geckoterminal.com", "api.binance.com", "testnet.binance.vision", "api.bybit.com", "api.hyperliquid.xyz", "www.okx.com", "api-testnet.bybit.com", "api.alpaca.markets", "paper-api.alpaca.markets", "data.alpaca.markets", "api.x.com", "api.twitter.com", "api.stocktwits.com", "www.reddit.com",
    "api.worldmonitor.app", "api.x.ai", "stats-data.hyperliquid.xyz",
    "data.solanatracker.io", "api.helius.xyz", "api.rugcheck.xyz", "www.sec.gov", "data.sec.gov", "efts.sec.gov", "feeds.finance.yahoo.com", "production.dataviz.cnn.io",
}
# webhook gateway (v16.1): signals may only be POSTed to a bot you run yourself: 127.0.0.1 / localhost (http or https,
# never this launcher's own port), or a private-LAN host:port you allow-list over https with EXTERM_HOOK_ALLOW="192.168.1.20:8443,..."
import re as _re0
HOOK_LOOPBACK = {"127.0.0.1", "localhost", "::1"}
def _private_ip(h):
    m = _re0.match(r"^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$", h or "")
    if not m or any(int(x) > 255 for x in m.groups()): return False
    a, b = int(m.group(1)), int(m.group(2))
    return a == 10 or (a == 172 and 16 <= b <= 31) or (a == 192 and b == 168)
def _hook_lan():
    out = set()
    for x in _re0.split(r"[\s,]+", os.environ.get("EXTERM_HOOK_ALLOW", "")):
        m = _re0.match(r"^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$", x.strip())
        if m and _private_ip(m.group(1)) and 0 < int(m.group(2)) < 65536: out.add(m.group(1) + ":" + m.group(2))
    return out
def hook_target_ok(url):
    """True only for loopback (any port but the launcher's) or an allow-listed private-LAN host:port over https."""
    try:
        u = urllib.parse.urlparse(str(url)); port = u.port
    except ValueError:
        return False
    host = (u.hostname or "").lower()
    if u.scheme not in ("http", "https") or u.username or u.password or not host: return False
    port = port or (443 if u.scheme == "https" else 80)
    if host in HOOK_LOOPBACK: return port != PORT
    return u.scheme == "https" and _private_ip(host) and (host + ":" + str(port)) in _hook_lan()
ALLOW_SUFFIX = (".helius-rpc.com", ".quiknode.pro", ".alchemy.com", ".ankr.com", ".chainstack.com", ".syndica.io", ".shyft.to", ".extrnode.com")
CTX = ssl.create_default_context()
import secrets, hmac as _hmac, threading, re, io as _io
from concurrent.futures import ThreadPoolExecutor
from collections import deque
TOKEN = secrets.token_urlsafe(24)  # fresh per launch; injected into the page, required on every proxy call
_rl = {"t": time.time(), "tok": 60.0}; _rl_lock = threading.Lock()
def rate_ok(cost=1.0, rate=30.0, cap=60.0):
    with _rl_lock:
        now = time.time(); _rl["tok"] = min(cap, _rl["tok"] + (now - _rl["t"]) * rate); _rl["t"] = now
        if _rl["tok"] < cost: return False
        _rl["tok"] -= cost; return True
MAX_BYTES = 25 * 1024 * 1024  # cap proxied responses (resource exhaustion)
SEC_HEADERS = {
    "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
}

def host_allowed(host):
    host = (host or "").lower()
    return host in ALLOW or host.endswith(ALLOW_SUFFIX)

class SafeRedirect(urllib.request.HTTPRedirectHandler):
    """Security: only follow redirects that stay on https and on the allow-list (no SSRF via open redirects)."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        u = urllib.parse.urlparse(newurl)
        if u.scheme != "https" or not host_allowed(u.hostname):
            raise urllib.error.HTTPError(newurl, 403, "redirect to a non-allow-listed host blocked", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)

OPENER = urllib.request.build_opener(SafeRedirect(), urllib.request.HTTPSHandler(context=CTX))

# --- v17.0 upstream shield: last-good cache + single-flight coalescing + per-host 429 cooldown -------------------
# _EXTERM_LAST_GOOD[url]       = (timestamp, body_bytes, content_type)   last 200 OK of a credential-free GET
# _EXTERM_INFLIGHT[key]        = _Flight                                  one upstream call shared by identical requests
# _EXTERM_HOST_COOLDOWN[host]  = {"until", "n", "since", "logged"}        exponential backoff after 429 / network errors
_EXTERM_LAST_GOOD = {}
_EXTERM_INFLIGHT = {}
_EXTERM_HOST_COOLDOWN = {}
_EXTERM_SHIELD_LOCK = threading.Lock()
_EXTERM_LAST_GOOD_MAX = 512
_CRED_HEADERS = ("Authorization", "x-api-key", "X-MBX-APIKEY", "API-Key", "API-Sign", "X-BAPI-API-KEY", "X-BAPI-SIGN",
                 "APCA-API-KEY-ID", "APCA-API-SECRET-KEY")

class UpstreamBlocked(Exception):
    """Raised instead of (or after) an upstream call: host in cooldown, 429, or network failure."""
    def __init__(self, status, retry_after, reason):
        super().__init__(reason); self.status = status; self.retry_after = retry_after; self.reason = reason

class _Flight:
    __slots__ = ("ev", "result", "error")
    def __init__(self):
        self.ev = threading.Event(); self.result = None; self.error = None

def _shield_note(host, msg):
    """At most one concise line per host per cooldown window: no tracebacks, no log storms."""
    with _EXTERM_SHIELD_LOCK:
        cd = _EXTERM_HOST_COOLDOWN.get(host)
        if cd is not None:
            if cd["logged"] >= cd["since"]:
                return
            cd["logged"] = time.time()
    try:
        sys.stderr.write("[ExTerm] %s: %s\n" % (host, msg)); sys.stderr.flush()
    except Exception:
        pass

def _shield_strike(host, retry_after=None, net=False):
    """Register a 429 / network failure; returns seconds of cooldown. Honours Retry-After when the upstream sends one."""
    with _EXTERM_SHIELD_LOCK:
        now = time.time()
        cd = _EXTERM_HOST_COOLDOWN.get(host)
        if cd is None or now > cd["until"] + 120:  # 2 quiet minutes after the last window forgive old strikes
            cd = {"until": 0.0, "n": 0, "logged": -1.0, "since": now}
            _EXTERM_HOST_COOLDOWN[host] = cd
        if now < cd["until"]:  # already cooling: a burst of parallel 429s is ONE strike (only Retry-After may extend the window)
            if retry_after: cd["until"] = max(cd["until"], now + min(60.0, retry_after))
            return cd["until"] - now
        cd["n"] += 1
        wait = min(60.0, (1.0 if net else 2.0) * (2 ** min(cd["n"] - 1, 10)))  # v17.1: never sit out more than 60 s (the page fails over to the next provider meanwhile)
        if retry_after:
            wait = max(wait, min(60.0, retry_after))
        if now >= cd["until"]:
            cd["since"] = now  # a new window: allow one new log line
        cd["until"] = max(cd["until"], now + wait)
        return cd["until"] - now

def _shield_clear(host):
    with _EXTERM_SHIELD_LOCK:
        _EXTERM_HOST_COOLDOWN.pop(host, None)

def _shield_cooldown_left(host):
    with _EXTERM_SHIELD_LOCK:
        cd = _EXTERM_HOST_COOLDOWN.get(host)
        return max(0.0, cd["until"] - time.time()) if cd else 0.0

def _retry_after_secs(headers):
    try:
        v = headers.get("Retry-After") if headers is not None else None
        return float(v) if v else None
    except (TypeError, ValueError):
        return None  # HTTP-date form: our own backoff applies

def shield_stale(url):
    with _EXTERM_SHIELD_LOCK:
        return _EXTERM_LAST_GOOD.get(url)

def _shield_remember(url, body, ctype):
    with _EXTERM_SHIELD_LOCK:
        _EXTERM_LAST_GOOD.pop(url, None)
        _EXTERM_LAST_GOOD[url] = (time.time(), body, ctype)
        while len(_EXTERM_LAST_GOOD) > _EXTERM_LAST_GOOD_MAX:  # insertion-ordered: evict the oldest
            _EXTERM_LAST_GOOD.pop(next(iter(_EXTERM_LAST_GOOD)))

import http.client as _hc
class _ConnPool:
    """Persistent keep-alive HTTPS connections per allow-listed host (no TLS handshake per request). Anything that is not a
    plain answer (redirects) is handed back to the caller, which re-issues it through OPENER and its SafeRedirect policy."""
    MAX_IDLE = 4
    IDLE_SEC = 8.0  # CDNs drop idle keep-alives silently; reusing a dead one would hang until the timeout instead of failing fast
    def __init__(self): self.idle = {}; self.lock = threading.Lock(); self.stats = {"new": 0, "reused": 0, "expired": 0}
    def _get(self, host):
        now = time.time(); dead = []
        with self.lock:
            q = self.idle.get(host) or []
            while q:
                conn, t = q.pop()
                if now - t <= self.IDLE_SEC: self.stats["reused"] += 1; break
                dead.append(conn); self.stats["expired"] += 1
            else:
                conn = None
            if conn is None: self.stats["new"] += 1
        for d in dead: d.close()
        if conn is not None: return conn, True
        return _hc.HTTPSConnection(host, timeout=30, context=CTX), False
    def _put(self, host, conn):
        with self.lock:
            q = self.idle.setdefault(host, [])
            if len(q) < self.MAX_IDLE: q.append((conn, time.time())); return
        conn.close()
    def request(self, url, method, data, hdr, timeout, max_bytes):
        """(status, headers, body) or None when the caller must fall back to OPENER (redirect / non-https)."""
        u = urllib.parse.urlparse(url)
        if u.scheme != "https" or u.port not in (None, 443): return None
        path = (u.path or "/") + ("?" + u.query if u.query else "")
        for attempt in (0, 1):  # one retry on a connection the server had already closed
            conn, reused = self._get(u.hostname); conn.timeout = timeout
            try:
                h = dict(hdr); h.setdefault("Connection", "keep-alive")
                conn.request(method, path, body=data, headers=h)
                r = conn.getresponse(); body = r.read(max_bytes + 1)
                if r.will_close: conn.close()
                else: self._put(u.hostname, conn)
                if 300 <= r.status < 400: return None
                return r.status, r.headers, body
            except (_hc.RemoteDisconnected, ConnectionResetError, BrokenPipeError, _hc.CannotSendRequest, _hc.BadStatusLine):
                conn.close()
                if not reused or attempt: raise
            except Exception:
                conn.close(); raise
POOL = _ConnPool()

def pack_ohlcv(host, body):
    """Compact array-of-arrays [[t,o,h,l,c,v], ...] (t in seconds, 10 significant digits) from the candle formats ExTerm proxies:
    Binance klines (12 columns), Coinbase [t,l,h,o,c,v], Kraken OHLC, Bybit kline, GeckoTerminal ohlcv_list. None if unknown."""
    try: j = json.loads(body)
    except Exception: return None
    rows = None; h = (host or "").lower()
    if h.endswith("binance.com") and isinstance(j, list): rows = [[k[0] / 1000, k[1], k[2], k[3], k[4], k[5]] for k in j]
    elif h == "api.exchange.coinbase.com" and isinstance(j, list): rows = [[k[0], k[3], k[2], k[1], k[4], k[5]] for k in j]
    elif h == "api.kraken.com" and isinstance(j, dict):
        res = j.get("result") or {}; key = next((k for k in res if k != "last"), None)
        if key: rows = [[k[0], k[1], k[2], k[3], k[4], k[6]] for k in res[key]]
    elif h.endswith("bybit.com") and isinstance(j, dict): rows = [[int(k[0]) / 1000, k[1], k[2], k[3], k[4], k[5]] for k in ((j.get("result") or {}).get("list") or [])]
    elif h == "api.geckoterminal.com" and isinstance(j, dict): rows = (((j.get("data") or {}).get("attributes") or {}).get("ohlcv_list"))
    if not rows: return None
    out = []
    for k in rows:
        try: out.append([int(float(k[0]))] + [float("%.10g" % float(x)) for x in k[1:6]])
        except (TypeError, ValueError, IndexError): continue
    out.sort(key=lambda r: r[0])
    return json.dumps(out, separators=(",", ":")).encode()

def shield_fetch(url, method="GET", data=None, hdr=None, timeout=30, max_bytes=None, opener=None):
    """Fetch through the shield. Identical concurrent requests share ONE upstream call.
    Returns (status, body, content_type). Raises urllib.error.HTTPError (non-429 upstream error; body in .exterm_body)
    or UpstreamBlocked (429, host cooling down, network failure)."""
    hdr = hdr or {}; max_bytes = max_bytes or MAX_BYTES; opener = opener or OPENER
    host = (urllib.parse.urlparse(url).hostname or "").lower()
    left = _shield_cooldown_left(host)
    if left > 0:
        raise UpstreamBlocked(429, left, "upstream rate-limited; cooling down")
    cred = sorted((k.lower(), str(hdr[k])) for k in hdr if k in _CRED_HEADERS)
    key = hashlib.sha256(repr((method, url, data or b"", cred)).encode("utf-8", "surrogateescape")).hexdigest()
    with _EXTERM_SHIELD_LOCK:
        fl = _EXTERM_INFLIGHT.get(key); leader = fl is None
        if leader:
            fl = _EXTERM_INFLIGHT[key] = _Flight()
    if not leader:
        fl.ev.wait(timeout + 5)
        if fl.error is not None:
            raise fl.error
        if fl.result is None:
            raise UpstreamBlocked(504, 2.0, "shared upstream call timed out")
        return fl.result
    try:
        try:
            pooled = POOL.request(url, method, data, hdr, timeout, max_bytes) if opener is OPENER else None
            if pooled is not None:
                st, rh, body = pooled
                if st >= 400: raise urllib.error.HTTPError(url, st, rh.get("Reason", "") or str(st), rh, _io.BytesIO(body))
                if len(body) > max_bytes: raise UpstreamBlocked(502, 0, "upstream response too large")
                res = (st, body, rh.get("Content-Type", "application/json"))
            else:
                req = urllib.request.Request(url, data=data, headers=hdr, method=method)
                with opener.open(req, timeout=timeout) as r:
                    body = r.read(max_bytes + 1)
                    if len(body) > max_bytes:
                        raise UpstreamBlocked(502, 0, "upstream response too large")
                    res = (r.status, body, r.headers.get("Content-Type", "application/json"))
            _shield_clear(host)
            if res[0] == 200 and method == "GET" and not cred:
                _shield_remember(url, res[1], res[2])
            fl.result = res
            return res
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = _shield_strike(host, _retry_after_secs(e.headers))
                _shield_note(host, "HTTP 429, cooling down %.0fs (serving last-good data meanwhile)" % wait)
                err = UpstreamBlocked(429, wait, "upstream rate-limited (HTTP 429)")
            else:
                try:
                    body = e.read(min(max_bytes, 1024 * 1024)) if e.fp else b""
                except Exception:
                    body = b""
                err = urllib.error.HTTPError(e.url, e.code, e.reason, e.headers, None); err.exterm_body = body
            fl.error = err
            raise err
        except UpstreamBlocked as e:
            fl.error = e; raise
        except Exception as e:
            wait = _shield_strike(host, net=True)
            _shield_note(host, "network error (%s), backing off %.0fs" % (type(e).__name__, wait))
            err = UpstreamBlocked(502, wait, "upstream unreachable: %s" % str(e)[:100])
            fl.error = err
            raise err
    finally:
        with _EXTERM_SHIELD_LOCK:
            _EXTERM_INFLIGHT.pop(key, None)
        fl.ev.set()

class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Notifications and the local-model bridge never follow redirects (a redirect could point anywhere)."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(newurl, code, "redirects are not followed", headers, fp)

NOTIFY_OPENER = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPSHandler(context=CTX))
LOCAL_OPENER = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPHandler())

VERSION = "18.0"
STARTED = time.time()
CACHE_STATS = {"hits": 0, "total": 0}  # /api/feed symbols answered from RAM vs asked for (Grok telemetry strip)
OLD_DATA_DIR = pathlib.Path.home() / (".nova" + "term")  # pre-v15 data folder, moved to ~/.exterm on first start
DATA_DIR = pathlib.Path(os.environ.get("EXTERM_DATA") or os.environ.get("NOVATERM_DATA") or (pathlib.Path.home() / ".exterm"))

def migrate_data_dir(old=None, new=None):
    """Move the pre-v15 data folder to ~/.exterm once, so saved alerts, bots and state survive the rename. Never overwrites."""
    old, new = pathlib.Path(old or OLD_DATA_DIR), pathlib.Path(new or DATA_DIR)
    if not old.is_dir(): return False
    if new.exists():
        if new.is_dir() and not any(new.iterdir()): new.rmdir()  # an empty folder from an earlier run holds nothing to protect
        else: print("Both %s and %s exist: keeping %s, the old folder is left untouched" % (old, new, new)); return False
    try: shutil.move(str(old), str(new)); return True
    except OSError as e: print("couldn't move %s to %s: %s" % (old, new, e)); return False
OLLAMA = "http://127.0.0.1:11434"
OLLAMA_PATHS = {"api/tags", "v1/models", "v1/chat/completions"}  # the only local-model routes the page may use

def ollama_up(timeout=0.6):
    try:
        with urllib.request.urlopen(urllib.request.Request(OLLAMA + "/api/tags"), timeout=timeout) as r:
            return r.status == 200
    except Exception:
        return False

# ───────── background price alerts: keep watching after the browser tab is closed ─────────
NOTIFY_HOSTS = {"api.telegram.org", "discord.com", "discordapp.com"}
TG_TOKEN_RX = __import__("re").compile(r"^\d{5,12}:[A-Za-z0-9_-]{30,50}$")
TG_CHAT_RX = __import__("re").compile(r"^-?\d{3,20}$|^@[A-Za-z0-9_]{4,40}$")
DISCORD_RX = __import__("re").compile(r"^https://(discord\.com|discordapp\.com)/api/webhooks/\d{5,25}/[A-Za-z0-9_-]{20,100}$")
SYM_RX = __import__("re").compile(r"^([A-Z0-9]{1,12}-USD|[A-Z][A-Z0-9.\-]{0,9}|oc:[a-z0-9_-]{2,20}:[A-Za-z0-9]{6,90})$")

class Alerts:
    """Persisted alert list + notification settings. Stored in ~/.exterm/alerts.json with owner-only permissions."""
    MAX = 50

    def __init__(self, path=None, fetch=None, send=None):
        self.path = pathlib.Path(path) if path else DATA_DIR / "alerts.json"
        self.lock = threading.Lock()
        self.fetch = fetch or self._fetch_price
        self.send = send or self._send
        self.alerts, self.cfg, self.hits, self.prices = [], {}, [], {}
        self.last_err = ""
        self.load()

    # ---- validation (everything from the page is untrusted) ----
    @staticmethod
    def clean_alert(a):
        if not isinstance(a, dict):
            return None
        sym, d, px = str(a.get("sym", ""))[:120], a.get("dir"), a.get("price")
        try:
            px = float(px)
        except (TypeError, ValueError):
            return None
        if not SYM_RX.match(sym) or d not in ("above", "below") or not (px > 0 and px < 1e15):
            return None
        aid = str(a.get("id", ""))[:40]
        if not __import__("re").match(r"^[A-Za-z0-9_-]{1,40}$", aid):
            return None
        return {"id": aid, "sym": sym, "dir": d, "price": px, "active": bool(a.get("active", True)), "note": str(a.get("note", ""))[:80].replace("<", "").replace(">", "")}

    @staticmethod
    def clean_cfg(c):
        c = c if isinstance(c, dict) else {}
        out = {"enabled": bool(c.get("enabled", True))}
        tok, chat, hook = (("" if str(c.get(k, "")).strip() == "-" else str(c.get(k, "")).strip()) for k in ("tgToken", "tgChat", "discord"))  # "-" means "clear it"
        if tok:
            if not TG_TOKEN_RX.match(tok): raise ValueError("Telegram bot token doesn't look right")
            out["tgToken"] = tok
        if chat:
            if not TG_CHAT_RX.match(chat): raise ValueError("Telegram chat ID doesn't look right")
            out["tgChat"] = chat
        if hook:
            if not DISCORD_RX.match(hook): raise ValueError("That isn't a Discord webhook URL")
            out["discord"] = hook
        return out

    def public(self):
        """What the page may read back: secrets are masked, never returned."""
        with self.lock:
            m = lambda v: ("•••• " + v[-4:]) if v else ""
            return {"alerts": self.alerts, "hits": self.hits[-30:], "enabled": self.cfg.get("enabled", True),
                    "telegram": bool(self.cfg.get("tgToken") and self.cfg.get("tgChat")), "tgToken": m(self.cfg.get("tgToken", "")), "tgChat": self.cfg.get("tgChat", ""),
                    "discord": m(self.cfg.get("discord", "")), "error": self.last_err, "prices": self.prices}

    def set_alerts(self, items):
        if not isinstance(items, list): raise ValueError("alerts must be a list")
        clean = [x for x in (self.clean_alert(a) for a in items[: self.MAX * 2]) if x][: self.MAX]
        with self.lock:
            self.alerts = clean
        self.save(); return len(clean)

    def set_cfg(self, c):
        new = self.clean_cfg(c)
        with self.lock:
            for k in ("tgToken", "tgChat", "discord"):  # an empty field keeps the stored secret; "-" clears it
                if c.get(k) == "-": self.cfg.pop(k, None)
                elif k in new: self.cfg[k] = new[k]
            self.cfg["enabled"] = new["enabled"]
        self.save()

    # ---- persistence ----
    def load(self):
        try:
            j = json.loads(self.path.read_text())
            self.alerts = [x for x in (self.clean_alert(a) for a in j.get("alerts", [])) if x][: self.MAX]
            try: self.cfg = self.clean_cfg(j.get("cfg", {}))
            except ValueError: self.cfg = {}
            self.hits = [h for h in j.get("hits", []) if isinstance(h, dict)][-30:]
        except Exception:
            pass

    def save(self):
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            fd = os.open(str(tmp), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w") as f:
                with self.lock:
                    json.dump({"alerts": self.alerts, "cfg": self.cfg, "hits": self.hits[-30:]}, f)
            os.replace(tmp, self.path)
            try: os.chmod(self.path, 0o600)
            except OSError: pass
        except Exception as e:
            self.last_err = "couldn't save alerts: " + str(e)[:80]

    # ---- prices (allow-listed public APIs only) ----
    def _get_json(self, url):
        u = urllib.parse.urlparse(url)
        if u.scheme != "https" or not host_allowed(u.hostname): raise ValueError("host not allowed")
        req = urllib.request.Request(url, headers={"User-Agent": "ExTerm-Alerts/1.0", "Accept": "application/json"})
        with OPENER.open(req, timeout=15) as r:
            return json.loads(r.read(2_000_000))

    def _fetch_price(self, sym):
        if sym.startswith("oc:"):
            _, chain, pool = sym.split(":", 2)
            ds = {"solana": "solana", "eth": "ethereum", "base": "base", "bsc": "bsc", "arbitrum": "arbitrum"}.get(chain, chain)
            j = self._get_json("https://api.dexscreener.com/latest/dex/pairs/%s/%s" % (ds, urllib.parse.quote(pool)))
            p = (j.get("pairs") or [{}])[0] if isinstance(j, dict) else {}
            return float(p.get("priceUsd"))
        if sym.endswith("-USD"):
            j = self._get_json("https://api.exchange.coinbase.com/products/%s/ticker" % urllib.parse.quote(sym))
            return float(j["price"])
        j = self._get_json("https://query1.finance.yahoo.com/v8/finance/chart/%s?range=1d&interval=1m" % urllib.parse.quote(sym))
        return float(j["chart"]["result"][0]["meta"]["regularMarketPrice"])

    # ---- notifications (only Telegram's and Discord's official endpoints) ----
    def _post(self, url, payload):
        u = urllib.parse.urlparse(url)
        if u.scheme != "https" or (u.hostname or "") not in NOTIFY_HOSTS: raise ValueError("notification host not allowed")
        req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json", "User-Agent": "ExTerm-Alerts/1.0"}, method="POST")
        with NOTIFY_OPENER.open(req, timeout=15) as r:
            return r.status

    def _send(self, text):
        sent = []
        with self.lock:
            cfg = dict(self.cfg)
        if cfg.get("tgToken") and cfg.get("tgChat"):
            self._post("https://api.telegram.org/bot%s/sendMessage" % cfg["tgToken"], {"chat_id": cfg["tgChat"], "text": text, "disable_web_page_preview": True}); sent.append("telegram")
        if cfg.get("discord"):
            self._post(cfg["discord"], self.discord_payload(text)); sent.append("discord")
        return sent

    def _post_multipart(self, url, fields, fname, data):
        """multipart/form-data POST (chart snapshot cards), same host allow-list and no-redirect opener as _post."""
        u = urllib.parse.urlparse(url)
        if u.scheme != "https" or (u.hostname or "") not in NOTIFY_HOSTS: raise ValueError("notification host not allowed")
        bnd = "exterm" + secrets.token_hex(12); parts = []
        for k, v in fields.items():
            parts.append(("--%s\r\nContent-Disposition: form-data; name=\"%s\"\r\n\r\n%s\r\n" % (bnd, k, v)).encode())
        parts.append(("--%s\r\nContent-Disposition: form-data; name=\"%s\"; filename=\"chart.png\"\r\nContent-Type: image/png\r\n\r\n" % (bnd, fname)).encode() + data + b"\r\n")
        body = b"".join(parts) + ("--%s--\r\n" % bnd).encode()
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "multipart/form-data; boundary=" + bnd, "User-Agent": "ExTerm-Alerts/1.0"}, method="POST")
        with NOTIFY_OPENER.open(req, timeout=20) as r:
            return r.status

    def send_card(self, text, png=b""):
        """Rich alert card: text + optional PNG chart snapshot (Telegram sendPhoto, Discord embed image). Text-only without a PNG."""
        if not png: return self.send(text)
        sent = []
        with self.lock:
            cfg = dict(self.cfg)
        if cfg.get("tgToken") and cfg.get("tgChat"):
            self._post_multipart("https://api.telegram.org/bot%s/sendPhoto" % cfg["tgToken"], {"chat_id": cfg["tgChat"], "caption": text[:1000]}, "photo", png); sent.append("telegram")
        if cfg.get("discord"):
            pl = self.discord_payload(text); pl["embeds"][0]["image"] = {"url": "attachment://chart.png"}
            self._post_multipart(cfg["discord"], {"payload_json": json.dumps(pl)}, "files[0]", png); sent.append("discord")
        return sent

    @staticmethod
    def discord_payload(text):
        """Rich Discord alert: the first line becomes an embed title, the rest its body, coloured by kind. Nothing pings anyone."""
        head, _, body = str(text).partition("\n")
        color = 0xEF4444 if ("🚨" in head or "CRITICAL" in head) else 0x8B5CF6 if "🤖" in head else 0xF59E0B if "🔔" in head else 0x22C55E
        emb = {"title": discord_escape(head)[:240], "color": color, "footer": {"text": "ExTerm · paper trading"}}
        if body.strip(): emb["description"] = discord_escape(body)[:1900]
        return {"content": "", "embeds": [emb], "allowed_mentions": {"parse": []}, "flags": 4}  # 4 = no link previews

    def redact(self, msg):
        for k in ("tgToken", "discord"):
            v = self.cfg.get(k)
            if v: msg = msg.replace(v, "••••")
        return msg

    @staticmethod
    def label(sym):
        return sym.split(":")[-1][:6] + "…" if sym.startswith("oc:") else sym.replace("-USD", "")

    def tick(self):
        """Check every active alert once. Returns the alerts that fired."""
        with self.lock:
            if not self.cfg.get("enabled", True): return []
            active = [a for a in self.alerts if a["active"]]
        fired, prices = [], {}
        for sym in sorted({a["sym"] for a in active}):
            try:
                p = self.fetch(sym)
                if p and p > 0: prices[sym] = p
            except Exception as e:
                self.last_err = "price for %s unavailable: %s" % (self.label(sym), str(e)[:60])
        for a in active:
            p = prices.get(a["sym"])
            if p is None: continue
            if (a["dir"] == "above" and p >= a["price"]) or (a["dir"] == "below" and p <= a["price"]):
                with self.lock:
                    a["active"] = False
                    hit = {"id": a["id"], "sym": a["sym"], "dir": a["dir"], "price": a["price"], "at": p, "ts": int(time.time() * 1000)}
                    self.hits.append(hit); self.hits = self.hits[-30:]
                fired.append(hit)
                text = "🔔 ExTerm alert: %s is %s %s (now %s)%s" % (self.label(a["sym"]), a["dir"], "{:,.8g}".format(a["price"]), "{:,.8g}".format(p), (" · " + a["note"]) if a.get("note") else "")
                try:
                    hit["sent"] = self.send(text)
                except Exception as e:
                    hit["sent"] = []; self.last_err = self.redact("notification failed: " + str(e)[:80])
        with self.lock:
            self.prices.update(prices)
        if fired: self.save()
        return fired

    def run(self, every=20):
        while True:
            try: self.tick()
            except Exception as e: self.last_err = str(e)[:100]
            time.sleep(every)

ALERTS = None

class _Bucket:
    def __init__(self, per_min): self.per, self.ts = per_min, []
    def ok(self):
        now = time.time(); self.ts = [t for t in self.ts if now - t < 60]
        if len(self.ts) >= self.per: return False
        self.ts.append(now); return True
NOTIFY_RL = _Bucket(20)

_ZW = "\u200b"
def neutralize(text):
    """Page-built notifications can contain token names chosen by strangers. Telegram and Discord turn URLs, bare domains
    and Markdown links into clickable links, so break those (zero-width space) and escape Discord Markdown."""
    t = re.sub(r"[\x00-\x08\x0b-\x1f\x7f\u202a-\u202e\u2066-\u2069]", "", str(text))
    t = t.replace("://", ":/" + _ZW + "/")
    t = re.sub(r"\.(?=[A-Za-z])", "." + _ZW, t)
    return t

def discord_escape(text):
    """Discord renders Markdown (including [masked](links)) in webhook messages: show it literally."""
    return re.sub(r"([\\*_~`|\[\]()<>#@])", r"\\\1", str(text))

# ───────── no-code strategy interpreter + background paper bots (v13) ─────────
# A Python port of src/stratspec.js, kept bit-for-bit compatible (test/v13_parity checks both on the same candles),
# so a no-code strategy keeps paper trading here after the browser tab is closed. Paper only: nothing here can
# place a real order, and the only network calls are GETs to the allow-listed public candle APIs.
import math as _m, re as _re
NAN = float("nan")
_fin = lambda v: isinstance(v, (int, float)) and _m.isfinite(v)

def _sma(a, p):
    o = [NAN] * len(a); s = 0.0; c = 0
    for i, v in enumerate(a):
        s += v; c += 1
        if c > p: s -= a[i - p]; c -= 1
        if c == p: o[i] = s / p
    return o

def _smaN(a, p):
    o = [NAN] * len(a); s = 0.0; cnt = 0
    for i, v in enumerate(a):
        if _fin(v): s += v; cnt += 1
        else: s = 0.0; cnt = 0; continue
        if cnt > p: s -= a[i - p]; cnt = p
        if cnt == p: o[i] = s / p
    return o

def _ema(a, p):
    o = [NAN] * len(a); k = 2 / (p + 1); prev = NAN; cnt = 0; sm = 0.0
    for i, v in enumerate(a):
        if not _fin(v): continue
        if not _fin(prev):
            sm += v; cnt += 1
            if cnt == p: prev = sm / p; o[i] = prev
        else:
            prev = v * k + prev * (1 - k); o[i] = prev
    return o

def _rsi(a, p=14):
    o = [NAN] * len(a)
    if len(a) <= p: return o
    g = l = 0.0
    for i in range(1, p + 1):
        d = a[i] - a[i - 1]
        if d >= 0: g += d
        else: l -= d
    g /= p; l /= p
    o[p] = 100.0 if l == 0 else 100 - 100 / (1 + g / l)
    for i in range(p + 1, len(a)):
        d = a[i] - a[i - 1]
        g = (g * (p - 1) + (d if d > 0 else 0)) / p
        l = (l * (p - 1) + (-d if d < 0 else 0)) / p
        o[i] = 100.0 if l == 0 else 100 - 100 / (1 + g / l)
    return o

def _macd(a):
    ef, es = _ema(a, 12), _ema(a, 26)
    mac = [x - y for x, y in zip(ef, es)]
    sig = _ema(mac, 9)
    return mac, sig, [x - y for x, y in zip(mac, sig)]

def _bb(a, p):
    mid = _sma(a, p); up = [NAN] * len(a); lo = [NAN] * len(a)
    for i in range(p - 1, len(a)):
        v = sum((a[j] - mid[i]) ** 2 for j in range(i - p + 1, i + 1)); sd = _m.sqrt(v / p)
        up[i] = mid[i] + 2 * sd; lo[i] = mid[i] - 2 * sd
    return mid, up, lo

def _atr(c, p):
    n = len(c); tr = [c[0]["h"] - c[0]["l"] if i == 0 else max(c[i]["h"] - c[i]["l"], abs(c[i]["h"] - c[i - 1]["c"]), abs(c[i]["l"] - c[i - 1]["c"])) for i in range(n)]
    o = [NAN] * n
    if n < p: return o
    o[p - 1] = sum(tr[:p]) / p
    for i in range(p, n): o[i] = (o[i - 1] * (p - 1) + tr[i]) / p
    return o

def _adx(c, p):
    n = len(c); adx = [NAN] * n; trS = pS = mS = 0.0; prev = NAN; dxs = []
    for i in range(1, n):
        up = c[i]["h"] - c[i - 1]["h"]; dn = c[i - 1]["l"] - c[i]["l"]
        pdm = up if (up > dn and up > 0) else 0; mdm = dn if (dn > up and dn > 0) else 0
        tr = max(c[i]["h"] - c[i]["l"], abs(c[i]["h"] - c[i - 1]["c"]), abs(c[i]["l"] - c[i - 1]["c"]))
        if i <= p:
            trS += tr; pS += pdm; mS += mdm
            if i < p: continue
        else:
            trS = trS - trS / p + tr; pS = pS - pS / p + pdm; mS = mS - mS / p + mdm
        pdi = 100 * pS / trS if trS else 0; mdi = 100 * mS / trS if trS else 0
        sm = pdi + mdi; dx = 100 * abs(pdi - mdi) / sm if sm else 0
        if not _fin(prev):
            dxs.append(dx)
            if len(dxs) == p: prev = sum(dxs) / p; adx[i] = prev
        else:
            prev = (prev * (p - 1) + dx) / p; adx[i] = prev
    return adx

def _roll(a, p, fn):
    o = [NAN] * len(a)
    for i in range(p - 1, len(a)): o[i] = fn(a[i - p + 1:i + 1])
    return o

def _stochK(c, k):
    hh = _roll([x["h"] for x in c], k, max); ll = _roll([x["l"] for x in c], k, min)
    raw = [(((x["c"] - ll[i]) / (hh[i] - ll[i])) * 100 if hh[i] - ll[i] else 50) if _fin(hh[i]) else NAN for i, x in enumerate(c)]
    return _smaN(raw, 3)

def _vwap(c):
    pv = v = 0.0; o = []
    for k in c:
        tp = (k["h"] + k["l"] + k["c"]) / 3; pv += tp * k["v"]; v += k["v"]; o.append(pv / v if v else NAN)
    return o

def _prior(a, n, is_max):
    o = [NAN] * len(a)
    for i in range(n, len(a)):
        w = a[i - n:i]; o[i] = max(w) if is_max else min(w)
    return o

_CL = lambda c: [x["c"] for x in c]
SPEC_OPS = {
    "price": (None, lambda c, n: _CL(c)), "open": (None, lambda c, n: [x["o"] for x in c]), "high": (None, lambda c, n: [x["h"] for x in c]),
    "low": (None, lambda c, n: [x["l"] for x in c]), "volume": (None, lambda c, n: [x["v"] for x in c]),
    "volSma": ((20, 2, 400), lambda c, n: _sma([x["v"] for x in c], n)), "ema": ((20, 2, 400), lambda c, n: _ema(_CL(c), n)),
    "sma": ((50, 2, 400), lambda c, n: _sma(_CL(c), n)), "rsi": ((14, 2, 100), lambda c, n: _rsi(_CL(c), n)),
    "macd": (None, lambda c, n: _macd(_CL(c))[0]), "macdSignal": (None, lambda c, n: _macd(_CL(c))[1]), "macdHist": (None, lambda c, n: _macd(_CL(c))[2]),
    "bbUpper": ((20, 5, 200), lambda c, n: _bb(_CL(c), n)[1]), "bbMid": ((20, 5, 200), lambda c, n: _bb(_CL(c), n)[0]), "bbLower": ((20, 5, 200), lambda c, n: _bb(_CL(c), n)[2]),
    "atr": ((14, 2, 100), lambda c, n: _atr(c, n)), "adx": ((14, 2, 100), lambda c, n: _adx(c, n)), "stochK": ((14, 2, 100), lambda c, n: _stochK(c, n)),
    "vwap": (None, lambda c, n: _vwap(c)), "highest": ((20, 2, 400), lambda c, n: _prior([x["h"] for x in c], n, True)),
    "lowest": ((20, 2, 400), lambda c, n: _prior([x["l"] for x in c], n, False)),
    "change": ((10, 1, 400), lambda c, n: [((x["c"] / c[i - n]["c"] - 1) * 100) if i >= n and c[i - n]["c"] else NAN for i, x in enumerate(c)]),
    "const": (None, None),
}
SPEC_CMP = {">", "<", ">=", "<=", "crossAbove", "crossBelow"}
SPEC_TFX = (1, 2, 3, 4, 6, 8, 12, 24)
_TXT_RX = _re.compile("[\u0000-\u001f\u007f‪-‮⁦-⁩<>\"'`&\\\\]")
def _txt(s, n): return _TXT_RX.sub("", "" if s is None else str(s)).strip()[:n]

def spec_validate(raw):
    """Strict schema check, same rules as the page. Returns a normalised copy or raises ValueError."""
    if not isinstance(raw, dict): raise ValueError("not a strategy object")
    if len(json.dumps(raw)) > 20000: raise ValueError("strategy is too large")
    for k in raw:
        if k not in ("v", "name", "desc", "author", "entry", "exit", "risk", "tags", "dir"): raise ValueError('unknown field "%s"' % _txt(k, 30))
    if raw.get("v") != 1: raise ValueError('field "v" must be 1')
    if raw.get("dir") not in (None, "long", "short"): raise ValueError('"dir" must be long or short')
    name = _txt(raw.get("name"), 48)
    if len(name) < 2: raise ValueError("strategy needs a name")
    def operand(o):
        if not isinstance(o, dict): raise ValueError("missing value")
        for k in o:
            if k not in ("k", "n", "v", "tf"): raise ValueError('unknown operand field "%s"' % _txt(k, 20))
        k = o.get("k")
        if not isinstance(k, str) or k not in SPEC_OPS: raise ValueError('unknown indicator "%s"' % _txt(k, 20))
        tf = o.get("tf", 1)
        if tf is None: tf = 1
        if isinstance(tf, bool) or not isinstance(tf, (int, float)) or tf not in SPEC_TFX: raise ValueError("bad higher timeframe")
        tf = int(tf)
        if k == "const":
            v = o.get("v")
            if isinstance(v, bool) or not isinstance(v, (int, float)) or not _m.isfinite(v) or abs(v) > 1e12: raise ValueError("number is not valid")
            return {"k": "const", "v": v}
        rng = SPEC_OPS[k][0]; out = {"k": k}
        if rng:
            n = o.get("n", rng[0])
            if isinstance(n, bool) or not isinstance(n, (int, float)) or int(n) != n or not (rng[1] <= n <= rng[2]): raise ValueError("%s period out of range" % k)
            out["n"] = int(n)
        if tf > 1: out["tf"] = tf
        return out
    def group(g, need):
        if not isinstance(g, dict): 
            if need: raise ValueError("add at least one entry condition")
            return {"any": []}
        mode = "all" if isinstance(g.get("all"), list) else "any" if isinstance(g.get("any"), list) else None
        if not mode: raise ValueError('use "all" or "any"')
        lst = g[mode]
        if need and not lst: raise ValueError("add at least one entry condition")
        if len(lst) > 8: raise ValueError("at most 8 conditions")
        out = []
        for cd in lst:
            if not isinstance(cd, dict) or cd.get("op") not in SPEC_CMP: raise ValueError("bad comparison")
            a, b = operand(cd.get("a")), operand(cd.get("b"))
            if a["k"] == "const": raise ValueError("left side must be an indicator")
            out.append({"a": a, "op": cd["op"], "b": b})
        return {mode: out}
    entry, exit_ = group(raw.get("entry"), True), group(raw.get("exit"), False)
    r = raw.get("risk") or {}; risk = {}
    if not isinstance(r, dict): raise ValueError("risk must be an object")
    for k, lo, hi in (("sl", 0.1, 50), ("tp", 0.1, 500), ("trail", 0.1, 50)):
        v = r.get(k)
        if v in (None, ""): continue
        try: v = float(v)
        except (TypeError, ValueError): raise ValueError("risk value is not a number")
        if not (_m.isfinite(v) and lo <= v <= hi): raise ValueError("risk %s out of range" % k)
        risk[k] = round(v, 2)
    if not (exit_.get("all") or exit_.get("any")) and not risk: raise ValueError("add an exit rule or a stop / take-profit")
    out = {"v": 1, "name": name, "entry": entry, "exit": exit_, "risk": risk}
    if raw.get("dir") == "short": out["dir"] = "short"
    return out

def _barsec(c):
    m = None
    for i in range(1, min(len(c), 60)):
        d = c[i]["t"] - c[i - 1]["t"]
        if d > 0 and (m is None or d < m): m = d
    return m or 3600

def _series(c, o):
    fn = SPEC_OPS[o["k"]][1]
    if o.get("tf", 1) <= 1: return fn(c, o.get("n"))
    sec = _barsec(c) * o["tf"]; groups = []; idx = []
    for i, x in enumerate(c):
        g = int(x["t"] // sec)
        if not groups or groups[-1]["g"] != g: groups.append({"g": g, "t": g * sec, "o": x["o"], "h": x["h"], "l": x["l"], "c": x["c"], "v": x.get("v", 0) or 0, "end": i})
        else:
            G = groups[-1]; G["h"] = max(G["h"], x["h"]); G["l"] = min(G["l"], x["l"]); G["c"] = x["c"]; G["v"] += x.get("v", 0) or 0; G["end"] = i
        idx.append(len(groups) - 1)
    hs = fn(groups, o.get("n")); out = []
    for i in range(len(c)):
        g = idx[i]; done = g if groups[g]["end"] == i else g - 1
        out.append(hs[done] if done >= 0 else NAN)
    return out

def _key(o): return ("c%s" % o["v"]) if o["k"] == "const" else o["k"] + str(o.get("n") or "") + ("@%d" % o["tf"] if o.get("tf", 1) > 1 else "")

def spec_signals(spec, c):
    """Entry / exit booleans for every bar (the page's SP.compile evalGroup, ported)."""
    conds = (spec["entry"].get("all") or spec["entry"].get("any") or []) + (spec["exit"].get("all") or spec["exit"].get("any") or [])
    S = {}
    for cd in conds:
        for o in (cd["a"], cd["b"]):
            if o["k"] != "const" and _key(o) not in S: S[_key(o)] = _series(c, o)
    def ev(g, i):
        mode = "all" if "all" in g else "any"; lst = g.get(mode) or []
        if not lst: return False
        def one(cd):
            A = S[_key(cd["a"])]; B = None if cd["b"]["k"] == "const" else S[_key(cd["b"])]
            a0 = A[i]; b0 = B[i] if B is not None else cd["b"]["v"]
            if not (_fin(a0) and _fin(b0)): return False
            op = cd["op"]
            if op == ">": return a0 > b0
            if op == "<": return a0 < b0
            if op == ">=": return a0 >= b0
            if op == "<=": return a0 <= b0
            if i < 1: return False
            a1 = A[i - 1]; b1 = B[i - 1] if B is not None else cd["b"]["v"]
            if not (_fin(a1) and _fin(b1)): return False
            return (a1 <= b1 and a0 > b0) if op == "crossAbove" else (a1 >= b1 and a0 < b0)
        return all(one(x) for x in lst) if mode == "all" else any(one(x) for x in lst)
    return [ev(spec["entry"], i) for i in range(len(c))], [ev(spec["exit"], i) for i in range(len(c))]

TF_SEC = {"1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400}
BOT_ID_RX = _re.compile(r"^[A-Za-z0-9_-]{1,40}$")

class BgBots:
    """Paper bots that keep running in the launcher. Stored in ~/.exterm/bots.json (owner-only)."""
    MAX = 10

    def __init__(self, path=None, fetch=None, notify=None, now=None):
        self.path = pathlib.Path(path) if path else DATA_DIR / "bots.json"
        self.lock = threading.Lock(); self.bots = []; self.outbox = []
        self.fetch = fetch or self._fetch_candles
        self.notify = notify; self.now = now or time.time
        self.last_err = ""; self.load()

    @staticmethod
    def clean_bot(b, keep=None):
        if not isinstance(b, dict): raise ValueError("bot must be an object")
        bid = str(b.get("id", ""))[:40]
        if not BOT_ID_RX.match(bid): raise ValueError("bad bot id")
        sym = str(b.get("sym", ""))[:120]
        if not SYM_RX.match(sym): raise ValueError("unsupported symbol")
        tf = b.get("tf")
        if tf not in TF_SEC: raise ValueError("background bots support 1m, 5m, 15m, 1h, 4h and 1d")
        spec = spec_validate(b.get("spec"))
        def num(k, d, lo, hi):
            try: v = float(b.get(k, d))
            except (TypeError, ValueError): raise ValueError(k + " is not a number")
            if not (_m.isfinite(v) and lo <= v <= hi): raise ValueError(k + " out of range")
            return v
        cap = num("capital", 1000, 10, 1e9)
        out = {"id": bid, "name": _txt(b.get("name") or spec["name"], 60), "sym": sym, "tf": tf, "spec": spec, "capital": cap,
               "fee": num("fee", 0.001, 0, 0.05), "slip": num("slip", 0.0005, 0, 0.05), "maxDailyLoss": num("maxDailyLoss", 0, 0, 100),
               "notify": bool(b.get("notify", False)), "active": bool(b.get("active", True))}
        st = keep or {}
        out.update({"cash": st.get("cash", cap), "pos": st.get("pos"), "trades": st.get("trades", [])[-300:], "lastBar": st.get("lastBar", 0), "created": st.get("created", int(time.time() * 1000)),
                    "status": st.get("status", "waiting for the first candle"), "dayStart": st.get("dayStart"), "dayEq": st.get("dayEq"), "halted": st.get("halted", ""), "shieldUntil": BgBots._num0(st.get("shieldUntil"))})
        return out

    def upsert(self, b):
        with self.lock:
            cur = next((x for x in self.bots if x["id"] == str(b.get("id", ""))), None)
            if cur is None and len(self.bots) >= self.MAX: raise ValueError("at most %d background bots" % self.MAX)
            nb = self.clean_bot(b, cur)
            if cur and (cur["sym"] != nb["sym"] or cur["tf"] != nb["tf"] or cur["spec"] != nb["spec"]) and cur.get("pos"):
                raise ValueError("close this bot's position before changing its market, timeframe or rules")
            if cur: self.bots[self.bots.index(cur)] = nb
            else: self.bots.append(nb)
        self.save(); return nb

    def remove(self, bid):
        with self.lock: self.bots = [x for x in self.bots if x["id"] != bid]
        self.save()

    def public(self):
        with self.lock: return {"bots": json.loads(json.dumps(self.bots)), "error": self.last_err, "max": self.MAX}

    def load(self):
        try:
            j = json.loads(self.path.read_text()); out = []
            for b in (j.get("bots") or [])[: self.MAX]:
                try: out.append(self.clean_bot(b, b))
                except ValueError: pass
            self.bots = out
        except Exception: pass

    def save(self):
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True); tmp = self.path.with_suffix(".tmp")
            fd = os.open(str(tmp), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w") as f:
                with self.lock: json.dump({"bots": self.bots}, f)
            os.replace(tmp, self.path)
            try: os.chmod(self.path, 0o600)
            except OSError: pass
        except Exception as e: self.last_err = "couldn't save bots: " + str(e)[:80]

    # ---- candles: public, allow-listed APIs only ----
    def _get_json(self, url):
        u = urllib.parse.urlparse(url)
        if u.scheme != "https" or not host_allowed(u.hostname): raise ValueError("host not allowed")
        with OPENER.open(urllib.request.Request(url, headers={"User-Agent": "ExTerm-Bots/1.0", "Accept": "application/json"}), timeout=20) as r:
            return json.loads(r.read(5_000_000))

    def _fetch_candles(self, sym, tf):
        sec = TF_SEC[tf]
        if sym.startswith("oc:"):
            _, chain, pool = sym.split(":", 2)
            unit, agg = {60: ("minute", 1), 300: ("minute", 5), 900: ("minute", 15), 3600: ("hour", 1), 14400: ("hour", 4), 86400: ("day", 1)}[sec]
            j = self._get_json("https://api.geckoterminal.com/api/v2/networks/%s/pools/%s/ohlcv/%s?aggregate=%d&limit=1000&currency=usd" % (urllib.parse.quote(chain), urllib.parse.quote(pool), unit, agg))
            rows = (((j or {}).get("data") or {}).get("attributes") or {}).get("ohlcv_list") or []
            c = [{"t": int(k[0]), "o": float(k[1]), "h": float(k[2]), "l": float(k[3]), "c": float(k[4]), "v": float(k[5] or 0)} for k in rows]
        elif sym.endswith("-USD"):
            g = 3600 if sec == 14400 else sec
            j = self._get_json("https://api.exchange.coinbase.com/products/%s/candles?granularity=%d" % (urllib.parse.quote(sym), g))
            c = [{"t": int(k[0]), "o": float(k[3]), "h": float(k[2]), "l": float(k[1]), "c": float(k[4]), "v": float(k[5])} for k in j]
            if sec == 14400:  # build 4h from 1h, aligned to UTC 4-hour blocks
                c.sort(key=lambda x: x["t"]); agg = []
                for x in c:
                    t4 = x["t"] - x["t"] % 14400
                    if agg and agg[-1]["t"] == t4: A = agg[-1]; A["h"] = max(A["h"], x["h"]); A["l"] = min(A["l"], x["l"]); A["c"] = x["c"]; A["v"] += x["v"]
                    else: agg.append(dict(x, t=t4))
                c = agg
        else:
            iv, rng = {60: ("1m", "5d"), 300: ("5m", "1mo"), 900: ("15m", "1mo"), 3600: ("60m", "6mo"), 14400: ("60m", "6mo"), 86400: ("1d", "2y")}[sec]
            j = self._get_json("https://query1.finance.yahoo.com/v8/finance/chart/%s?range=%s&interval=%s" % (urllib.parse.quote(sym), rng, iv))
            res = j["chart"]["result"][0]; q = res["indicators"]["quote"][0]; c = []
            for i, t in enumerate(res.get("timestamp") or []):
                o, h, l, cl, v = (q[k][i] for k in ("open", "high", "low", "close", "volume"))
                if None not in (o, h, l, cl): c.append({"t": int(t), "o": o, "h": h, "l": l, "c": cl, "v": v or 0})
        c.sort(key=lambda x: x["t"])
        return c

    # ---- paper execution (mirrors core.js Account / ShortAccount) ----
    @staticmethod
    def _equity(b, price):
        p = b.get("pos")
        if not p: return b["cash"]
        if p["side"] == "short": return b["cash"] + max(0.0, p["cost"] + p["qty"] * (p["entry"] - price))
        return b["cash"] + p["qty"] * price

    def _trade(self, b, side, price, reason, ts):
        sh = b["spec"].get("dir") == "short"; t = None
        if side == "buy" and not b.get("pos"):
            usd = b["cash"]
            if usd < 1: return None
            px = price * (1 - b["slip"]) if sh else price * (1 + b["slip"]); fee = usd * b["fee"]; qty = (usd - fee) / px
            r = b["spec"]["risk"]; sl = tp = None
            if r.get("sl"): sl = px * (1 + r["sl"] / 100) if sh else px * (1 - r["sl"] / 100)
            if r.get("tp"): tp = px * (1 - r["tp"] / 100) if sh else px * (1 + r["tp"] / 100)
            b["pos"] = {"side": "short" if sh else "long", "qty": qty, "entry": px, "cost": (usd - fee) if sh else usd, "sl": sl, "tp": tp, "trail": (r.get("trail") or 0) / 100, "ext": px, "t0": ts}
            b["cash"] -= usd
            t = {"id": secrets.token_hex(6), "ts": ts, "side": "buy", "short": sh, "price": px, "qty": qty, "usd": usd, "fee": fee, "pnl": None, "reason": reason}
        elif side == "sell" and b.get("pos"):
            p = b["pos"]
            if p["side"] == "short":
                px = price * (1 + b["slip"]); fee = p["qty"] * px * b["fee"]; pnl = p["qty"] * (p["entry"] - px) - fee; back = max(0.0, p["cost"] + pnl)
                b["cash"] += back; pnl = back - p["cost"]; usd = back
            else:
                px = price * (1 - b["slip"]); gross = p["qty"] * px; fee = gross * b["fee"]; usd = gross - fee; pnl = usd - p["cost"]; b["cash"] += usd
            t = {"id": secrets.token_hex(6), "ts": ts, "side": "sell", "short": p["side"] == "short", "price": px, "qty": p["qty"], "usd": usd, "fee": fee, "pnl": pnl, "pnlPct": pnl / p["cost"] if p["cost"] else 0, "reason": reason}
            b["pos"] = None
        if t:
            t["sym"] = b["sym"]; t["bot"] = b["name"]; b["trades"].append(t); b["trades"] = b["trades"][-300:]
            if b.get("notify") and self.notify:
                self.outbox.append(neutralize("🤖 ExTerm bot %s: %s %s @ %s%s (%s) · paper" % (b["name"], ("SHORT" if t["short"] else "BUY") if side == "buy" else ("COVER" if t["short"] else "SELL"), Alerts.label(b["sym"]), "{:,.8g}".format(t["price"]), "" if t["pnl"] is None else " · P&L " + "{:+,.2f}".format(t["pnl"]), reason)))
        return t

    def _check_exits(self, b, lo, hi, op, ts):
        p = b.get("pos")
        if not p: return None
        if p["side"] == "short":
            p["ext"] = min(p["ext"], lo); stop = p["sl"] if p["sl"] else float("inf")
            if p["trail"]: stop = min(stop, p["ext"] * (1 + p["trail"]))
            if _m.isfinite(stop) and hi >= stop: return self._trade(b, "sell", op if op > stop else stop, "stop (short)", ts)
            if p["tp"] and lo <= p["tp"]: return self._trade(b, "sell", op if op < p["tp"] else p["tp"], "take-profit (short)", ts)
        else:
            p["ext"] = max(p["ext"], hi); stop = p["sl"] or 0
            if p["trail"]: stop = max(stop, p["ext"] * (1 - p["trail"]))
            if stop and lo <= stop: return self._trade(b, "sell", op if op < stop else stop, "stop-loss", ts)
            if p["tp"] and hi >= p["tp"]: return self._trade(b, "sell", op if op > p["tp"] else p["tp"], "take-profit", ts)
        return None

    def step(self, b, candles):
        """Process newly closed candles for one bot. Returns the trades made."""
        sec = TF_SEC[b["tf"]]; now = self.now(); made = []
        closed = [x for x in candles if x["t"] + sec <= now]
        if len(closed) < 10: b["status"] = "waiting for candles"; return made
        ent, ext = spec_signals(b["spec"], closed)
        day = int(now // 86400)
        if b.get("dayStart") != day: b["dayStart"] = day; b["dayEq"] = self._equity(b, closed[-1]["c"]); b["halted"] = ""
        new = [i for i, x in enumerate(closed) if x["t"] > b["lastBar"]]
        if not b["lastBar"]: new = new[-1:]  # first run: act on the latest closed candle only, never replay history
        for i in new:
            x = closed[i]; ts = int((x["t"] + sec) * 1000)
            t = self._check_exits(b, x["l"], x["h"], x["o"], ts)
            if t: made.append(t)
            if b.get("maxDailyLoss") and b.get("dayEq") and not b.get("halted"):
                if self._equity(b, x["c"]) < b["dayEq"] * (1 - b["maxDailyLoss"] / 100):
                    b["halted"] = "daily loss limit hit: no new entries until tomorrow (UTC)"
            if b.get("pos") and ext[i]: t = self._trade(b, "sell", x["c"], b["spec"]["name"] + (": cover rules met" if b["spec"].get("dir") == "short" else ": exit rules met"), ts); made += [t] if t else []
            elif not b.get("pos") and ent[i] and not b.get("halted") and not b.get("shieldUntil", 0) > now: t = self._trade(b, "buy", x["c"], b["spec"]["name"] + (": short entry rules met" if b["spec"].get("dir") == "short" else ": entry rules met"), ts); made += [t] if t else []
            b["lastBar"] = x["t"]
        b["price"] = closed[-1]["c"]; b["equity"] = self._equity(b, closed[-1]["c"])
        b["status"] = b.get("halted") or ("macro shield: no new entries" if b.get("shieldUntil", 0) > now and not b.get("pos") else "") or ("in a %s position" % b["pos"]["side"] if b.get("pos") else "watching for an entry")
        return made

    def tick(self):
        with self.lock: todo = [b for b in self.bots if b["active"]]
        cache = {}; made = []
        for b in todo:
            k = (b["sym"], b["tf"])
            try:
                if k not in cache: cache[k] = self.fetch(b["sym"], b["tf"])
                with self.lock: made += self.step(b, cache[k])
            except Exception as e:
                b["status"] = "error: " + str(e)[:80]; self.last_err = "%s: %s" % (b["name"], str(e)[:80])
        if todo: self.save()
        out, self.outbox = self.outbox, []
        for msg in out[:20]:  # notifications go out after the lock is released
            try: self.notify(msg)
            except Exception as e: self.last_err = "bot notification failed: " + str(e)[:60]
        return made

    def close(self, bid):
        with self.lock:
            b = next((x for x in self.bots if x["id"] == bid), None)
            if not b: raise ValueError("no such bot")
            if not b.get("pos"): return None
            px = b.get("price") or b["pos"]["entry"]
            t = self._trade(b, "sell", px, "closed by you", int(self.now() * 1000))
        self.save(); return t

    @staticmethod
    def _num0(v):
        try: v = float(v or 0)
        except (TypeError, ValueError): return 0.0
        return v if _m.isfinite(v) and v > 0 else 0.0

    def shield(self, pause=True, tighten=False, minutes=60, stop_pct=1.0, clear=False):
        """World Monitor CRITICAL spike: block new entries for `minutes` and/or pull open stops to stop_pct% from the last price.
        Only ever reduces risk (a stop is never loosened). clear=True lifts the entry block early. Returns how many bots it touched."""
        n = 0; now = self.now()
        with self.lock:
            if clear:
                for b in self.bots:
                    if b.get("shieldUntil"): b["shieldUntil"] = 0.0; n += 1
            for b in ([] if clear else self.bots):
                if not b["active"]: continue
                hit = False
                if pause: b["shieldUntil"] = max(b.get("shieldUntil", 0), now + minutes * 60); hit = True
                p, px = b.get("pos"), b.get("price")
                if tighten and p and px:
                    if p["side"] == "short": p["sl"] = min(p["sl"] or float("inf"), px * (1 + stop_pct / 100))
                    else: p["sl"] = max(p["sl"] or 0, px * (1 - stop_pct / 100))
                    hit = True
                n += hit
        if n: self.save()
        return n

    def run(self, every=30):
        while True:
            try: self.tick()
            except Exception as e: self.last_err = str(e)[:100]
            time.sleep(every)

BOTS = None

# ───────── saved state: everything the page keeps, mirrored to this computer ─────────
# Browsers keep localStorage per address (localhost:8765 and localhost:8766 are different stores), so a new port or
# browser used to look like a fresh install. The page now mirrors its storage here and restores it on open.
# The journal is kept as a long-term log on disk (more entries than the browser keeps). API keys are never written:
# the page strips them before saving and this store blanks the same fields again as a second check.
class StateStore:
    KEY_RX = re.compile(r"^(novaterm[A-Za-z0-9_.:-]{0,60}|nt\.[A-Za-z0-9_.:-]{1,60})$")
    JID_RX = re.compile(r"^j_[A-Za-z0-9_.:-]{1,90}$")
    SECRET_PATHS = (("ai", "key"), ("ai", "hfToken"), ("settings", "stKey"), ("settings", "heliusKey"), ("settings", "solRpc"), ("settings", "secContact"), ("social", "xToken"))
    SKIP = {"nt.gtCool", "nt.savedAt"}
    MAX_KEYS, MAX_CHARS = 400, 14 * 1024 * 1024
    MAX_JOURNAL, MAX_ENTRY, SEND_JOURNAL = 20000, 12 * 1024, 5000
    JFIELDS = {"id": str, "tradeId": (str, int, float), "ts": (int, float), "sym": str, "side": str, "price": (int, float), "usd": (int, float), "qty": (int, float),
               "pnl": (int, float, type(None)), "pnlPct": (int, float, type(None)), "held": (int, float, type(None)), "reason": str, "src": str,
               "plan": (dict, type(None)), "notes": str, "tags": list, "mood": str}

    def __init__(self, path=None):
        self.path = pathlib.Path(path) if path else DATA_DIR / "state.json"
        self.lock = threading.Lock()
        self.keys, self.journal, self.saved_at, self.updated = {}, {}, 0, 0
        try:
            j = json.loads(self.path.read_text())
            self.keys = {k: v for k, v in (j.get("keys") or {}).items() if isinstance(k, str) and self.KEY_RX.match(k) and isinstance(v, str)}
            for e in j.get("journal") or []:
                ce = self.clean_entry(e)
                if ce: self.journal[ce["id"]] = ce
            self.saved_at = int(j.get("savedAt") or 0); self.updated = int(j.get("updated") or 0)
        except Exception:
            pass

    @classmethod
    def clean_entry(cls, e):
        if not isinstance(e, dict) or not isinstance(e.get("id"), str) or not cls.JID_RX.match(e["id"]): return None
        out = {}
        for k, t in cls.JFIELDS.items():
            v = e.get(k)
            if isinstance(v, bool): continue
            if isinstance(v, t): out[k] = v[:2000] if isinstance(v, str) else v
        if not isinstance(out.get("sym"), str) or not isinstance(out.get("ts"), (int, float)): return None
        if "tags" in out: out["tags"] = [x[:20] for x in out["tags"] if isinstance(x, str)][:6]
        if "plan" in out and out["plan"] is not None:
            out["plan"] = {k: v for k, v in out["plan"].items() if k in ("sl", "tp", "trail") and (v is None or (isinstance(v, (int, float)) and not isinstance(v, bool)))}
        if len(json.dumps(out)) > cls.MAX_ENTRY: return None
        return out

    @classmethod
    def strip_secrets(cls, raw):
        try: st = json.loads(raw)
        except Exception: return raw
        if not isinstance(st, dict): return raw
        hit = False
        for a, b in cls.SECRET_PATHS:
            if isinstance(st.get(a), dict) and st[a].get(b): st[a][b] = ""; hit = True
        return json.dumps(st, separators=(",", ":")) if hit else raw

    def public(self, full_journal=False):
        with self.lock:
            j = sorted(self.journal.values(), key=lambda e: -e.get("ts", 0))
            return {"savedAt": self.saved_at, "updated": self.updated, "keys": dict(self.keys), "journal": j if full_journal else j[:self.SEND_JOURNAL], "journalTotal": len(j)}

    def summary(self):
        with self.lock:
            return {"savedAt": self.saved_at, "updated": self.updated, "keys": len(self.keys), "journal": len(self.journal), "path": "~/.exterm/state.json" if not os.environ.get("EXTERM_DATA") else "EXTERM_DATA/state.json"}

    def apply(self, body):
        keys, removed = body.get("keys") or {}, body.get("removed") or []
        if not isinstance(keys, dict) or not isinstance(removed, list): raise ValueError("keys must be an object, removed a list")
        for k, v in keys.items():
            if not (isinstance(k, str) and self.KEY_RX.match(k)): raise ValueError("key not allowed: " + str(k)[:40])
            if not isinstance(v, str): raise ValueError("values must be strings")
        ups, dels = body.get("journal") or [], body.get("journalDel") or []
        if not isinstance(ups, list) or not isinstance(dels, list) or len(ups) > self.MAX_JOURNAL or len(dels) > self.MAX_JOURNAL: raise ValueError("bad journal update")
        with self.lock:
            nk = {} if body.get("full") is True else dict(self.keys)
            for k in removed:
                if isinstance(k, str): nk.pop(k, None)
            for k, v in keys.items():
                if k in self.SKIP: continue
                nk[k] = self.strip_secrets(v) if k == "novaterm.v1" else v
            if len(nk) > self.MAX_KEYS: raise ValueError("too many keys")
            if sum(len(k) + len(v) for k, v in nk.items()) > self.MAX_CHARS: raise ValueError("saved state too large")
            nj = {} if body.get("journalClear") is True else dict(self.journal)
            for i in dels:
                if isinstance(i, str): nj.pop(i, None)
            for e in ups:
                ce = self.clean_entry(e)
                if ce: nj[ce["id"]] = ce
            if len(nj) > self.MAX_JOURNAL:  # oldest entries roll off only past 20,000 trades
                for e in sorted(nj.values(), key=lambda e: e.get("ts", 0))[:len(nj) - self.MAX_JOURNAL]: nj.pop(e["id"], None)
            now = int(time.time() * 1000)
            try: sa = int(body.get("savedAt") or now)
            except (TypeError, ValueError): sa = now
            self.keys, self.journal, self.saved_at, self.updated = nk, nj, max(0, min(sa, now + 86400000)), now
            data = {"v": 1, "savedAt": self.saved_at, "updated": now, "keys": nk, "journal": list(nj.values())}
        self._write(data)
        return self.summary()

    def _write(self, data):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        try:  # one dated copy per day (14 kept) so a bad save can be undone by hand
            if self.path.exists():
                bdir = self.path.parent / "state-backups"; bdir.mkdir(exist_ok=True)
                b = bdir / ("state-%s.json" % time.strftime("%Y-%m-%d"))
                if not b.exists():
                    shutil.copyfile(self.path, b); os.chmod(b, 0o600)
                    for old in sorted(bdir.glob("state-*.json"))[:-14]: old.unlink()
        except OSError:
            pass
        tmp = self.path.with_suffix(".tmp")
        fd = os.open(str(tmp), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump(data, f, separators=(",", ":"))
        os.replace(tmp, self.path)
        try: os.chmod(self.path, 0o600)
        except OSError: pass

STATE = None

# ───────── update check: is there a newer ExTerm release on GitHub? ─────────
# Fixed URL (no input from the page), read-only, cached for 6 hours, at most 600 characters of plain release notes.
# Nothing is downloaded or installed: the page only shows a banner that links to the release page.
UPDATE_REPO = "uexxx/ExTerm"
UPDATE_URL = "https://api.github.com/repos/%s/releases/latest" % UPDATE_REPO
_upd = {"ts": 0, "data": None}
_upd_lock = threading.Lock()
def _ver(v):
    m = re.match(r"^v?(\d{1,4})(?:\.(\d{1,4}))?(?:\.(\d{1,4}))?$", str(v or "").strip())
    return tuple(int(x or 0) for x in m.groups()) if m else None
def update_info(fetch=None, now=None):
    now = now or time.time()
    with _upd_lock:
        if _upd["data"] is not None and now - _upd["ts"] < 6 * 3600: return _upd["data"]
    out = {"current": VERSION, "latest": None, "newer": False, "url": None, "notes": ""}
    try:
        if fetch: j = fetch(UPDATE_URL)
        else:
            req = urllib.request.Request(UPDATE_URL, headers={"User-Agent": "ExTerm-update-check", "Accept": "application/vnd.github+json"})
            with OPENER.open(req, timeout=10) as r: j = json.loads(r.read(256 * 1024))
        tag = str((j or {}).get("tag_name") or "")[:20]; lv, cv = _ver(tag), _ver(VERSION)
        url = str(j.get("html_url") or "")
        if lv and url.startswith("https://github.com/%s/" % UPDATE_REPO):
            notes = re.sub(r"\s+", " ", re.sub(r"[\x00-\x08\x0b-\x1f\x7f\u202a-\u202e\u2066-\u2069]", "", str(j.get("body") or ""))).strip()[:600]  # plain text; the page escapes it
            out.update(latest=tag.lstrip("v"), newer=bool(cv and lv > cv), url=url, notes=notes)
    except Exception as e:
        out["error"] = str(e)[:80]
    with _upd_lock: _upd.update(ts=now, data=out)
    return out


# ───────── live price feed: one RAM cache for the page, alerts and bots, polled in batches every 2 s ─────────
# DexScreener answers up to 30 pools per call and Yahoo's spark endpoint many tickers per call, so 300 watched
# symbols cost ~12 requests per round. Symbols stay watched WATCH_TTL after the page last asked, and for as long as
# a background bot or alert needs them, so prices keep moving with the browser tab closed.
DEX_CHAINS = {"solana": "solana", "eth": "ethereum", "base": "base", "bsc": "bsc", "arbitrum": "arbitrum"}  # page chain id -> DexScreener id (dex.js CHAINS)
POOL_RX = re.compile(r"^[A-Za-z0-9]{20,90}$")
STOCK_RX = re.compile(r"^[A-Z0-9^][A-Z0-9^=.\-]{0,15}$")

class PriceFeed:
    DEX_BATCH, YF_BATCH, WATCH_TTL, MAX_SYMS, EVERY, TICKS = 30, 40, 900, 300, 2.0, 1800  # 1800 ticks = the last hour at 2 s

    def __init__(self, fetch=None, now=None, extra=None, workers=4):
        self.lock = threading.Lock(); self.cache = {}; self.watch = {}; self.polls = 0; self.last_err = ""
        self.fetch = fetch or self._get_json; self.now = now or time.time
        self.extra = extra or (lambda: ())  # symbols that must stay live without a page: bots, alerts
        self.workers = workers; self.cool = {}  # source -> resume time after a 429
        self.ticks = {}  # sym -> deque of (ts, price): the RAM buffer the page builds 1s / 5s / 15s stock bars from

    @staticmethod
    def kind(sym):
        """('dex', chain, pool) | ('yf', ticker) | None: anything else is refused (trust boundary: symbols come from the page)."""
        if not isinstance(sym, str) or len(sym) > 120: return None
        if sym.startswith("oc:"):
            parts = sym.split(":")
            if len(parts) == 3 and parts[1] in DEX_CHAINS and POOL_RX.match(parts[2]): return ("dex", DEX_CHAINS[parts[1]], parts[2])
            return None
        if sym.endswith("-USD"): return None  # crypto majors stream over exchange WebSockets in the page
        return ("yf", sym) if STOCK_RX.match(sym) else None

    def want(self, syms):
        now = self.now(); added = []
        with self.lock:
            for s in syms:
                if self.kind(s) is None: continue
                if s not in self.watch and len(self.watch) >= self.MAX_SYMS: del self.watch[min(self.watch, key=self.watch.get)]  # newest interest wins
                self.watch[s] = now; added.append(s)
        return added

    def active(self):
        now = self.now()
        with self.lock:
            for s in [s for s, t in self.watch.items() if now - t > self.WATCH_TTL]: del self.watch[s]
            out = set(self.watch)
        try: out |= {s for s in self.extra() if self.kind(s)}
        except Exception: pass
        return sorted(out)

    def snapshot(self, syms=None):
        with self.lock:
            keys = self.cache.keys() if syms is None else [s for s in syms if s in self.cache]
            return {s: dict(self.cache[s]) for s in keys}

    def tick_history(self, sym):
        """[[ts, price], ...] oldest first; registers interest so the symbol keeps being polled."""
        if self.kind(sym) is None: return []
        self.want([sym])
        with self.lock: return [list(x) for x in self.ticks.get(sym, ())]

    def price(self, sym, max_age=10):
        with self.lock: c = self.cache.get(sym)
        return c["p"] if c and self.now() - c["ts"] <= max_age else None

    def _get_json(self, url):
        u = urllib.parse.urlparse(url)
        if u.scheme != "https" or not host_allowed(u.hostname): raise ValueError("host not allowed")
        with OPENER.open(urllib.request.Request(url, headers={"User-Agent": "ExTerm-Feed/1.0", "Accept": "application/json"}), timeout=8) as r:
            return json.loads(r.read(4_000_000))

    @staticmethod
    def _num(v):
        try: v = float(v)
        except (TypeError, ValueError): return None
        return v if _m.isfinite(v) else None

    def _dex(self, chain, names):
        """names: pool address -> app symbol, at most DEX_BATCH of them."""
        j = self.fetch("https://api.dexscreener.com/latest/dex/pairs/%s/%s" % (chain, ",".join(names))) or {}
        rows = j.get("pairs") or ([j["pair"]] if j.get("pair") else [])
        low = {k.lower(): v for k, v in names.items()}; out = {}
        for x in rows if isinstance(rows, list) else []:
            if not isinstance(x, dict): continue
            sym = low.get(str(x.get("pairAddress", "")).lower()); p = self._num(x.get("priceUsd"))
            if sym and p and p > 0:
                out[sym] = {"p": p, "ch24": self._num((x.get("priceChange") or {}).get("h24")), "vol24": self._num((x.get("volume") or {}).get("h24")), "liq": self._num((x.get("liquidity") or {}).get("usd")), "src": "dexscreener"}
        return out

    def _yf(self, syms):
        j = self.fetch("https://query1.finance.yahoo.com/v7/finance/spark?symbols=%s&range=1d&interval=1d" % ",".join(urllib.parse.quote(s, safe="^=") for s in syms)) or {}
        out, want = {}, set(syms)
        if isinstance(j.get("spark"), dict):
            for x in j["spark"].get("result") or []:
                m = ((x.get("response") or [{}])[0] or {}).get("meta") or {}; p = self._num(m.get("regularMarketPrice")); prev = self._num(m.get("chartPreviousClose") or m.get("previousClose"))
                if x.get("symbol") in want and p and p > 0: out[x["symbol"]] = {"p": p, "ch24": (p / prev - 1) * 100 if prev else None, "src": "yahoo"}
        else:
            for x in j.values():
                if not isinstance(x, dict) or x.get("symbol") not in want: continue
                c = [v for v in (x.get("close") or []) if v is not None]; p = self._num(c[-1]) if c else None; prev = self._num(x.get("chartPreviousClose") or x.get("previousClose"))
                if p and p > 0: out[x["symbol"]] = {"p": p, "ch24": (p / prev - 1) * 100 if prev else None, "src": "yahoo"}
        return out

    def poll(self):
        """One round: every batch in parallel, results merged into the cache. Returns how many prices were updated."""
        syms = self.active()
        if not syms: return 0
        dex, yf = {}, []
        for s in syms:
            k = self.kind(s)
            if k[0] == "dex": dex.setdefault(k[1], {})[k[2]] = s
            else: yf.append(k[1])
        t0 = self.now()
        jobs = [] if self.cool.get("dex", 0) > t0 else [("dex", self._dex, (c, dict(list(m.items())[i:i + self.DEX_BATCH]))) for c, m in dex.items() for i in range(0, len(m), self.DEX_BATCH)]
        jobs += [] if self.cool.get("yf", 0) > t0 else [("yf", self._yf, (yf[i:i + self.YF_BATCH],)) for i in range(0, len(yf), self.YF_BATCH)]
        if not jobs: return 0
        got, errs = {}, []
        with ThreadPoolExecutor(max_workers=min(self.workers, len(jobs))) as ex:
            for src, f in [(src, ex.submit(fn, *a)) for src, fn, a in jobs]:
                try: got.update(f.result())
                except Exception as e:
                    errs.append(str(e)[:80])
                    if "429" in str(e): self.cool[src] = self.now() + 30  # rate-limited: pause that source, keep the other
        ts = self.now()
        with self.lock:
            for s, v in got.items():
                v["ts"] = ts; self.cache[s] = v
                self.ticks.setdefault(s, deque(maxlen=self.TICKS)).append((round(ts, 3), v["p"]))
            live = set(syms)
            for s in [s for s in self.cache if s not in live]: del self.cache[s]
            for s in [s for s in self.ticks if s not in live]: del self.ticks[s]
            self.polls += 1; self.last_err = errs[0] if errs and not got else ""
        return len(got)

    def run(self):
        while True:
            t0 = time.time()
            try: self.poll()
            except Exception as e: self.last_err = str(e)[:100]
            time.sleep(max(0.2, self.EVERY - (time.time() - t0)))

FEED = None

# ───────── v15.4 on-chain Perp / Smart-Money Leaderboards: public, permissionless Hyperliquid mainnet reads ─────────
# GET stats-data.hyperliquid.xyz/Mainnet/leaderboard and POST api.hyperliquid.xyz/info (three read-only types). Answers are
# schema-validated and trimmed, cached 30 s in RAM, and upstream failures back off exponentially while the last good copy
# is served. Nothing is signed, no key exists, no order endpoint is reachable. --offline serves a seeded sample instead.
HL_BOARD_URL = "https://stats-data.hyperliquid.xyz/Mainnet/leaderboard"
HL_INFO_URL = "https://api.hyperliquid.xyz/info"
HL_TYPES = ("clearinghouseState", "userFills", "frontendOpenOrders")
HL_TTL, HL_KEEP = 30, 600
HL_ADDR = re.compile(r"^0x[0-9a-fA-F]{40}$")
HL_COIN = re.compile(r"^[A-Za-z0-9@:._-]{1,24}$")
HL_WIN = ("day", "week", "month", "allTime")

def _hnum(x, d=0.0):
    try:
        v = float(x)
        return v if v == v and abs(v) != float("inf") else d
    except Exception: return d

def alpha_score(roi_day, roi_week, roi_month, roi_all, acct, vlm_month):
    """ExTerm Alpha Score 0-100, same formula as V154.alphaScore in the page: risk-adjusted ROI 35%, drawdown control 25%,
    consistency across windows 25%, liquid non-churning size 15%."""
    import math
    cl = lambda x, a, b: min(b, max(a, x))
    rd, rw, rm, ra = (_hnum(v) for v in (roi_day, roi_week, roi_month, roi_all)); acct = max(0.0, _hnum(acct)); vlm = max(0.0, _hnum(vlm_month))
    risk = cl(0.5 + 0.5 * math.tanh(cl(rm / 0.5 + ra / 4, -20, 20)), 0, 1)
    dd = cl(1 - max(0.0, -min(rd, rw, rm)) * 2.5, 0, 1)
    cons = sum(1 for x in (rd, rw, rm, ra) if x > 0) / 4
    turn = vlm / acct if acct > 0 else 0.0
    size = cl((math.log10(max(1.0, acct)) - 3) / 5, 0, 1)
    churn = cl(1 - (turn - 400) / 1600, 0, 1) if turn > 400 else 1.0
    return int(math.floor(100 * (0.35 * risk + 0.25 * dd + 0.25 * cons + 0.15 * size * churn) + 0.5))

def hl_clean_row(x):
    if not isinstance(x, dict): return None
    addr = x.get("ethAddress") or x.get("addr")
    if not isinstance(addr, str) or not HL_ADDR.match(addr): return None
    name = x.get("displayName") if x.get("displayName") is not None else x.get("name")
    out = {"addr": addr.lower(), "name": re.sub(r"[<>&\"'`]", "", _CTRL_RX.sub("", str(name or "")))[:32], "acct": max(0.0, _hnum(x.get("accountValue", x.get("acct")))), "pnl": {}, "roi": {}, "vlm": {}}
    wp = x.get("windowPerformances")
    perf = {}
    if isinstance(wp, list):
        for it in wp:
            if isinstance(it, list) and len(it) == 2 and it[0] in HL_WIN and isinstance(it[1], dict): perf[it[0]] = it[1]
    for k in HL_WIN:
        p = perf.get(k) or {}
        out["pnl"][k] = _hnum(p.get("pnl")) if perf else _hnum((x.get("pnl") or {}).get(k) if isinstance(x.get("pnl"), dict) else 0)
        out["roi"][k] = _hnum(p.get("roi")) if perf else _hnum((x.get("roi") or {}).get(k) if isinstance(x.get("roi"), dict) else 0)
        out["vlm"][k] = max(0.0, _hnum(p.get("vlm")) if perf else _hnum((x.get("vlm") or {}).get(k) if isinstance(x.get("vlm"), dict) else 0))
    out["alpha"] = alpha_score(out["roi"]["day"], out["roi"]["week"], out["roi"]["month"], out["roi"]["allTime"], out["acct"], out["vlm"]["month"])
    return out

def hl_clean_info(kind, j):
    """Trust boundary for /info answers: only the fields the page reads, plain numbers and short strings, capped lists."""
    s = lambda v, n=24: _CTRL_RX.sub("", str(v if v is not None else ""))[:n]
    if kind == "clearinghouseState":
        if not isinstance(j, dict): raise ValueError("bad clearinghouseState")
        ps = []
        for a in (j.get("assetPositions") or [])[:200]:
            p = a.get("position") if isinstance(a, dict) else None
            if not isinstance(p, dict) or not HL_COIN.match(str(p.get("coin", ""))): continue
            lev = p.get("leverage"); lev = lev.get("value") if isinstance(lev, dict) else lev
            ps.append({"position": {"coin": str(p["coin"]), "szi": _hnum(p.get("szi")), "entryPx": _hnum(p.get("entryPx")), "positionValue": _hnum(p.get("positionValue")), "unrealizedPnl": _hnum(p.get("unrealizedPnl")),
                                    "liquidationPx": _hnum(p.get("liquidationPx"), None) if p.get("liquidationPx") is not None else None, "leverage": {"value": _hnum(lev)}, "returnOnEquity": _hnum(p.get("returnOnEquity"))}})
        ms = j.get("marginSummary") if isinstance(j.get("marginSummary"), dict) else {}
        return {"assetPositions": ps, "marginSummary": {"accountValue": _hnum(ms.get("accountValue"))}}
    if not isinstance(j, list): raise ValueError("bad " + kind)
    if kind == "userFills":
        out = []
        for f in j[:2000]:
            if not isinstance(f, dict) or not HL_COIN.match(str(f.get("coin", ""))): continue
            out.append({"coin": str(f["coin"]), "px": _hnum(f.get("px")), "sz": _hnum(f.get("sz")), "side": "A" if f.get("side") == "A" else "B", "time": int(_hnum(f.get("time"))), "dir": s(f.get("dir")), "closedPnl": _hnum(f.get("closedPnl")), "startPosition": _hnum(f.get("startPosition"))})
        return out
    out = []
    for o in j[:500]:
        if not isinstance(o, dict) or not HL_COIN.match(str(o.get("coin", ""))): continue
        out.append({"coin": str(o["coin"]), "side": "A" if o.get("side") == "A" else "B", "limitPx": _hnum(o.get("limitPx")), "sz": _hnum(o.get("sz")), "isTrigger": bool(o.get("isTrigger")), "triggerPx": _hnum(o.get("triggerPx")), "reduceOnly": bool(o.get("reduceOnly")), "orderType": s(o.get("orderType"))})
    return out

class HLCache:
    def __init__(self, fetch=None, post=None, now=None, offline=False):
        self.fetch = fetch or self._get; self.post = post or self._post; self.now = now or time.time; self.offline = offline
        self.lock = threading.Lock(); self.data = {}; self.wait = {}; self.fails = {}; self.calls = 0  # backoff per upstream host

    @staticmethod
    def _get(url):
        u = urllib.parse.urlparse(url)
        if u.scheme != "https" or u.hostname != "stats-data.hyperliquid.xyz": raise ValueError("host not allowed")
        with OPENER.open(urllib.request.Request(url, headers={"User-Agent": "ExTerm-Leaderboard/1.0", "Accept": "application/json"}), timeout=25) as r:
            return json.loads(r.read(80_000_000))

    @staticmethod
    def _post(url, body):
        u = urllib.parse.urlparse(url)
        if u.scheme != "https" or u.hostname != "api.hyperliquid.xyz" or u.path != "/info": raise ValueError("host not allowed")
        if body.get("type") not in HL_TYPES: raise ValueError("type not allowed")
        req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"User-Agent": "ExTerm-Leaderboard/1.0", "Content-Type": "application/json", "Accept": "application/json"}, method="POST")
        with OPENER.open(req, timeout=15) as r:
            return json.loads(r.read(8_000_000))

    def _cached(self, key, build):
        t = self.now(); host = "board" if key == "board" else "info"
        with self.lock:
            hit = self.data.get(key)
            if hit and t - hit[0] < HL_TTL: return hit[1]
            if t < self.wait.get(host, 0.0):
                if hit: return dict(hit[1], stale=True) if isinstance(hit[1], dict) else hit[1]
                raise ValueError("upstream rate-limited: retry in %ds" % int(self.wait[host] - t))
        try:
            self.calls += 1; v = build()
        except Exception as e:
            with self.lock:
                self.fails[host] = self.fails.get(host, 0) + 1; self.wait[host] = t + min(300, 2 ** min(8, self.fails[host]))
                if hit: return dict(hit[1], stale=True) if isinstance(hit[1], dict) else hit[1]
            raise ValueError("on-chain source unavailable: " + str(e)[:80])
        with self.lock:
            self.fails[host] = 0; self.wait[host] = 0.0; self.data[key] = (t, v)
            if len(self.data) > 400:
                for k in sorted(self.data, key=lambda k: self.data[k][0])[:100]: self.data.pop(k, None)
        return v

    def board(self):
        def build():
            if self.offline: return {"ts": self.now(), "rows": hl_sample_board(), "sample": True}
            j = self.fetch(HL_BOARD_URL)
            raw = j.get("leaderboardRows") if isinstance(j, dict) else None
            if not isinstance(raw, list): raise ValueError("unexpected leaderboard shape")
            rows, seen = [], set()
            for x in raw[:200000]:
                r = hl_clean_row(x)
                if r and r["addr"] not in seen: seen.add(r["addr"]); rows.append(r)
            keep = {r["addr"]: r for r in sorted(rows, key=lambda r: -r["pnl"]["month"])[:HL_KEEP]}
            for k in ("day", "week", "allTime"):
                for r in sorted(rows, key=lambda r: -r["pnl"][k])[:HL_KEEP // 3]: keep[r["addr"]] = r
            return {"ts": self.now(), "rows": sorted(keep.values(), key=lambda r: -r["pnl"]["month"]), "sample": False}
        return self._cached("board", build)

    def trader(self, addr, types, refs=None):
        if not isinstance(addr, str) or not HL_ADDR.match(addr): raise ValueError("bad address")
        addr = addr.lower(); out = {"addr": addr, "sample": self.offline}
        for k in types:
            if k not in HL_TYPES: raise ValueError("type not allowed")
            if self.offline: out[k] = hl_sample_info(k, addr, refs or {})
            else: out[k] = self._cached(k + "|" + addr, lambda k=k: hl_clean_info(k, self.post(HL_INFO_URL, {"type": k, "user": addr})))
        return out

def hl_refs(q):
    """?ref=BTC:97000,ETH:3400 price hints so the offline sample sits around the page's simulated prices."""
    out = {}
    for part in str(q or "")[:400].split(",")[:12]:
        k, _, v = part.partition(":")
        if HL_COIN.match(k) and 0 < _hnum(v) < 1e9: out[k] = _hnum(v)
    return out

HL_SAMPLE_COINS = (("BTC", 97000.0), ("ETH", 3400.0), ("HYPE", 24.0), ("XRP", 2.2), ("DOGE", 0.18), ("AVAX", 21.0))

def _hl_seed(addr):
    import random
    return random.Random(int(hashlib.sha256(addr.encode()).hexdigest()[:12], 16))

def hl_sample_board(n=60):
    """Seeded offline sample (no network): plausible window performances; every row is flagged sample in the response."""
    import random
    R = random.Random(1540); rows = []
    for i in range(n):
        addr = "0x" + hashlib.sha256(("exterm-sample-%d" % i).encode()).hexdigest()[:40]
        acct = 10 ** R.uniform(4.3, 7.6); skill = R.gauss(0.08, 0.25); wp = []
        for k, sc in (("day", 0.02), ("week", 0.06), ("month", 0.18), ("allTime", 1.4)):
            roi = skill * sc * 3 + R.gauss(0, sc); wp.append([k, {"pnl": str(round(acct * roi, 2)), "roi": str(round(roi, 4)), "vlm": str(round(acct * R.uniform(2, 60) * (sc * 10), 2))}])
        if i == 7: wp[2][1]["vlm"] = str(round(acct * 4000, 2))  # a churning wash-volume wallet for the Anti-Rug filter
        rows.append(hl_clean_row({"ethAddress": addr, "accountValue": str(round(acct, 2)), "displayName": None, "windowPerformances": wp}))
    return sorted(rows, key=lambda r: -r["pnl"]["month"])

def hl_sample_info(kind, addr, refs):
    R = _hl_seed(addr); px = dict(HL_SAMPLE_COINS); px.update({k: v for k, v in refs.items() if k in px})
    now = int(time.time() * 1000); k = int(addr[2:6], 16)
    coins = [c for c, _ in HL_SAMPLE_COINS]; R.shuffle(coins); held = coins[:R.randint(1, 3)]
    if k % 3 == 0 and "BTC" not in held: held[0] = "BTC"
    if kind == "clearinghouseState":
        acct = 10 ** R.uniform(4.5, 7); ps = []
        for c in held:
            p = px[c]; side = 1 if R.random() < 0.62 else -1; lev = R.choice((3, 5, 10, 20, 25)); entry = p * (1 - side * R.uniform(0.002, 0.03)); sz = acct * R.uniform(0.2, 1.2) / p
            liq = entry * (1 - side * (1 / lev) * 0.92)
            if k % 5 == 0: liq = p * (1 - side * 0.018)  # sits inside the 2.5% liquidation-magnet band
            ps.append({"position": {"coin": c, "szi": round(side * sz, 6), "entryPx": round(entry, 6), "positionValue": round(sz * p, 2), "unrealizedPnl": round(side * sz * (p - entry), 2), "liquidationPx": round(liq, 6), "leverage": {"value": lev}, "returnOnEquity": round(side * (p / entry - 1) * lev, 4)}})
        return {"assetPositions": ps, "marginSummary": {"accountValue": round(acct, 2)}}
    if kind == "frontendOpenOrders":
        out = []
        for c in held:
            p = px[c]; out.append({"coin": c, "side": "A", "limitPx": round(p * R.uniform(1.01, 1.06), 6), "sz": round(R.uniform(0.1, 2) * 1000 / p, 6), "isTrigger": False, "triggerPx": 0.0, "reduceOnly": True, "orderType": "Limit"})
            out.append({"coin": c, "side": "A", "limitPx": 0.0, "sz": round(1000 / p, 6), "isTrigger": True, "triggerPx": round(p * (1 - R.uniform(0.01, 0.04)), 6), "reduceOnly": True, "orderType": "Stop Market"})
        return out
    fills, t = [], now - 14 * 86400000; scalper = k % 4 == 0; hold = R.uniform(5, 25) if scalper else R.uniform(60, 2000)
    for j in range(R.randint(14, 30)):
        c = R.choice(held); p = px[c] * R.uniform(0.95, 1.05); sz = R.uniform(0.2, 1.0) * 5000 / p; t += int(R.uniform(0.2, 1.4) * 86400000 / 3)
        if (k % 7 == 0) and j in (10, 11): sz *= 0.3
        if (k % 7 == 0) and j == 12: sz *= 3.5  # a size spike after consecutive losses (tilted whale)
        long = R.random() < 0.6; win = R.random() < 0.58 and not ((k % 7 == 0) and j in (10, 11))
        fills.append({"coin": c, "px": round(p, 6), "sz": round(sz, 6), "side": "B" if long else "A", "time": t, "dir": "Open Long" if long else "Open Short", "closedPnl": 0.0, "startPosition": 0.0})
        t2 = t + int(hold * 60000 * R.uniform(0.5, 1.5)); pnl = (1 if win else -1) * sz * p * R.uniform(0.004, 0.03)
        fills.append({"coin": c, "px": round(p * (1 + pnl / (sz * p) * (1 if long else -1)), 6), "sz": round(sz, 6), "side": "A" if long else "B", "time": t2, "dir": "Close Long" if long else "Close Short", "closedPnl": round(pnl, 2), "startPosition": round(sz if long else -sz, 6)})
        t = t2
    if k % 2 == 0:  # recent fresh entries so top wallets can line up into a CONFLUENCE window
        fills.append({"coin": "BTC", "px": round(px["BTC"], 2), "sz": round(20000 / px["BTC"], 6), "side": "B", "time": now - 60000 * (3 + k % 9), "dir": "Open Long", "closedPnl": 0.0, "startPosition": 0.0})
    return sorted(fills, key=lambda f: f["time"])[-2000:]

HL = None

# ───────── World Monitor global intel (koala73/worldmonitor): the key-free public news digest, cached in RAM ─────────
# GET https://api.worldmonitor.app/api/news/v1/list-feed-digest?public=1&variant=<v>&lang=en is the one anonymous shape
# the gateway accepts. Items carry threat.level (THREAT_LEVEL_CRITICAL / _HIGH / ...). We add MACRO for market-moving
# economics headlines. A fresh CRITICAL can warn you (Telegram / Discord) and shield background bots (opt-in).
WM_URL = "https://api.worldmonitor.app/api/news/v1/list-feed-digest?public=1&variant=%s&lang=en"
WM_VARIANTS = ("finance", "full")
_CTRL_RX = re.compile("[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]")
MACRO_RX = re.compile(r"\b(fed|fomc|powell|ecb|lagarde|boj|pboc|rate (hike|cut)s?|interest rates?|inflation|cpi|ppi|pce|payrolls?|nfp|jobs report|unemployment|gdp|recession|treasur(y|ies)|bond yields?|tariffs?|sanctions?|opec|central bank|stimulus|debt ceiling|default|sec (charges|approves)|etf (approval|inflows|outflows))\b", re.I)

class WorldMonitor:
    EVERY, MAX, FRESH = 180, 150, 1800  # poll every 3 min; keep 150 items; a CRITICAL older than 30 min never triggers actions

    def __init__(self, fetch=None, now=None, on_critical=None, path=None):
        self.fetch = fetch or self._get_json; self.now = now or time.time; self.on_critical = on_critical
        self.path = pathlib.Path(path) if path else DATA_DIR / "intel.json"
        self.lock = threading.Lock(); self.items = []; self.seen = set(); self.ts = 0; self.last_err = ""; self.events = []
        self.cfg = {"notify": False, "autoPause": False, "tighten": False}  # every action is opt-in
        try:  # settings plus the CRITICAL ids already acted on, so a restart never re-pushes or re-shields
            j = json.loads(self.path.read_text()); self.cfg = self.clean_cfg(j.get("cfg", {}))
            self.seen = {str(x)[:32] for x in (j.get("seen") or [])[-5000:] if isinstance(x, str)}
            self.events = [{"id": str(e.get("id", ""))[:32], "title": str(e.get("title", ""))[:300], "ts": float(e.get("ts") or 0)} for e in (j.get("events") or [])[-20:] if isinstance(e, dict)]
        except Exception: pass

    @staticmethod
    def clean_cfg(c):
        c = c if isinstance(c, dict) else {}
        return {"notify": bool(c.get("notify", False)), "autoPause": bool(c.get("autoPause", False)), "tighten": bool(c.get("tighten", False))}

    def set_cfg(self, c):
        new = self.clean_cfg(c)
        with self.lock: self.cfg = new
        self._save(); return new

    def _save(self):
        with self.lock: data = {"cfg": dict(self.cfg), "seen": sorted(self.seen)[-5000:], "events": list(self.events)}
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True); tmp = self.path.with_suffix(".tmp")
            fd = os.open(str(tmp), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w") as f: json.dump(data, f)
            os.replace(tmp, self.path)
        except Exception as e: self.last_err = "couldn't save intel state: " + str(e)[:60]

    def _get_json(self, url):
        u = urllib.parse.urlparse(url)
        if u.scheme != "https" or u.hostname != "api.worldmonitor.app": raise ValueError("host not allowed")
        with OPENER.open(urllib.request.Request(url, headers={"User-Agent": "ExTerm-Intel/1.0", "Accept": "application/json"}), timeout=15) as r:
            return json.loads(r.read(3_000_000))

    @staticmethod
    def severity(level, category, title):
        lv = str(level or "").upper()
        if lv.endswith("CRITICAL"): return "CRITICAL"
        if lv.endswith("HIGH"): return "HIGH"
        if MACRO_RX.search(title or "") or str(category or "").lower() in ("economic", "economy", "finance", "markets", "trade"): return "MACRO"
        return "INFO"

    @classmethod
    def clean_item(cls, x, variant):
        """Everything from upstream is untrusted: plain strings only, capped, https/http links only, finite numbers."""
        if not isinstance(x, dict): return None
        s = lambda v, n: _CTRL_RX.sub("", "" if v is None else str(v)).strip()[:n]
        title = s(x.get("title"), 300)
        if len(title) < 4: return None
        link = s(x.get("link"), 600)
        if not re.match(r"^https?://[^\s\"'<>]+$", link): link = ""
        try: ts = float(x.get("publishedAt") or 0)
        except (TypeError, ValueError): ts = 0.0
        if not _m.isfinite(ts) or ts < 0: ts = 0.0
        if ts > 1e12: ts /= 1000.0  # ms -> s
        th = x.get("threat") if isinstance(x.get("threat"), dict) else {}
        meta = x.get("storyMeta") if isinstance(x.get("storyMeta"), dict) else {}
        try: imp = float(x.get("importanceScore") or 0)
        except (TypeError, ValueError): imp = 0.0
        sev = cls.severity(th.get("level"), th.get("category"), title)
        return {"id": hashlib.sha1((link or title).encode("utf-8", "ignore")).hexdigest()[:16], "title": title, "source": s(x.get("source"), 60), "link": link, "ts": ts,
                "sev": sev, "cat": s(th.get("category"), 40), "phase": s(meta.get("phase"), 40).replace("STORY_PHASE_", "").lower(), "loc": s(x.get("locationName"), 60),
                "imp": imp if _m.isfinite(imp) else 0.0, "variant": variant}

    def poll(self):
        got, errs = {}, []
        for v in WM_VARIANTS:
            try:
                j = self.fetch(WM_URL % v) or {}
                cats = j.get("categories") if isinstance(j, dict) else None
                for bucket in (cats.values() if isinstance(cats, dict) else []):
                    for x in ((bucket or {}).get("items") or [])[:200] if isinstance(bucket, dict) else []:
                        it = self.clean_item(x, v)
                        if it and it["id"] not in got: got[it["id"]] = it
            except Exception as e: errs.append(str(e)[:80])
        rank = {"CRITICAL": 3, "HIGH": 2, "MACRO": 1, "INFO": 0}
        lim = self.now() + 300
        for it in got.values():
            if it["ts"] > lim: it["ts"] = 0.0  # a future-dated headline is never "fresh"
        items = sorted(got.values(), key=lambda i: (-i["ts"], -rank[i["sev"]]))[: self.MAX]
        now = self.now(); fresh = []
        with self.lock:
            if items: self.items = items; self.ts = now
            self.last_err = errs[0] if errs and not items else ""
            for it in items:
                if it["sev"] == "CRITICAL" and it["id"] not in self.seen and now - it["ts"] <= self.FRESH: fresh.append(it)
                self.seen.add(it["id"])
            if len(self.seen) > 5000: self.seen = {i["id"] for i in items}
            for it in fresh: self.events.append({"id": it["id"], "title": it["title"], "ts": now})
            self.events = self.events[-20:]
        if fresh: self._save()
        for it in fresh[:3]:  # at most 3 actions per poll, after the lock is released
            if self.on_critical:
                try: self.on_critical(it, dict(self.cfg))
                except Exception as e: self.last_err = "critical handler: " + str(e)[:60]
        return len(items)

    def shield_active(self):
        with self.lock: return any(self.now() - e["ts"] < 3600 for e in self.events)

    def public(self):
        with self.lock:
            cnt = {k: sum(1 for i in self.items if i["sev"] == k) for k in ("CRITICAL", "HIGH", "MACRO", "INFO")}
            return {"items": list(self.items), "ts": self.ts, "error": self.last_err, "cfg": dict(self.cfg), "counts": cnt, "events": list(self.events),
                    "shield": any(self.now() - e["ts"] < 3600 for e in self.events), "source": "worldmonitor.app"}

    def run(self):
        while True:
            try: self.poll()
            except Exception as e: self.last_err = str(e)[:100]
            time.sleep(self.EVERY)

INTEL = None
INTEL_RL = _Bucket(3)  # at most 3 CRITICAL pushes a minute

def on_critical(item, cfg):
    """A fresh World Monitor CRITICAL: push it to your phone and (opt-in) shield the background bots."""
    acted = []
    if cfg.get("autoPause") or cfg.get("tighten"):
        if BOTS is not None: acted.append("%d bot(s) shielded" % BOTS.shield(pause=cfg.get("autoPause"), tighten=cfg.get("tighten")))
    if cfg.get("notify") and ALERTS is not None and getattr(ALERTS, "cfg", {}).get("enabled", True) and INTEL_RL.ok():
        ALERTS.send(neutralize("🚨 World Monitor CRITICAL: %s\n%s%s" % (item["title"][:220], item["source"][:40], (" · " + ", ".join(acted)) if acted else "")))
    return acted


class SwapTape:
    """v16.4 fast DEX swap tape: the page polls /api/swaps every 500 ms and is answered from RAM; one background fetch per
    pool refreshes from GeckoTerminal at most every MIN_GAP seconds (its free limit is shared with the rest of the app).
    Swaps are de-duplicated by transaction hash, so overlapping pages never double-count a wick."""
    MIN_GAP = 4.0
    MAX_ROWS = 300
    MAX_POOLS = 20
    RX = re.compile(r"^oc:([a-z0-9_-]{2,30}):([A-Za-z0-9]{20,90})$")

    def __init__(self):
        self.lock = threading.Lock(); self.pools = {}; self.err = ""

    def _fetch(self, sym, chain, pool):
        rows = []
        try:
            u = "https://api.geckoterminal.com/api/v2/networks/%s/pools/%s/trades" % (urllib.parse.quote(chain), urllib.parse.quote(pool))
            if not host_allowed(urllib.parse.urlparse(u).hostname): raise ValueError("host not allowed")
            with OPENER.open(urllib.request.Request(u, headers={"User-Agent": "ExTerm/1.0", "Accept": "application/json"}), timeout=8) as r:
                j = json.loads(r.read(2_000_000))
            for d in (j or {}).get("data") or []:
                a = d.get("attributes") or {}; tx = str(a.get("tx_hash") or d.get("id") or "")[:100]
                kind = "buy" if a.get("kind") == "buy" else "sell"
                px = float((a.get("price_to_in_usd") if kind == "buy" else a.get("price_from_in_usd")) or 0)
                ts = a.get("block_timestamp") or ""
                try:
                    from datetime import datetime as _dt
                    t = _dt.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
                except ValueError: t = 0
                if tx and px > 0 and t > 0: rows.append({"tx": tx, "ts": t, "price": px, "usd": float(a.get("volume_in_usd") or 0), "side": kind})
            self.err = ""
        except Exception as e:
            self.err = str(e)[:120]
        with self.lock:
            P = self.pools.get(sym)
            if P is None: return
            P["busy"] = False
            for x in sorted(rows, key=lambda r: r["ts"]):
                if x["tx"] in P["seen"]: continue
                P["seen"].add(x["tx"]); P["rows"].append(x)
            P["rows"] = P["rows"][-self.MAX_ROWS:]
            if len(P["seen"]) > 4 * self.MAX_ROWS: P["seen"] = set(r["tx"] for r in P["rows"])

    def get(self, sym, since):
        m = self.RX.match(sym or "")
        if not m: raise ValueError("unsupported symbol")
        now = time.time()
        with self.lock:
            P = self.pools.get(sym)
            if P is None:
                if len(self.pools) >= self.MAX_POOLS: self.pools.pop(min(self.pools, key=lambda k: self.pools[k]["used"]))
                P = self.pools[sym] = {"rows": [], "seen": set(), "at": 0.0, "busy": False, "used": now}
            P["used"] = now
            if not P["busy"] and now - P["at"] >= self.MIN_GAP:
                P["busy"] = True; P["at"] = now
                threading.Thread(target=self._fetch, args=(sym, m.group(1), m.group(2)), daemon=True).start()
            rows = [r for r in P["rows"] if r["ts"] > since]
        return {"sym": sym, "trades": rows, "error": self.err, "next_ms": 500}


SWAPS = SwapTape()


# ───────── v16.5 AI Bridge: 127.0.0.1/llm-signal (any local AI or trading bot → ExTerm's deterministic risk firewall) ─────────
# Zero custody: a proposal is only ever an idea. It is schema-checked and stop-checked here, signed into a receipt, and queued
# for the page, which applies the rest of the firewall (min ATR stop, depth, confidence threshold → PAPER shadow slot, loss-streak
# size cut) and then draws ghost lines or hands it to the existing four-gate live cockpit. Nothing here talks to an exchange.
LLM_SYM_RX = __import__("re").compile(r"^[A-Za-z0-9:$._/-]{1,140}$")
LLM_ADDR_RX = __import__("re").compile(r"^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$")
LLM_SIDES = {"long": "long", "buy": "long", "short": "short", "sell": "short"}


def _llm_num(v):
    if v is None or isinstance(v, bool): return None
    try:
        x = float(v) if isinstance(v, (int, float)) else float(str(v).replace(",", "").replace("$", "").strip())
    except (TypeError, ValueError):
        return None
    return x if x == x and abs(x) != float("inf") else None


def llm_check(j):
    """Structural firewall shared by every caller. Returns (normalized proposal, reasons). Empty reasons = accepted."""
    why = []
    if str(j.get("kind") or "trade") == "wallet_vet":
        w = str(j.get("wallet") or "")[:80]
        conf = _llm_num(j.get("confidence"))
        if conf is not None and 0 < conf <= 1: conf *= 100
        if not LLM_ADDR_RX.match(w): why.append("wallet must be an EVM or Solana address")
        if conf is None or not 0 <= conf <= 100: why.append("confidence must be 0-100")
        return {"kind": "wallet_vet", "wallet": w.lower() if w.startswith("0x") else w, "approve": j.get("approve") is True, "confidence": conf,
                "reason": str(j.get("reason") or "")[:300], "source": str(j.get("source") or "")[:40]}, why
    sym = str(j.get("symbol") or j.get("ticker") or "").lstrip("$").strip()
    side = LLM_SIDES.get(str(j.get("side") or j.get("direction") or j.get("action") or "").lower().strip())
    entry = _llm_num(j.get("entry", j.get("price")))
    sl = _llm_num(j.get("stop_loss", j.get("stop", j.get("sl"))))
    tp = j.get("tp", j.get("take_profit", j.get("targets")))
    tp = [x for x in (_llm_num(t) for t in (tp if isinstance(tp, list) else [] if tp is None else [tp])[:3]) if x is not None]
    conf = _llm_num(j.get("confidence"))
    if conf is not None and 0 < conf <= 1: conf *= 100
    if not LLM_SYM_RX.match(sym): why.append("bad or missing symbol")
    if side is None: why.append("side must be long / short / buy / sell")
    if entry is None or entry <= 0: why.append("entry price missing")
    if sl is None or sl <= 0: why.append("stop_loss missing: every proposal needs a stop-loss")
    elif entry and side == "long" and sl >= entry: why.append("wrong-way stop: long stop_loss must be below entry")
    elif entry and side == "short" and sl <= entry: why.append("wrong-way stop: short stop_loss must be above entry")
    if entry and any((side == "long" and t <= entry) or (side == "short" and t >= entry) for t in tp): why.append("take-profit on the losing side of entry")
    if conf is not None and not 0 <= conf <= 100: why.append("confidence must be 0-100")
    return {"kind": "trade", "symbol": sym[:140], "side": side, "entry": entry, "stop_loss": sl, "tp": tp, "confidence": None if conf is None else round(min(100, max(0, conf)), 1),
            "reason": str(j.get("reason") or "")[:300], "source": str(j.get("source") or j.get("provider") or j.get("model") or "bot")[:40]}, why


class LlmBridge:
    MAX = 300

    def __init__(self):
        self.lock = threading.Lock(); self.q = []; self.seq = 0; self.rl = _Bucket(60); self.counts = {"accepted": 0, "rejected": 0}
        self.key = (os.environ.get("EXTERM_BRIDGE_KEY") or "").strip() or self._load_key()

    def _load_key(self):
        p = DATA_DIR / "bridge.key"
        try:
            k = p.read_text(encoding="utf-8").strip()
            if len(k) >= 24: return k
        except OSError:
            pass
        k = secrets.token_urlsafe(24)
        try:
            DATA_DIR.mkdir(parents=True, exist_ok=True); p.write_text(k + "\n", encoding="utf-8")
            try: os.chmod(p, 0o600)
            except OSError: pass
        except OSError:
            pass  # read-only home: the key lives for this launch only
        return k

    def submit(self, j):
        prop, why = llm_check(j)
        with self.lock:
            self.seq += 1
            rc = {"id": secrets.token_hex(6), "seq": self.seq, "ts": round(time.time(), 3), "status": "rejected" if why else "accepted", "reasons": why, "proposal": prop}
            rc["sig"] = _hmac.new(self.key.encode(), json.dumps(rc, sort_keys=True, separators=(",", ":")).encode(), "sha256").hexdigest()
            self.q.append(rc); del self.q[:-self.MAX]; self.counts[rc["status"]] += 1
        return rc

    def since(self, seq):
        with self.lock:
            return {"seq": self.seq, "items": [r for r in self.q if r["seq"] > seq][-100:], "counts": dict(self.counts)}


LLM = None


# ── v17.5: 4 dedicated execution lanes ──────────────────────────────────────────────────────────────────────────────────
# Market / WS Ingest · On-Chain DEX / DAG Forensics · Heavy Quant / GEX / Shock Math · Copilot / Bot Execution. Each lane is its
# own single-worker ProcessPoolExecutor (lazy: the process starts on the lane's first job), so a 2 000-path Monte Carlo on the
# quant lane never delays a tick on the ingest lane or a request on this server's threads. Jobs are allow-listed, pure, top-level
# functions (picklable); arguments are numeric and size-capped. EXTERM_LANES=thread (or a platform without process pools) runs
# the same lanes as dedicated threads. --no-lanes turns the endpoint off.
import random as _lrand, math as _lm
def _lane_ping(x=0):
    return {"pong": x, "pid": os.getpid()}
def _lane_ohlc(ticks, bucket_ms):
    """ingest: [[t_ms, price, size], ...] -> OHLCV bars"""
    out = []; cur = None
    for t, p, s in ticks:
        k = int(t // bucket_ms * bucket_ms)
        if cur is None or cur[0] != k:
            cur = [k, p, p, p, p, 0.0]; out.append(cur)
        cur[2] = max(cur[2], p); cur[3] = min(cur[3], p); cur[4] = p; cur[5] += s
    return {"bars": out, "pid": os.getpid()}
def _lane_entropy(trades):
    """forensics: Sybil / wash-trading score 0-100 from [[from, to], ...] (counterparty entropy + round trips)"""
    if not trades: return {"score": 0, "entropy": 0.0, "pid": os.getpid()}
    cnt = {}; seen = set(); rt = 0
    for a, b in trades:
        k = (a, b) if a < b else (b, a); cnt[k] = cnt.get(k, 0) + 1
        if (b, a) in seen: rt += 1
        seen.add((a, b))
    n = len(trades); h = -sum((c / n) * _lm.log2(c / n) for c in cnt.values()); he = min(1.0, h / _lm.log2(max(2, n)))
    return {"score": round(max(0, min(100, (1 - he) * 60 + (rt / n) * 40))), "entropy": h, "roundTrip": rt / n, "pid": os.getpid()}
def _lane_bellman(nodes, edges):
    """forensics: Bellman-Ford multi-hop arbitrage on -log(rate) edges"""
    idx = {x: i for i, x in enumerate(nodes)}; n = len(nodes); dist = [0.0] * n; pred = [-1] * n
    es = [(idx[a], idx[b], -_lm.log(r), r) for a, b, r in edges if a in idx and b in idx and r > 0]; x = -1
    for _ in range(n):
        x = -1
        for u, v, w, _r in es:
            if dist[u] + w < dist[v] - 1e-12: dist[v] = dist[u] + w; pred[v] = u; x = v
    if x < 0: return {"arb": False, "cycle": [], "profit": 0.0, "pid": os.getpid()}
    for _ in range(n): x = pred[x]
    cyc = [x]; v = pred[x]
    while v != x and len(cyc) <= n: cyc.append(v); v = pred[v]
    cyc.append(x); cyc.reverse(); prod = 1.0
    for i in range(len(cyc) - 1):
        prod *= next((r for u, v2, _w, r in es if u == cyc[i] and v2 == cyc[i + 1]), 1.0)
    return {"arb": prod > 1, "cycle": [nodes[i] for i in cyc], "profit": prod - 1, "pid": os.getpid()}
def _lane_merton(s0, mu, sigma, lam, muj, sigj, T, steps, paths, seed):
    """quant: Merton jump-diffusion terminal distribution -> P10/P50/P90, EV, 95 % VaR / CVaR (seeded, deterministic)"""
    rnd = _lrand.Random(seed); dt = T / steps; k = _lm.exp(muj + sigj * sigj / 2) - 1; term = []
    for _ in range(paths):
        s = s0
        for _ in range(steps):
            nj = 0; L = _lm.exp(-lam * dt); p = rnd.random()
            while p > L and nj < 50: nj += 1; p *= rnd.random()
            J = sum(rnd.gauss(muj, sigj) for _ in range(nj))
            s *= _lm.exp((mu - lam * k - sigma * sigma / 2) * dt + sigma * _lm.sqrt(dt) * rnd.gauss(0, 1) + J)
        term.append(s / s0 - 1)
    term.sort(); q = lambda f: term[min(len(term) - 1, max(0, int(round(f * (len(term) - 1)))))]
    tail = [x for x in term if x <= q(0.05)] or [q(0.05)]
    return {"p10": s0 * (1 + q(0.1)), "p50": s0 * (1 + q(0.5)), "p90": s0 * (1 + q(0.9)), "ev": sum(term) / len(term), "var95": -q(0.05), "cvar95": -sum(tail) / len(tail), "paths": paths, "pid": os.getpid()}
def _lane_shock(mid, levels, spread_bps, depth_usd, order_usd, depth_pct, spoof_pct, vol_mult, side):
    """quant: model book walk under a shock (same model as the browser's V175.shock)"""
    hs = spread_bps / 2e4; tick = 0.0005; book = []
    for kk in range(levels):
        dec = _lm.exp(-kk / (levels * 0.45)) * 0.6 + 0.4; usd = depth_usd / levels * dec * 4
        px = mid * (1 - hs - kk * tick) if side == "sell" else mid * (1 + hs + kk * tick); book.append([px, usd / px])
    near = max(1, round(levels * 0.25)); left = order_usd; qty = cost = 0.0; used = 0; last = mid
    for kk, (px, q) in enumerate(book):
        if left <= 1e-9: break
        px = mid + (px - mid) * max(1.0, vol_mult); q = q * min(1.0, max(0.01, depth_pct)) * ((1 - spoof_pct) if kk < near else 1)
        take = min(q, left / px); qty += take; cost += take * px; left -= take * px; used += 1; last = px
    avg = cost / qty if qty else mid
    return {"slipBps": abs(avg / mid - 1) * 1e4 if qty else 0.0, "impactBps": abs(last / mid - 1) * 1e4, "levels": used, "unfilledUsd": left, "pid": os.getpid()}
def _lane_kelly(p, b, equity, risk_cap):
    """exec: Kelly fraction, capped position size for the bot squad"""
    f = max(-1.0, min(1.0, p - (1 - p) / max(1e-9, b))); size = max(0.0, min(f, risk_cap)) * equity
    return {"kelly": f, "size": size, "pid": os.getpid()}
LANE_JOBS = {
    "ingest": {"ping": (_lane_ping, 1), "ohlc": (_lane_ohlc, 2)},
    "forensics": {"ping": (_lane_ping, 1), "entropy": (_lane_entropy, 1), "bellman": (_lane_bellman, 2)},
    "quant": {"ping": (_lane_ping, 1), "merton": (_lane_merton, 10), "shock": (_lane_shock, 9)},
    "exec": {"ping": (_lane_ping, 1), "kelly": (_lane_kelly, 4)},
}
def lane_args_ok(lane, job, args):
    """numeric sanity + work caps so a request can't pin a core for minutes"""
    if lane not in LANE_JOBS or job not in LANE_JOBS[lane] or not isinstance(args, list) or len(args) != LANE_JOBS[lane][job][1]: return False
    num = lambda x: isinstance(x, (int, float)) and not isinstance(x, bool) and _lm.isfinite(x)
    if job == "ping": return num(args[0])
    if job == "ohlc": return isinstance(args[0], list) and len(args[0]) <= 200000 and all(isinstance(t, list) and len(t) == 3 and all(num(v) for v in t) for t in args[0]) and num(args[1]) and args[1] >= 1
    if job == "entropy": return isinstance(args[0], list) and len(args[0]) <= 100000 and all(isinstance(t, list) and len(t) == 2 and all(isinstance(v, str) and len(v) <= 64 for v in t) for t in args[0])
    if job == "bellman": return isinstance(args[0], list) and 1 < len(args[0]) <= 200 and all(isinstance(v, str) and len(v) <= 32 for v in args[0]) and isinstance(args[1], list) and len(args[1]) <= 5000 and all(isinstance(e, list) and len(e) == 3 and isinstance(e[0], str) and isinstance(e[1], str) and num(e[2]) for e in args[1])
    if job == "merton": return all(num(v) for v in args) and args[0] > 0 and args[3] >= 0 and args[6] > 0 and 1 <= args[7] <= 2000 and 1 <= args[8] <= 5000 and args[7] * args[8] <= 2000000
    if job == "shock": return all(num(v) for v in args[:8]) and args[8] in ("buy", "sell") and args[0] > 0 and 1 <= args[1] <= 2000
    if job == "kelly": return all(num(v) for v in args) and 0 <= args[0] <= 1 and args[1] > 0
    return False

class Lanes:
    NAMES = (("ingest", "Market / WS Ingest"), ("forensics", "On-Chain DEX / DAG Forensics"), ("quant", "Heavy Quant / GEX / Shock Math"), ("exec", "Copilot / Bot Execution"))
    def __init__(self, mode=None):
        self.mode = mode or os.environ.get("EXTERM_LANES", "process")
        self.pools = {}; self.lock = threading.Lock()
        self.st = {k: {"jobs": 0, "err": 0, "q": 0, "peak": 0, "ms": deque(maxlen=256), "kind": None, "pid": None, "at": 0} for k, _ in self.NAMES}
    def _pool(self, lane, force_thread=False):
        with self.lock:
            p = self.pools.get(lane)
            if p is not None and not force_thread: return p
            if p is not None:
                try: p.shutdown(wait=False, cancel_futures=True)
                except Exception: pass
            p = None
            if self.mode == "process" and not force_thread:
                try:
                    from concurrent.futures import ProcessPoolExecutor
                    p = ProcessPoolExecutor(max_workers=1); self.st[lane]["kind"] = "process"
                except Exception:
                    p = None
            if p is None:
                p = ThreadPoolExecutor(max_workers=1, thread_name_prefix="lane-" + lane); self.st[lane]["kind"] = "thread"
            self.pools[lane] = p
            return p
    def run(self, lane, job, args, timeout=30):
        fn = LANE_JOBS[lane][job][0]; st = self.st[lane]; t0 = time.perf_counter()
        with self.lock:
            st["q"] += 1; st["peak"] = max(st["peak"], st["q"])
        try:
            try:
                out = self._pool(lane).submit(fn, *args).result(timeout=timeout)
            except Exception as e:  # a process pool that can't start (frozen app, sandbox) falls back to a dedicated thread once
                if type(e).__name__ not in ("BrokenProcessPool", "PicklingError", "OSError", "PermissionError") or st["kind"] != "process": raise
                out = self._pool(lane, force_thread=True).submit(fn, *args).result(timeout=timeout)
            with self.lock:
                st["jobs"] += 1; st["pid"] = out.get("pid") if isinstance(out, dict) else None; st["at"] = time.time()
            return out
        except Exception:
            with self.lock: st["err"] += 1
            raise
        finally:
            with self.lock:
                st["q"] -= 1; st["ms"].append((time.perf_counter() - t0) * 1000)
    def public(self):
        rows = []
        with self.lock:
            for k, name in self.NAMES:
                s = self.st[k]; ms = sorted(s["ms"])
                rows.append({"lane": k, "name": name, "kind": s["kind"] or "cold", "jobs": s["jobs"], "err": s["err"], "q": s["q"], "peak": s["peak"],
                             "avg": (sum(ms) / len(ms)) if ms else 0, "p99": ms[min(len(ms) - 1, int(0.99 * (len(ms) - 1) + 0.5))] if ms else 0,
                             "isolated": s["kind"] == "process" and s["pid"] not in (None, os.getpid()), "state": "busy" if s["q"] else ("cold" if not s["kind"] else "idle")})
        return {"mode": self.mode, "lanes": rows, "server_pid": os.getpid()}
    def shutdown(self):
        for p in list(self.pools.values()):
            try: p.shutdown(wait=False, cancel_futures=True)
            except Exception: pass

LANES = None


# ── v17.8: 4 dedicated fast server lanes ───────────────────────────────────────────────────────────────────────────────
# Lane 5 Crypto / Perps / On-Chain PnL · Lane 6 Stocks / SEC Form 4 / 13F · Lane 7 Crypto + DEX live transactions tape ·
# Lane 8 US stocks tape / block prints / options flow / L2. Each lane is its own OS process (multiprocessing, spawn-safe
# top-level entry) with a 16-thread fetch pool; it pre-warms 24/7 and pushes finished snapshots to this server over a
# queue. Requests never wait on upstream: they read the RAM snapshot through a 50 ms LRU of encoded bytes (warm answers
# are sub-millisecond). Every row says where it came from: real upstream rows, `sample` (offline launcher) or `synth`
# (a clearly-tagged stand-in while the upstream is rate-limited, so a table is never empty). EXTERM_FASTLANES=thread runs the
# same loops as threads (frozen apps / tests); --no-fastlanes turns them off. HTTP is stdlib urllib with the launcher's pooled
# keep-alive sockets (HTTP/1.1; the standard library has no HTTP/2 client).
import math as _fm, random as _fr
FAST_WORKERS, FAST_LRU_TTL = 16, 0.05
LB_WIN = {"24h": 86400, "7d": 7 * 86400, "30d": 30 * 86400}
LB_BOARD_KEY = {"24h": "day", "7d": "week", "30d": "month"}
WHALE_BUY_USD, INSIDER_ALERT_USD = 50000.0, 100000.0
TAPE_SYM = re.compile(r"^(oc:[a-z0-9_-]{2,30}:[A-Za-z0-9_.-]{3,90}|[A-Z0-9]{2,12}-(USD|USDT|USDC|EUR)|[A-Z^][A-Z0-9.^=-]{0,11})$")

def smart_score(wr, n):
    """Smart Score = win rate (%) × ln(sample size); 0 below 2 closed trades (same formula as V178.smart in the page)"""
    return round(wr * 100 * _fm.log(n), 2) if wr is not None and n >= 2 else 0.0

def lb_rows(rows, fills, win, now_ms):
    """24h / 7d / 30d On-Chain PnL leaderboard rows: realized PnL, win rate, Smart Score, top tokens (pure, testable)"""
    cut = now_ms - LB_WIN[win] * 1000; out = []
    for r in rows:
        f = fills.get(r["addr"])
        if f is not None:
            win_f = [x for x in f if x.get("time", 0) >= cut]; closes = [x for x in win_f if x.get("closedPnl")]
            n = len(closes); wins = sum(1 for x in closes if x["closedPnl"] > 0); wr = (wins / n) if n else None
            realized = sum(x["closedPnl"] for x in closes) if n else r["pnl"][LB_BOARD_KEY[win]]
            tok = {}
            for x in win_f: tok[x["coin"]] = tok.get(x["coin"], 0.0) + abs(x.get("px", 0) * x.get("sz", 0))
            top = [k for k, _ in sorted(tok.items(), key=lambda kv: -kv[1])[:3]]; src = "fills"
        else:
            n, wr, realized, top, src = 0, None, r["pnl"][LB_BOARD_KEY[win]], [], "board"
        out.append({"addr": r["addr"], "name": r.get("name", ""), "acct": r["acct"], "pnl": round(realized, 2), "winRate": None if wr is None else round(wr * 100, 1),
                    "n": n, "smart": smart_score(wr, n), "tokens": top, "alpha": r.get("alpha", 0), "roi": r["roi"][LB_BOARD_KEY[win]], "src": src})
    return sorted(out, key=lambda x: -x["pnl"])

def whale_buys(fills, now_ms, min_usd=WHALE_BUY_USD):
    """opening buys ≥ min_usd in the last 24 h across the tracked wallets → newest-first notifications"""
    out = []
    for addr, f in fills.items():
        for x in f or []:
            d = str(x.get("dir", "")); usd = abs(x.get("px", 0) * x.get("sz", 0))
            if (d.startswith("Open Long") or d == "Buy") and usd >= min_usd and now_ms - x.get("time", 0) <= 86400000:
                out.append({"id": "%s:%d:%s" % (addr, x["time"], x["coin"]), "addr": addr, "coin": x["coin"], "usd": round(usd, 2), "px": x.get("px", 0), "t": x["time"]})
    return sorted(out, key=lambda a: -a["t"])[:100]

def _sec_hdr():
    return {"User-Agent": "ExTerm personal research tool " + (os.environ.get("EXTERM_SEC_CONTACT") or "exterm-user@example.com"), "Accept-Encoding": "identity", "Accept": "application/json, text/xml, */*"}

def _xml_safe(b):
    if len(b) > 4_000_000 or b"<!ENTITY" in b or b"<!DOCTYPE" in b[:2000]: raise ValueError("unsafe or oversized XML")
    import xml.etree.ElementTree as ET
    return ET.fromstring(b)

FORM4_CODES = {"P": "Buy", "S": "Sale", "A": "Award", "M": "Option exercise", "X": "Option exercise", "F": "Tax withholding", "G": "Gift"}
def parse_form4(xml_bytes, meta):
    """SEC Form 4 XML → transactions (insider, role, code, shares, price, value); P = open-market buy, S = sale"""
    root = _xml_safe(xml_bytes)
    g = lambda el, path: ((el.findtext(path) if el is not None else "") or "").strip()
    tk = g(root, "issuer/issuerTradingSymbol").upper()[:12]; co = g(root, "issuer/issuerName")[:80]
    ow = root.find("reportingOwner"); rel = ow.find("reportingOwnerRelationship") if ow is not None else None; roles = []
    yes = lambda k: g(rel, k).lower() in ("1", "true")
    if yes("isOfficer"): roles.append(g(rel, "officerTitle")[:40] or "Officer")
    if yes("isDirector"): roles.append("Director")
    if yes("isTenPercentOwner"): roles.append("10% owner")
    who = _CTRL_RX.sub("", g(ow, "reportingOwnerId/rptOwnerName"))[:60]; out = []
    for k, t in enumerate(root.findall("nonDerivativeTable/nonDerivativeTransaction")):
        code = g(t, "transactionCoding/transactionCode")[:2]
        sh = _hnum(g(t, "transactionAmounts/transactionShares/value")); px = _hnum(g(t, "transactionAmounts/transactionPricePerShare/value"))
        out.append({"id": "%s:%d" % (meta.get("acc", ""), k), "ticker": tk, "company": co, "insider": who, "role": ", ".join(roles), "code": code, "type": FORM4_CODES.get(code, code),
                    "date": g(t, "transactionDate/value")[:10], "filed": meta.get("filed", ""), "shares": sh, "price": px, "value": round(sh * px, 2), "url": meta.get("url", "")})
    return out

def insider_clusters(rows, now_s, days=30):
    """tickers with open-market buys (code P) from ≥ 1 insider in the window, ranked by distinct insiders then $; CEO / CFO / Director flags"""
    from datetime import datetime as _dt
    cut = now_s - days * 86400; g = {}
    for r in rows:
        if r["code"] != "P": continue
        try: ts = _dt.fromisoformat(r["date"]).timestamp()
        except ValueError: continue
        if ts < cut: continue
        x = g.setdefault(r["ticker"], {"ticker": r["ticker"], "company": r["company"], "insiders": {}, "value": 0.0, "n": 0})
        x["insiders"][r["insider"]] = r["role"]; x["value"] += r["value"]; x["n"] += 1
    out = []
    for x in g.values():
        roles = " ".join(x["insiders"].values()).upper()
        out.append({"ticker": x["ticker"], "company": x["company"], "insiders": len(x["insiders"]), "value": round(x["value"], 2), "n": x["n"],
                    "ceo": "CEO" in roles or "CHIEF EXECUTIVE" in roles, "cfo": "CFO" in roles or "CHIEF FINANCIAL" in roles, "director": "DIRECTOR" in roles})
    return sorted(out, key=lambda c: (-c["insiders"], -c["value"]))

class MicroLRU:
    """50 ms micro-cache of encoded response bytes (repeat polls skip JSON encoding entirely)"""
    def __init__(self, cap=512, ttl=FAST_LRU_TTL):
        from collections import OrderedDict
        self.cap, self.ttl, self.d, self.lock, self.hits, self.miss = cap, ttl, OrderedDict(), threading.Lock(), 0, 0
    def get(self, k):
        with self.lock:
            v = self.d.get(k)
            if v and time.perf_counter() - v[0] < self.ttl: self.d.move_to_end(k); self.hits += 1; return v[1]
            self.miss += 1; return None
    def put(self, k, b):
        with self.lock:
            self.d[k] = (time.perf_counter(), b); self.d.move_to_end(k)
            while len(self.d) > self.cap: self.d.popitem(last=False)

# ---- worker-side warmers (run inside the lane process) ----
def _jget(url, hdr=None, timeout=12):
    st, body, _ct = shield_fetch(url, "GET", None, hdr or {"User-Agent": "ExTerm/1.0", "Accept": "application/json"}, timeout=timeout)
    return json.loads(body)

def _sample_whales(rows, now_ms):
    R = _fr.Random(1780); out = []
    for i, r in enumerate(rows[:10]):
        coin = R.choice([c for c, _ in HL_SAMPLE_COINS]); px = dict(HL_SAMPLE_COINS)[coin]; usd = R.uniform(55000, 900000)
        out.append({"id": "sample:%s:%d" % (r["addr"], i), "addr": r["addr"], "coin": coin, "usd": round(usd, 2), "px": px, "t": now_ms - i * 371000 - R.randint(0, 90000), "sample": True})
    return out

def _warm5(st, pool, offline, wants):
    hl = st.get("hl") or HLCache(offline=offline); st["hl"] = hl; now = int(time.time() * 1000)
    b = hl.board(); rows = [r for r in b["rows"] if r["acct"] >= 1e4][:60]; fills = st.setdefault("fills", {})
    # offline: score every wallet at once; live: 24 on the first pass, then 8 per 15 s (≈ 640 weight / min, under Hyperliquid's 1 200)
    due = sorted(rows, key=lambda r: st.setdefault("fat", {}).get(r["addr"], 0))[:len(rows) if offline else 24 if not fills else 8]
    def one(r):
        try: return r["addr"], hl.trader(r["addr"], ["userFills"])["userFills"]
        except Exception: return r["addr"], None
    for addr, f in pool.map(one, due):
        st["fat"][addr] = time.time()
        if f is not None: fills[addr] = f
    snap = {"board:" + w: {"win": w, "rows": lb_rows(rows, fills, w, now), "sample": bool(b.get("sample")), "wallets": len(rows), "scored": len(fills), "ts": time.time()} for w in LB_WIN}
    wb = whale_buys(fills, now); snap["whales"] = {"items": wb or (_sample_whales(rows, now) if b.get("sample") else []), "sample": bool(b.get("sample")), "ts": time.time()}
    snap["perps"] = {"rows": [{"addr": r["addr"], "name": r["name"], "acct": r["acct"], "pnl30": r["pnl"]["month"], "roi30": r["roi"]["month"], "alpha": r["alpha"]} for r in sorted(b["rows"], key=lambda r: -r["pnl"]["month"])[:30]], "sample": bool(b.get("sample")), "ts": time.time()}
    return snap

def _sample_form4(now_s):
    R = _fr.Random(1786); out = []
    tks = [("AAPL", "Apple Inc.", 230), ("NVDA", "NVIDIA Corp", 140), ("MSFT", "Microsoft Corp", 430), ("TSLA", "Tesla Inc", 250), ("AMZN", "Amazon.com Inc", 200), ("META", "Meta Platforms", 580), ("JPM", "JPMorgan Chase", 240), ("PLTR", "Palantir", 70)]
    names = ["J. Smith", "M. Chen", "A. Patel", "R. Johnson", "L. Garcia", "S. Okafor", "D. Kim", "E. Rossi", "T. Nguyen", "K. Muller"]; roles = ["CEO", "CFO", "Director", "COO", "10% owner", "Director"]
    for i in range(160):
        tk, co, px = R.choice(tks); code = "P" if R.random() < 0.38 else "S"; sh = round(500 + R.random() * R.random() * 90000); d = time.strftime("%Y-%m-%d", time.gmtime(now_s - R.random() * 25 * 86400))
        out.append({"id": "sample:%d" % i, "ticker": tk, "company": co, "insider": R.choice(names), "role": R.choice(roles), "code": code, "type": FORM4_CODES[code], "date": d, "filed": d,
                    "shares": sh, "price": round(px * R.uniform(0.96, 1.04), 2), "value": 0, "url": "", "sample": True})
        out[-1]["value"] = round(out[-1]["shares"] * out[-1]["price"], 2)
    return sorted(out, key=lambda r: r["date"], reverse=True)

def _edgar_atom(form, count=100):
    import xml.etree.ElementTree as ET
    st, body, _ = shield_fetch("https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=%s&company=&dateb=&owner=include&count=%d&output=atom" % (urllib.parse.quote(form), count), "GET", None, _sec_hdr(), timeout=20)
    root = _xml_safe(body); ns = {"a": "http://www.w3.org/2005/Atom"}; out = []
    for en in root.findall("a:entry", ns):
        ln = en.find("a:link", ns); href = ln.get("href") if ln is not None else ""; m = re.search(r"edgar/data/(\d+)/(\d{18})/", href or "")
        if not m: continue
        acc = "%s-%s-%s" % (m.group(2)[:10], m.group(2)[10:12], m.group(2)[12:])
        out.append({"cik": m.group(1), "acc": acc, "title": _CTRL_RX.sub("", en.findtext("a:title", "", ns))[:120], "filed": (en.findtext("a:updated", "", ns) or "")[:10], "url": href})
    return out

def _warm6(st, pool, offline, wants):
    now = time.time(); rows = st.setdefault("f4", []); seen = st.setdefault("seen", set())
    if offline:
        if not rows: rows.extend(_sample_form4(now))
        if not st.get("f13"): st["f13"] = [{"filer": n, "cik": str(100000 + i), "filed": time.strftime("%Y-%m-%d", time.gmtime(now - i * 86400 * 0.6)), "url": "", "sample": True} for i, n in enumerate(["Sample Capital LP", "Northwind Advisors", "Bluewater Partners", "Granite Peak Mgmt", "Harbor Lane Investments", "Summit Ridge Capital"])]
    elif now - st.get("f4at", 0) >= 60:
        st["f4at"] = now
        try:
            jobs = [e for e in _edgar_atom("4") if e["acc"] not in seen][:20]
            def one(e):
                try:
                    time.sleep(0.15 * (hash(e["acc"]) % 4))  # stay well under SEC's 10 requests / s
                    idx = _jget("https://www.sec.gov/Archives/edgar/data/%d/%s/index.json" % (int(e["cik"]), e["acc"].replace("-", "")), _sec_hdr())
                    f = next((x["name"] for x in (idx.get("directory") or {}).get("item") or [] if re.search(r"\.xml$", x.get("name", ""), re.I) and not re.match(r"(?i)xsl|FilingSummary", x["name"])), None)
                    if not f: return []
                    _s, body, _c = shield_fetch("https://www.sec.gov/Archives/edgar/data/%d/%s/%s" % (int(e["cik"]), e["acc"].replace("-", ""), urllib.parse.quote(f)), "GET", None, _sec_hdr(), timeout=20)
                    return parse_form4(body, {"acc": e["acc"], "filed": e["filed"], "url": e["url"]})
                except Exception: return []
            with ThreadPoolExecutor(max_workers=4) as sec_pool:  # SEC fair access: 4 at a time, inside the lane's 16-thread budget
                for e, got in zip(jobs, sec_pool.map(one, jobs)): seen.add(e["acc"]); rows[:0] = got
            del rows[1500:]; st["err6"] = ""
        except Exception as ex: st["err6"] = str(ex)[:120]
        if now - st.get("f13at", 0) >= 600:
            try: st["f13"] = [{"filer": re.sub(r"^13F-HR\s*-\s*", "", e["title"])[:80], "cik": e["cik"], "filed": e["filed"], "url": e["url"]} for e in _edgar_atom("13F-HR", 40)]; st["f13at"] = now
            except Exception: pass
    smp = offline
    alerts = [dict(r, alert=True) for r in rows if r["code"] == "P" and r["value"] >= INSIDER_ALERT_USD][:60]
    return {"insiders": {"rows": rows[:400], "sample": smp, "err": st.get("err6", ""), "ts": now}, "clusters": {"rows": insider_clusters(rows, now)[:40], "sample": smp, "ts": now},
            "alerts": {"items": alerts, "sample": smp, "ts": now}, "f13": {"rows": st.get("f13") or [], "sample": smp, "ts": now, "congress": "Congressional trades: no free, key-less public source is available, so ExTerm does not show them."}}

def synth_prints(sym, px, n, seed_t, stock=False):
    """clearly-tagged stand-in prints (synth: True) around px, so a tape never sits empty while the upstream is rate-limited"""
    R = _fr.Random(hash((sym, int(seed_t))) & 0xFFFFFFFF); out = []; p = px if px > 0 else 100.0; t = seed_t * 1000
    for i in range(n):
        p *= 1 + R.gauss(0, 0.0004); side = "buy" if R.random() < 0.5 else "sell"; usd = (10 ** R.uniform(1.6, 4.4)) * (8 if stock else 1)
        if R.random() < 0.02: usd *= 40
        out.append({"id": "synth:%s:%d:%d" % (sym, int(seed_t), i), "t": int(t - (n - i) * R.uniform(80, 900)), "px": round(p, 8), "usd": round(usd, 2), "qty": usd / p, "side": side, "who": "SYNTH", "synth": True, "tags": []})
    return out

def tape_tags(rows, whale_usd):
    """whale / MEV (same wallet buys and sells inside 2 s) / wallet badges (WHALE ≥ $100K cumulative · BOT ≥ 5 prints / min · NEW)"""
    by = {}
    for r in rows: by.setdefault(r.get("who") or "", []).append(r)
    for who, rs in by.items():
        tot = sum(x["usd"] for x in rs); rs.sort(key=lambda x: x["t"]); span = max(1, (rs[-1]["t"] - rs[0]["t"]) / 60000)
        badge = "WHALE" if tot >= 100000 else "BOT" if len(rs) >= 5 and len(rs) / span >= 5 else "NEW" if len(rs) == 1 else ""
        for i, x in enumerate(rs):
            tg = [t for t in x.get("tags", []) if t not in ("WHALE", "MEV")]
            if x["usd"] >= whale_usd: tg.append("WHALE")
            if who and who != "SYNTH" and any(y["side"] != x["side"] and abs(y["t"] - x["t"]) <= 2000 for y in rs[max(0, i - 3):i + 4] if y is not x): tg.append("MEV")
            x["tags"] = tg; x["badge"] = badge if who and who != "SYNTH" else ""
    return rows

def _tape_merge(P, new, cap=300):
    for x in sorted(new, key=lambda r: r["t"]):
        if x["id"] in P["seen"]: continue
        P["seen"].add(x["id"]); P["rows"].append(x)
    del P["rows"][:-cap]
    if len(P["seen"]) > 4 * cap: P["seen"] = set(r["id"] for r in P["rows"])

def _fetch7(sym, P, offline, now):
    if offline: raise UpstreamBlocked(503, 1, "offline")
    if sym.startswith("oc:"):
        if now - P.get("gat", 0) < 4.0: return None
        P["gat"] = now; _, chain, pool = sym.split(":", 2)
        j = _jget("https://api.geckoterminal.com/api/v2/networks/%s/pools/%s/trades" % (urllib.parse.quote(chain), urllib.parse.quote(pool)), timeout=8); out = []
        from datetime import datetime as _dt
        for d in (j or {}).get("data") or []:
            a = d.get("attributes") or {}; kind = "buy" if a.get("kind") == "buy" else "sell"; px = _hnum(a.get("price_to_in_usd") if kind == "buy" else a.get("price_from_in_usd"))
            try: t = int(_dt.fromisoformat(str(a.get("block_timestamp") or "").replace("Z", "+00:00")).timestamp() * 1000)
            except ValueError: continue
            usd = _hnum(a.get("volume_in_usd"))
            if px > 0: out.append({"id": str(a.get("tx_hash") or d.get("id"))[:100], "t": t, "px": px, "usd": usd, "qty": usd / px, "side": kind, "who": str(a.get("tx_from_address") or "")[:64], "tags": []})
        return out, "geckoterminal"
    j = _jget("https://api.exchange.coinbase.com/products/%s/trades?limit=100" % urllib.parse.quote(sym.replace("-USDT", "-USD")), timeout=6)
    from datetime import datetime as _dt
    out = []
    for x in j if isinstance(j, list) else []:
        px, sz = _hnum(x.get("price")), _hnum(x.get("size"))
        try: t = int(_dt.fromisoformat(str(x.get("time", "")).replace("Z", "+00:00")).timestamp() * 1000)
        except ValueError: continue
        if px > 0: out.append({"id": "cb:%s" % x.get("trade_id"), "t": t, "px": px, "usd": px * sz, "qty": sz, "side": "sell" if x.get("side") == "buy" else "buy", "who": "Coinbase", "tags": []})  # Coinbase reports the maker side
    return out, "coinbase"

def _warm_tape(st, pool, offline, wants, lane):
    now = time.time(); tapes = st.setdefault("tapes", {})
    for sym, px in wants.items(): tapes.setdefault(sym, {"rows": [], "seen": set(), "px": px, "src": "", "synth": False, "at": 0})
    for sym in list(tapes):
        if sym not in wants: tapes.pop(sym)
    def one(sym):
        P = tapes[sym]
        try:
            got = (_fetch7 if lane == 7 else _fetch8)(sym, P, offline, now)
            if got is None: return sym, None, None
            return sym, got[0], got[1]
        except Exception:
            return sym, synth_prints(sym, P["rows"][-1]["px"] if P["rows"] else P["px"], 6 if P["rows"] else 40, now, lane == 8), "synth"
    snap = {}
    for sym, new, src in pool.map(one, list(tapes)):
        P = tapes[sym]
        if new is not None:
            _tape_merge(P, new); P["src"] = src; P["synth"] = src == "synth"; P["at"] = now
            if src != "synth": P["real"] = now
        rows = tape_tags(P["rows"][-300:], 25000 if lane == 7 and not sym.startswith("oc:") else 10000 if lane == 7 else 250000)
        last = rows[-1]["px"] if rows else P["px"]
        snap["tape:" + sym] = {"sym": sym, "rows": rows, "src": P["src"], "synth": P["synth"], "sample": offline, "ts": now, "realAge": round(now - P["real"], 1) if P.get("real") else None}
        if lane == 8: snap["tape:" + sym].update({"l2": model_l2(last, sym), "blocks": [r for r in rows if "BLOCK" in r["tags"]][-40:], "sweeps": P.get("sweeps", []), "session": P.get("session", "")})
    return snap

def model_l2(px, sym, levels=10):
    """modelled L2 (model: True): no free US-equities depth feed exists; tick-sized ladder around the last price"""
    if not px > 0: return {"bids": [], "asks": [], "model": True}
    tick = 0.01 if px >= 1 else 0.0001; R = _fr.Random(hash((sym, int(time.time()))) & 0xFFFF)
    bids = [[round(px - tick * (i + 1), 4), round(100 * R.uniform(1, 30) * (1 + i * 0.3))] for i in range(levels)]
    asks = [[round(px + tick * (i + 1), 4), round(100 * R.uniform(1, 30) * (1 + i * 0.3))] for i in range(levels)]
    return {"bids": bids, "asks": asks, "model": True}

def _fetch8(sym, P, offline, now):
    if offline: raise UpstreamBlocked(503, 1, "offline")
    if now - P.get("yat", 0) < 15: return None
    P["yat"] = now
    j = _jget("https://query1.finance.yahoo.com/v8/finance/chart/%s?range=1d&interval=1m" % urllib.parse.quote(sym), {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}, timeout=8)
    r = ((j or {}).get("chart") or {}).get("result") or []
    if not r: raise ValueError("no chart")
    r = r[0]; ts = r.get("timestamp") or []; q = ((r.get("indicators") or {}).get("quote") or [{}])[0]; meta = r.get("meta") or {}
    P["session"] = "live" if (meta.get("currentTradingPeriod") or {}).get("regular", {}).get("end", 0) > now > (meta.get("currentTradingPeriod") or {}).get("regular", {}).get("start", 0) else "last"
    out = []; usds = []; prev = 0
    for i, t in enumerate(ts):
        c = (q.get("close") or [None])[i] if i < len(q.get("close") or []) else None; v = (q.get("volume") or [None])[i] if i < len(q.get("volume") or []) else None
        if not c or not v: continue
        usds.append(c * v); out.append({"id": "y:%s:%d" % (sym, t), "t": t * 1000 + 59000, "px": round(c, 4), "usd": round(c * v, 2), "qty": v, "side": "buy" if c >= (prev or c) else "sell", "who": str(meta.get("exchangeName") or "Consolidated")[:24], "tags": ["1M AGG"]}); prev = c
    avg = sum(usds) / len(usds) if usds else 0
    for x in out:
        if avg and x["usd"] >= 3 * avg and x["usd"] >= 1e6: x["tags"].append("BLOCK")
    if now - P.get("oat", 0) >= 60:
        P["oat"] = now
        try:
            oj = _jget("https://query2.finance.yahoo.com/v7/finance/options/%s" % urllib.parse.quote(sym), {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}, timeout=8)
            oc = ((((oj or {}).get("optionChain") or {}).get("result") or [{}])[0].get("options") or [{}])[0]; sw = []
            for side in ("calls", "puts"):
                for c in oc.get(side) or []:
                    vol, oi, last = _hnum(c.get("volume")), _hnum(c.get("openInterest")), _hnum(c.get("lastPrice")); prem = vol * last * 100
                    if vol > max(oi, 1) and prem >= 250000: sw.append({"contract": str(c.get("contractSymbol"))[:32], "side": side[:-1], "strike": _hnum(c.get("strike")), "vol": vol, "oi": oi, "premium": round(prem), "flag": "SWEEP?"})
            P["sweeps"] = sorted(sw, key=lambda s: -s["premium"])[:20]
        except Exception: P["sweeps"] = P.get("sweeps", [])
    return out, "yahoo-1m"

import math
# ── v17.9: Lanes 9–19 · the unified 19-lane mesh ───────────────────────────────────────────────────────────────────────────
# 9–10  1s–1M OHLCV engines (crypto + DEX / US equities), stitched live onto every timeframe the chart pills offer
# 11–16 the 24/7 recommendation pipeline: three scanners (equities 0DTE gamma · crypto perps squeeze · on-chain Rug Shield v2) →
#       14 transfer-entropy + BOCPD + 6-bot consensus → 15 1,000-path fat-tailed Monte Carlo + liquidity stress → 16 multi-timeframe
#       confluence + journal correlator (tiers S-TIER / A / B+ / Watchlist, with Passed / Pending / Failed criteria badges)
# 17–19 request / response engines answered from the lane process (< 5 ms): smart-order-route + shadow-bracket slicer (plans only:
#       ExTerm holds no keys), pre-trade risk firewall + PIN-gated PAPER → LIVE arming, fill accuracy + toxic-flow scratch + 3-stage
#       ratchet + SHA-256 hash-chained audit ledger. Every number derived from a proxy says so (`proxy` / `est.` / `model`).
EQ_UNI = ("SPY", "QQQ", "IWM", "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA", "AMD", "AVGO", "JPM", "NFLX", "PLTR", "COIN", "MSTR", "UBER", "XOM", "SMCI")
CR_UNI = ("BTC", "ETH", "SOL", "XRP", "DOGE", "AVAX", "LINK", "SUI", "HYPE")
DEX_CHAINS = ("solana", "base", "eth", "arbitrum")
TF_SEC = {"1s": 1, "5s": 5, "15s": 15, "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400, "1w": 604800, "1M": 2592000}
MTF = ("1m", "5m", "15m", "1h", "1d")
BOTS6 = ("HUNTER-α", "MUTATOR-EVO", "HEDGER-ARB", "RISK-GUARD", "SNIPER-EXEC", "SCALPER-EXIT")
LANE_WORKERS = {5: 16, 6: 16, 7: 16, 8: 16, 9: 16, 10: 16, 11: 32, 12: 32, 13: 32, 14: 32, 15: 32, 16: 32, 17: 32, 18: 32, 19: 32}

def bucket_of(t, tf):
    """bucket start (unix s) for a timeframe; 1w aligns to Monday 00:00 UTC, 1M to the calendar month"""
    if tf == "1M":
        g = time.gmtime(t); import calendar
        return calendar.timegm((g.tm_year, g.tm_mon, 1, 0, 0, 0))
    if tf == "1w": return (int(t) - 345600) // 604800 * 604800 + 345600
    s = TF_SEC[tf]; return int(t) // s * s

def agg_bars(bars, tf):
    """[[t, o, h, l, c, v]] ascending (t in s) → bars of `tf` (exact OHLCV aggregation)"""
    out = []
    for t, o, h, l, c, v in bars:
        k = bucket_of(t, tf)
        if out and out[-1][0] == k: b = out[-1]; b[2] = max(b[2], h); b[3] = min(b[3], l); b[4] = c; b[5] += v
        else: out.append([k, o, h, l, c, v])
    return out

def stitch(bars, ticks, tf):
    """overlay live ticks [[t_ms, px, size]] onto bars: the forming bar (and any newer ones) end exactly at the last tick"""
    out = [list(b) for b in bars]
    for tm, px, sz in sorted(ticks):
        t = tm / 1000.0; k = bucket_of(t, tf)
        if out and k < out[-1][0]: continue
        if out and out[-1][0] == k: b = out[-1]; b[2] = max(b[2], px); b[3] = min(b[3], px); b[4] = px; b[5] += sz
        else: out.append([k, out[-1][4] if out else px, max(px, out[-1][4] if out else px), min(px, out[-1][4] if out else px), px, sz])
    return out

def sample_bars(sym, tf, n=300, px=0.0):
    """seeded offline OHLCV (sample: True) ending now; deterministic per symbol + timeframe"""
    R = _fr.Random(int(hashlib.sha256((sym + tf).encode()).hexdigest()[:8], 16)); s = TF_SEC[tf]; now = time.time(); p = px if px > 0 else 10 ** R.uniform(0, 4); vol = 0.002 * math.sqrt(s / 60.0) if 'math' in globals() else 0.002
    out = []; t0 = bucket_of(now, tf) - (n - 1) * s; c = p * R.uniform(0.8, 1.2)
    for i in range(n):
        o = c; c = o * (1 + R.gauss(0, min(0.08, vol))); h = max(o, c) * (1 + abs(R.gauss(0, vol / 3))); l = min(o, c) * (1 - abs(R.gauss(0, vol / 3)))
        out.append([bucket_of(t0 + i * s, tf), round(o, 8), round(h, 8), round(l, 8), round(c, 8), round(R.uniform(10, 1000), 4)])
    if px > 0 and out:  # end on the page's price
        f = px / out[-1][4]; out = [[b[0]] + [round(x * f, 8) for x in b[1:5]] + [b[5]] for b in out]
    return out

def trend_sign(bars, n=20):
    """+1 / −1 / 0: close vs its n-bar mean and the mean's slope"""
    if len(bars) < n + 2: return 0
    cs = [b[4] for b in bars[-(n + 2):]]; m1 = sum(cs[-n:]) / n; m0 = sum(cs[-n - 1:-1]) / n
    return 1 if cs[-1] > m1 and m1 >= m0 else -1 if cs[-1] < m1 and m1 <= m0 else 0

def atr_of(bars, n=14):
    if len(bars) < 2: return 0.0
    trs = [max(b[2] - b[3], abs(b[2] - a[4]), abs(b[3] - a[4])) for a, b in zip(bars[:-1], bars[1:])][-n:]
    return sum(trs) / len(trs) if trs else 0.0

# ---- Lane 9 / 10: OHLCV engines ----
CB_GRAN = {"1m": (60, "1m"), "5m": (300, "5m"), "15m": (900, "15m"), "1h": (3600, "1h"), "4h": (3600, "4h"), "1d": (86400, "1d"), "1w": (86400, "1w"), "1M": (86400, "1M")}
GT_TF = {"1m": ("minute", 1, "1m"), "5m": ("minute", 5, "5m"), "15m": ("minute", 15, "15m"), "1h": ("hour", 1, "1h"), "4h": ("hour", 4, "4h"), "1d": ("day", 1, "1d"), "1w": ("day", 1, "1w"), "1M": ("day", 1, "1M")}
YF_TF = {"1m": ("1m", "5d", "1m"), "5m": ("5m", "1mo", "5m"), "15m": ("15m", "1mo", "15m"), "1h": ("60m", "3mo", "1h"), "4h": ("60m", "6mo", "4h"), "1d": ("1d", "2y", "1d"), "1w": ("1wk", "10y", "1w"), "1M": ("1mo", "max", "1M")}

def _cb_trades(sym, limit=1000):
    j = _jget("https://api.exchange.coinbase.com/products/%s/trades?limit=%d" % (urllib.parse.quote(sym.replace("-USDT", "-USD")), limit), timeout=6); out = []
    from datetime import datetime as _dt
    for x in j if isinstance(j, list) else []:
        try: out.append([int(_dt.fromisoformat(str(x["time"]).replace("Z", "+00:00")).timestamp() * 1000), _hnum(x["price"]), _hnum(x["size"])])
        except Exception: continue
    return out

def _gt_trades(chain, pool):
    j = _jget("https://api.geckoterminal.com/api/v2/networks/%s/pools/%s/trades" % (urllib.parse.quote(chain), urllib.parse.quote(pool)), timeout=8); out = []
    from datetime import datetime as _dt
    for d in (j or {}).get("data") or []:
        a = d.get("attributes") or {}; kind = a.get("kind"); px = _hnum(a.get("price_to_in_usd") if kind == "buy" else a.get("price_from_in_usd"))
        try: t = int(_dt.fromisoformat(str(a.get("block_timestamp") or "").replace("Z", "+00:00")).timestamp() * 1000)
        except ValueError: continue
        if px > 0: out.append([t, px, _hnum(a.get("volume_in_usd")) / px, str(a.get("tx_from_address") or "")[:64], kind])
    return out

def candles9(sym, tf):
    """crypto / DEX bars for one timeframe (real upstream; raises on failure)"""
    if sym.startswith("oc:"):
        _, chain, pool = sym.split(":", 2)
        if TF_SEC[tf] < 60:
            tr = _gt_trades(chain, pool); return stitch([], [[t, p, q] for t, p, q, _w, _k in tr], tf), "geckoterminal-trades"
        name, ag, base = GT_TF[tf]
        j = _jget("https://api.geckoterminal.com/api/v2/networks/%s/pools/%s/ohlcv/%s?aggregate=%d&limit=300" % (urllib.parse.quote(chain), urllib.parse.quote(pool), name, ag), timeout=8)
        rows = sorted([[int(r[0]), _hnum(r[1]), _hnum(r[2]), _hnum(r[3]), _hnum(r[4]), _hnum(r[5])] for r in (((j or {}).get("data") or {}).get("attributes") or {}).get("ohlcv_list") or []])
        return (agg_bars(rows, tf) if tf in ("1w", "1M") else rows), "geckoterminal"
    if TF_SEC[tf] < 60:
        return stitch([], _cb_trades(sym), tf), "coinbase-trades"
    g, _ = CB_GRAN[tf]
    j = _jget("https://api.exchange.coinbase.com/products/%s/candles?granularity=%d" % (urllib.parse.quote(sym.replace("-USDT", "-USD")), g), timeout=8)
    rows = sorted([[int(k[0]), _hnum(k[3]), _hnum(k[2]), _hnum(k[1]), _hnum(k[4]), _hnum(k[5])] for k in j if isinstance(k, list) and len(k) >= 6])
    rows = agg_bars(rows, tf) if tf in ("4h", "1w", "1M") else rows
    try: rows = stitch(rows, _cb_trades(sym, 100), tf)
    except Exception: pass
    return rows, "coinbase"

def candles10(sym, tf):
    if TF_SEC[tf] < 60: raise ValueError("seconds bars for US equities come from the launcher's tick feed")
    iv, rng, _ = YF_TF[tf]
    j = _jget("https://query1.finance.yahoo.com/v8/finance/chart/%s?range=%s&interval=%s" % (urllib.parse.quote(sym), rng, iv), {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}, timeout=8)
    r = (((j or {}).get("chart") or {}).get("result") or [None])[0]
    if not r: raise ValueError("no chart")
    q = ((r.get("indicators") or {}).get("quote") or [{}])[0]; ts = r.get("timestamp") or []; rows = []
    for i, t in enumerate(ts):
        try: o, h, l, c, v = q["open"][i], q["high"][i], q["low"][i], q["close"][i], q["volume"][i] or 0
        except (KeyError, IndexError): continue
        if None not in (o, h, l, c): rows.append([int(t), o, h, l, c, v])
    rows = agg_bars(rows, tf) if tf == "4h" else rows
    last = _hnum((r.get("meta") or {}).get("regularMarketPrice"))
    if rows and last > 0: rows = stitch(rows, [[int(time.time() * 1000), last, 0]], tf)
    return rows, "yahoo"

def _warm_ohlc(st, pool, offline, wants, lane):
    """on-demand: every wanted sym|tf is refreshed (seconds bars every second, minute bars every 10 s, daily+ every 5 min);
    plus the multi-timeframe trend table for the scanner universe, forwarded to Lane 16"""
    now = time.time(); cache = st.setdefault("c", {}); snap = {}
    def per(tf): return 1 if TF_SEC[tf] < 60 else 10 if TF_SEC[tf] < 86400 else 300
    def one(key):
        sym, tf = key.split("|"); C = cache.get(key)
        if C and now - C["at"] < per(tf): return key, None
        if lane == 10 and TF_SEC[tf] < 60: return key, {"rows": [], "src": "unsupported", "sample": offline, "at": now, "unsupported": True}  # seconds bars for equities come from the launcher's tick feed
        if offline: return key, {"rows": sample_bars(sym, tf, 300, wants.get(key, 0.0)), "src": "sample", "sample": True, "at": now}
        try: rows, src = (candles9 if lane == 9 else candles10)(sym, tf); return key, {"rows": rows[-1500:], "src": src, "sample": False, "at": now}
        except Exception as e: return key, ({"rows": C["rows"], "src": C["src"], "sample": C["sample"], "at": now, "stale": True} if C else {"rows": [], "src": "unavailable", "err": str(e)[:100], "sample": False, "at": now, "unsupported": "seconds" in str(e)})
    for key, v in pool.map(one, list(wants)):
        if v is not None: cache[key] = v
    for key in list(cache):
        if key not in wants: cache.pop(key)
    for key, C in cache.items():
        sym, tf = key.split("|"); snap["c:" + key] = dict({k: C[k] for k in C if k != "at"}, sym=sym, tf=tf, n=len(C["rows"]), ts=C["at"])
    # MTF trend table for the universe (forwarded to Lane 16)
    if now - st.get("mtfAt", 0) >= (60 if not offline else 30):
        st["mtfAt"] = now; uni = [c + "-USD" for c in CR_UNI if c != "HYPE"] if lane == 9 else list(EQ_UNI)
        def mt(sym):
            row = {}
            for tf in MTF:
                try: rows = sample_bars(sym, tf, 60) if offline else (candles9 if lane == 9 else candles10)(sym, tf)[0]
                except Exception: rows = []
                row[tf] = trend_sign(rows)
            return sym, row
        st["mtf"] = dict(pool.map(mt, uni))
    snap["mtf"] = {"rows": st.get("mtf", {}), "sample": offline, "ts": now}; snap["fwd"] = {"mtf": st.get("mtf", {})}
    return snap

# ---- Lane 11: equities & 0DTE gamma scanner ----
def bs_gamma(S, K, T, iv):
    if not (S > 0 and K > 0 and T > 0 and iv > 0): return 0.0
    d1 = (math.log(S / K) + 0.5 * iv * iv * T) / (iv * math.sqrt(T)); return math.exp(-0.5 * d1 * d1) / math.sqrt(2 * math.pi) / (S * iv * math.sqrt(T))

def gex_levels(S, calls, puts, T):
    """net dealer GEX by strike (calls +, puts −) → zero-gamma flip, call wall, put wall, and max pain"""
    g = {}
    for c in calls: g[c["strike"]] = g.get(c["strike"], 0) + bs_gamma(S, c["strike"], T, c["iv"]) * c["oi"] * 100 * S * S * 0.01
    for p in puts: g[p["strike"]] = g.get(p["strike"], 0) - bs_gamma(S, p["strike"], T, p["iv"]) * p["oi"] * 100 * S * S * 0.01
    ks = sorted(g); cum = 0.0; flip = None; prev = None
    for k in ks:
        cum += g[k]
        if prev is not None and (prev < 0) != (cum < 0) and flip is None: flip = k
        prev = cum
    cw = max((c for c in calls), key=lambda c: bs_gamma(S, c["strike"], T, c["iv"]) * c["oi"], default=None); pw = max((p for p in puts), key=lambda p: bs_gamma(S, p["strike"], T, p["iv"]) * p["oi"], default=None)
    strikes = sorted(set([c["strike"] for c in calls] + [p["strike"] for p in puts]))
    pain = min(strikes, key=lambda X: sum(max(0, X - c["strike"]) * c["oi"] for c in calls) + sum(max(0, p["strike"] - X) * p["oi"] for p in puts)) if strikes else None
    return {"flip": flip, "callWall": cw and cw["strike"], "putWall": pw and pw["strike"], "maxPain": pain, "net": sum(g.values())}

def orb_avwap(bars, orb_min=30):
    """opening-range breakout + session-anchored VWAP reclaim on 1m bars of the current session"""
    if len(bars) < orb_min + 5: return None
    day = time.gmtime(bars[-1][0])[:3]; ses = [b for b in bars if time.gmtime(b[0])[:3] == day]
    if len(ses) < orb_min + 5: return None
    hi = max(b[2] for b in ses[:orb_min]); lo = min(b[3] for b in ses[:orb_min]); pv = vv = 0.0; aw = []
    for b in ses: tp = (b[2] + b[3] + b[4]) / 3; pv += tp * b[5]; vv += b[5]; aw.append(pv / vv if vv else tp)
    c, c1, a, a1 = ses[-1][4], ses[-2][4], aw[-1], aw[-2]
    if c > hi and c > a and c1 <= a1 * 1.0005: return {"side": "buy", "setup": "ORB + AVWAP reclaim", "lvl": hi, "avwap": a}
    if c < lo and c < a and c1 >= a1 * 0.9995: return {"side": "sell", "setup": "ORB + AVWAP loss", "lvl": lo, "avwap": a}
    if c > hi and c > a: return {"side": "buy", "setup": "ORB breakout above AVWAP", "lvl": hi, "avwap": a}
    if c < lo and c < a: return {"side": "sell", "setup": "ORB breakdown below AVWAP", "lvl": lo, "avwap": a}
    return None

def pin_est(bars):
    """Easley–O'Hara PIN, tick-rule estimate on 1m bars: |buy − sell| volume share (est.)"""
    b = s = 0.0
    for a, x in zip(bars[:-1], bars[1:]):
        if x[4] > a[4]: b += x[5]
        elif x[4] < a[4]: s += x[5]
    return abs(b - s) / (b + s) if b + s > 0 else 0.0

def rmt_residuals(rets):
    """random-matrix-theory alpha residuals: remove the market eigen-mode (power iteration) from standardized returns;
    rets: {sym: [daily returns]} → ({sym: residual z of the latest day}, eigenvalues above the Marchenko–Pastur edge)"""
    syms = [k for k, v in rets.items() if len(v) >= 20]; T = min((len(rets[k]) for k in syms), default=0)
    if len(syms) < 4 or T < 20: return {}, 0
    Z = []
    for k in syms:
        x = rets[k][-T:]; m = sum(x) / T; sd = math.sqrt(sum((y - m) ** 2 for y in x) / T) or 1; Z.append([(y - m) / sd for y in x])
    N = len(syms); C = [[sum(Z[i][t] * Z[j][t] for t in range(T)) / T for j in range(N)] for i in range(N)]
    v = [1.0 / math.sqrt(N)] * N
    for _ in range(60):
        w = [sum(C[i][j] * v[j] for j in range(N)) for i in range(N)]; nw = math.sqrt(sum(x * x for x in w)) or 1; v = [x / nw for x in w]
    lam = sum(v[i] * sum(C[i][j] * v[j] for j in range(N)) for i in range(N)); edge = (1 + math.sqrt(N / T)) ** 2
    f = sum(v[i] * Z[i][-1] for i in range(N)); res = {syms[i]: round(Z[i][-1] - v[i] * f, 3) for i in range(N)}
    return res, int(lam > edge)

def _sample_cands(lane, n, now):
    R = _fr.Random(lane * 7919 + int(now // 300)); out = []
    pools = {11: [(s, "stocks") for s in EQ_UNI], 12: [(c + "-USD", "crypto") for c in CR_UNI], 13: [("oc:solana:Sample%sPool%032d" % (c, i), "onchain") for i, c in enumerate("ABCDEFGHJK")]}[lane]
    setups = {11: ["ORB + AVWAP reclaim", "Zero-Gamma flip breach", "Call Wall break", "0DTE Max-Pain snap", "RMT alpha residual"], 12: ["Funding extreme squeeze", "Spot-Perp basis dislocation", "Liquidation cluster sweep (est.)", "P_micro skew", "Cross-exchange impulse"], 13: ["Rug Shield v2 pass · net buy pressure", "Retention half-life rising", "Fresh pool momentum"]}[lane]
    for sym, mkt in R.sample(pools, min(n, len(pools))):
        px = round(10 ** R.uniform(-3 if mkt == "onchain" else 0.5, 3.5), 6); side = "buy" if R.random() < 0.62 else "sell"
        out.append({"sym": sym, "mkt": mkt, "side": side, "setup": R.choice(setups), "score": round(R.uniform(0.2, 0.95), 3), "px": px, "atr": round(px * R.uniform(0.004, 0.03), 8), "liq": round(10 ** R.uniform(4.5, 8), 0), "feat": {"funding8h": round(R.gauss(0, 4), 2), "basis": round(R.gauss(0, 8), 2), "skew": round(R.gauss(0, 2), 2), "impact": round(R.uniform(0.05, 3.5), 2), "top3": round(R.uniform(0.04, 0.3), 3), "entropy": round(R.uniform(0.4, 0.98), 3)}, "sample": True})
    return out

def _warm11(st, pool, offline, wants):
    now = time.time()
    if offline:
        c = _sample_cands(11, 12, now); return {"scan": {"rows": c, "gex": {"SPY": {"flip": None, "note": "sample"}}, "sample": True, "ts": now}, "fwd": {"cands": c, "series": [math.sin(now / 60 + i) * 0.001 for i in range(64)]}}
    yhdr = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
    def bars(sym):
        try: return sym, candles10(sym, "1m")[0]
        except Exception: return sym, []
    B = dict(pool.map(bars, EQ_UNI))
    if now - st.get("dAt", 0) > 600 or "daily" not in st:
        def daily(sym):
            try: rows = candles10(sym, "1d")[0][-90:]; return sym, [b[4] / a[4] - 1 for a, b in zip(rows[:-1], rows[1:])]
            except Exception: return sym, []
        st["daily"] = dict(pool.map(daily, EQ_UNI)); st["dAt"] = now
    res, nmode = rmt_residuals(st["daily"]); gex = {}
    for u in ("SPY", "QQQ"):
        try:
            oj = _jget("https://query2.finance.yahoo.com/v7/finance/options/%s" % u, yhdr, timeout=6); r = ((oj.get("optionChain") or {}).get("result") or [{}])[0]; S = _hnum((r.get("quote") or {}).get("regularMarketPrice")); o = (r.get("options") or [{}])[0]
            T = max(1 / 365 / 24, (_hnum(o.get("expirationDate")) - now) / 31557600) if o.get("expirationDate") else 1 / 365
            mk = lambda arr: [{"strike": _hnum(x.get("strike")), "oi": _hnum(x.get("openInterest")), "iv": _hnum(x.get("impliedVolatility"))} for x in arr or [] if _hnum(x.get("openInterest")) > 0]
            lv = gex_levels(S, mk(o.get("calls")), mk(o.get("puts")), T); lv["S"] = S; lv["zeroDte"] = T * 365 < 1; gex[u] = lv
        except Exception as e: gex[u] = {"err": "options chain unavailable (" + str(e)[:60] + ")"}
    cands = []
    for sym, b in B.items():
        if len(b) < 40: continue
        px = b[-1][4]; at = atr_of(b); liq = sum(x[4] * x[5] for x in b[-30:]) / 30; o = orb_avwap(b); pin = pin_est(b[-120:])
        g = gex.get(sym) or {}
        if g.get("flip") and len(b) > 2 and (b[-2][4] - g["flip"]) * (px - g["flip"]) < 0: cands.append({"sym": sym, "mkt": "stocks", "side": "buy" if px > g["flip"] else "sell", "setup": "Zero-Gamma flip breach", "score": 0.8, "px": px, "atr": at, "liq": liq, "feat": {"pin": round(pin, 3), "flip": g["flip"]}})
        if g.get("callWall") and px > g["callWall"]: cands.append({"sym": sym, "mkt": "stocks", "side": "buy", "setup": "Call Wall break", "score": 0.7, "px": px, "atr": at, "liq": liq, "feat": {"wall": g["callWall"]}})
        if g.get("putWall") and px < g["putWall"]: cands.append({"sym": sym, "mkt": "stocks", "side": "sell", "setup": "Put Wall break", "score": 0.7, "px": px, "atr": at, "liq": liq, "feat": {"wall": g["putWall"]}})
        if g.get("maxPain") and g.get("zeroDte") and abs(px / g["maxPain"] - 1) < 0.003: cands.append({"sym": sym, "mkt": "stocks", "side": "buy" if px < g["maxPain"] else "sell", "setup": "0DTE Max-Pain snap", "score": 0.6, "px": px, "atr": at, "liq": liq, "feat": {"maxPain": g["maxPain"]}})
        if o: cands.append({"sym": sym, "mkt": "stocks", "side": o["side"], "setup": o["setup"], "score": round(0.55 + min(0.35, pin), 3), "px": px, "atr": at, "liq": liq, "feat": {"pin": round(pin, 3), "avwap": round(o["avwap"], 4)}})
        r = res.get(sym)
        if r is not None and abs(r) >= 1.5: cands.append({"sym": sym, "mkt": "stocks", "side": "buy" if r < 0 else "sell", "setup": "RMT alpha residual (mean reversion)", "score": round(min(0.9, abs(r) / 4), 3), "px": px, "atr": at, "liq": liq, "feat": {"resid": r}})
    spy = B.get("SPY") or []; ser = [b[4] / a[4] - 1 for a, b in zip(spy[-65:-1], spy[-64:])]
    return {"scan": {"rows": cands, "gex": gex, "rmtModes": nmode, "universe": len(EQ_UNI), "sample": False, "ts": now}, "fwd": {"cands": cands, "series": ser}}

# ---- Lane 12: crypto majors & perps squeeze scanner ----
def micro_price(bid, bsz, ask, asz):
    """Stoikov micro-price: size-weighted toward the thinner side's opposite quote"""
    return (bid * asz + ask * bsz) / (bsz + asz) if bsz + asz > 0 else (bid + ask) / 2

def _warm12(st, pool, offline, wants):
    now = time.time(); ser = st.setdefault("btc", [])
    if offline:
        c = _sample_cands(12, 9, now); ser.append(math.sin(now / 37) * 0.0012); del ser[:-64]
        return {"scan": {"rows": c, "sample": True, "ts": now}, "fwd": {"cands": c, "series": list(ser)}}
    hp = lambda body: json.loads(shield_fetch(HL_INFO_URL, "POST", json.dumps(body).encode(), {"Content-Type": "application/json", "User-Agent": "ExTerm/1.0"}, timeout=8)[1])
    meta, ctxs = hp({"type": "metaAndAssetCtxs"}); names = [u.get("name") for u in meta.get("universe", [])]; cands = []; info = {}
    for nm, cx in zip(names, ctxs):
        if nm not in CR_UNI: continue
        mark, orc = _hnum(cx.get("markPx")), _hnum(cx.get("oraclePx")); f8 = _hnum(cx.get("funding")) * 8 * 1e4; basis = (mark / orc - 1) * 1e4 if orc else 0.0; prev = _hnum(cx.get("prevDayPx")); ch = (mark / prev - 1) * 100 if prev else 0.0
        info[nm] = {"mark": mark, "funding8hBps": round(f8, 2), "basisBps": round(basis, 2), "oi": _hnum(cx.get("openInterest")) * mark, "chg24": round(ch, 2), "vlm": _hnum(cx.get("dayNtlVlm"))}
    def book(nm):
        try: b = hp({"type": "l2Book", "coin": nm}); lv = b.get("levels") or [[], []]; bid, ask = lv[0][0], lv[1][0]; return nm, (_hnum(bid["px"]), _hnum(bid["sz"]), _hnum(ask["px"]), _hnum(ask["sz"]))
        except Exception: return nm, None
    for nm, q in pool.map(book, [n for n in CR_UNI if n in info][:6]):
        if q: mid = (q[0] + q[2]) / 2; info[nm]["microSkewBps"] = round((micro_price(*q) / mid - 1) * 1e4, 3) if mid else 0
    def cb(nm):
        try: return nm, _hnum(_jget("https://api.exchange.coinbase.com/products/%s-USD/ticker" % nm, timeout=4).get("price"))
        except Exception: return nm, 0.0
    for nm, p in pool.map(cb, ["BTC", "ETH", "SOL"]):
        if p and nm in info: d = (p / info[nm]["mark"] - 1) * 1e4; pr = st.setdefault("cbd", {}).get(nm, d); info[nm]["xexBps"] = round(d, 2); info[nm]["xexImpulseBps"] = round(d - pr, 2); st["cbd"][nm] = d
    for nm, x in info.items():
        sym = nm + "-USD"; base = {"sym": sym, "mkt": "crypto", "px": x["mark"], "atr": x["mark"] * max(0.004, abs(x["chg24"]) / 100 / 4), "liq": x["vlm"] / 1440, "feat": dict(x)}
        if abs(x["funding8hBps"]) >= 3: cands.append(dict(base, side="sell" if x["funding8hBps"] > 0 else "buy", setup="Funding extreme squeeze", score=round(min(0.95, abs(x["funding8hBps"]) / 10), 3)))
        if abs(x["basisBps"]) >= 8: cands.append(dict(base, side="sell" if x["basisBps"] > 0 else "buy", setup="Spot-Perp basis dislocation", score=round(min(0.9, abs(x["basisBps"]) / 30), 3)))
        if abs(x["chg24"]) > 3 and x["funding8hBps"] * x["chg24"] < 0: cands.append(dict(base, side="buy" if x["chg24"] > 0 else "sell", setup="Liquidation cluster sweep (est.)", score=0.6))
        if abs(x.get("microSkewBps", 0)) >= 0.5: cands.append(dict(base, side="buy" if x["microSkewBps"] > 0 else "sell", setup="P_micro skew", score=round(min(0.8, abs(x["microSkewBps"]) / 3), 3)))
        if abs(x.get("xexImpulseBps", 0)) >= 3: cands.append(dict(base, side="buy" if x["xexImpulseBps"] > 0 else "sell", setup="Cross-exchange impulse", score=0.55))
    b = info.get("BTC")
    if b: lp = st.get("lastBtc"); st["lastBtc"] = b["mark"]; ser.append((b["mark"] / lp - 1) if lp else 0.0); del ser[:-64]
    return {"scan": {"rows": cands, "perps": info, "sample": False, "ts": now}, "fwd": {"cands": cands, "series": list(ser)}}

# ---- Lane 13: on-chain DEX & Rug Shield v2 ----
def entropy_norm(xs):
    """normalised Shannon entropy of a list of labels (1 = perfectly spread, 0 = one actor)"""
    if not xs: return 0.0
    c = {}
    for x in xs: c[x] = c.get(x, 0) + 1
    n = len(xs); h = -sum((v / n) * math.log(v / n) for v in c.values()); return h / math.log(n) if n > 1 else 0.0

def top_share(xs, w, k=3):
    tot = sum(w) or 1; c = {}
    for x, y in zip(xs, w): c[x] = c.get(x, 0) + y
    return sum(sorted(c.values(), reverse=True)[:k]) / tot

def amm_impact_pct(order_usd, reserve_usd):
    """constant-product price impact of a market order (half the reserve is the quote side)"""
    q = reserve_usd / 2; return order_usd / (q + order_usd) * 100 if q > 0 else 100.0

def retention_half_life(b1, b6, b24):
    """buyer-rate half-life in hours from unique buyers over 1h / 6h / 24h (∞ when the rate is rising)"""
    r1, r24 = b1, b24 / 24.0
    if r1 <= 0 or r24 <= 0: return 0.0
    if r1 >= r24: return float("inf")
    k = math.log(r24 / r1) / 23.0; return math.log(2) / k if k > 0 else float("inf")

def rug_shield_v2(m):
    """Rug Shield v2 gate → (pass, list of [criterion, state]); state passed / failed / pending (unknown)"""
    cr = [["AMM impact ≤ 2% ($1K)", "passed" if m.get("impact") is not None and m["impact"] <= 2 else "failed" if m.get("impact") is not None else "pending"],
          ["Top-3 buyers / Slot 0–2 bundle ≤ 15%", "passed" if m.get("top3") is not None and m["top3"] <= 0.15 else "failed" if m.get("top3") is not None else "pending"],
          ["Sybil entropy ≥ 0.6", "passed" if m.get("entropy") is not None and m["entropy"] >= 0.6 else "failed" if m.get("entropy") is not None else "pending"],
          ["No freeze / mint authority", "failed" if m.get("freeze") else "passed" if m.get("freeze") is False else "pending"],
          ["LP locked / burned", "passed" if m.get("lpLocked") else "failed" if m.get("lpLocked") is False else "pending"],
          ["Net buy pressure 24h > 0 (smart-money proxy)", "passed" if (m.get("netBuy") or 0) > 0 else "failed"]]
    return all(s != "failed" for _, s in cr) and sum(1 for _, s in cr if s == "passed") >= 4, cr

def _warm13(st, pool, offline, wants):
    now = time.time()
    if offline:
        c = _sample_cands(13, 10, now)
        for x in c: ok, cr = rug_shield_v2({"impact": x["feat"]["impact"], "top3": x["feat"]["top3"], "entropy": x["feat"]["entropy"], "freeze": False, "lpLocked": True, "netBuy": 1}); x["feat"]["shield"] = cr; x["feat"]["shieldPass"] = ok
        c = [x for x in c if x["feat"]["shieldPass"]] or c[:3]
        return {"scan": {"rows": c, "sample": True, "ts": now, "clmm": "CLMM tick-cliff data is not in the free APIs: shown as pending"}, "fwd": {"cands": c, "series": [math.cos(now / 90 + i) * 0.003 for i in range(64)], "forensics": {x["sym"]: {"freeze": False, "honeypot": False} for x in c}}}
    if now - st.get("tAt", 0) < 120 and st.get("last"): return st["last"]
    st["tAt"] = now; pools = []
    def trending(ch):
        try: return ch, (_jget("https://api.geckoterminal.com/api/v2/networks/%s/trending_pools?include=base_token" % ch, timeout=8).get("data") or [])[:8]
        except Exception: return ch, []
    for ch, rows in pool.map(trending, DEX_CHAINS):
        for d in rows:
            a = d.get("attributes") or {}; tx = a.get("transactions") or {}; vol = a.get("volume_usd") or {}; pc = a.get("price_change_percentage") or {}
            base = (((d.get("relationships") or {}).get("base_token") or {}).get("data") or {}).get("id", ""); mint = base.split("_", 1)[1] if "_" in base else ""
            pools.append({"chain": ch, "pool": str(a.get("address") or ""), "name": _CTRL_RX.sub("", str(a.get("name") or ""))[:40], "mint": mint, "px": _hnum(a.get("base_token_price_usd")), "reserve": _hnum(a.get("reserve_in_usd")), "vol24": _hnum(vol.get("h24")),
                          "b1": _hnum((tx.get("h1") or {}).get("buyers")), "b6": _hnum((tx.get("h6") or {}).get("buyers")), "b24": _hnum((tx.get("h24") or {}).get("buyers")), "buys24": _hnum((tx.get("h24") or {}).get("buys")), "sells24": _hnum((tx.get("h24") or {}).get("sells")),
                          "ch1": _hnum(pc.get("h1")), "ch6": _hnum(pc.get("h6")), "ch24": _hnum(pc.get("h24"))})
    def forensics(p):
        m = {"impact": round(amm_impact_pct(1000, p["reserve"]), 3), "netBuy": (p["buys24"] - p["sells24"]) / max(1, p["buys24"] + p["sells24"]), "halfLife": retention_half_life(p["b1"], p["b6"], p["b24"])}
        try:
            tr = _gt_trades(p["chain"], p["pool"]); buys = [(w, q * px) for t, px, q, w, k in tr if k == "buy" and w]
            if buys: m["top3"] = round(top_share([w for w, _ in buys], [u for _, u in buys]), 4); m["entropy"] = round(entropy_norm([w for w, _ in buys]), 4)
        except Exception: pass
        if p["chain"] == "solana" and p["mint"]:
            try:
                rc = _jget("https://api.rugcheck.xyz/v1/tokens/%s/report/summary" % urllib.parse.quote(p["mint"]), timeout=6); names = " ".join(str(r.get("name", "")) for r in rc.get("risks") or []).lower()
                m["freeze"] = "freeze" in names or "mint authority" in names; m["lpLocked"] = not ("lp unlocked" in names or "liquidity unlocked" in names); m["rugScore"] = _hnum(rc.get("score"))
            except Exception: pass
        ok, cr = rug_shield_v2(m); m["shield"] = cr; m["shieldPass"] = ok; return p, m
    top = sorted(pools, key=lambda p: -p["vol24"])[:12]; cands = []; fx = {}
    for p, m in pool.map(forensics, top):
        sym = "oc:%s:%s" % (p["chain"], p["pool"]); fx[sym] = {"freeze": bool(m.get("freeze")), "honeypot": m.get("netBuy", 0) > 0.95 and p["sells24"] < 3, "impact": m["impact"]}
        if not p["px"] > 0: continue
        side = "buy" if p["ch1"] > 0 and m["netBuy"] > 0 else "sell"
        cands.append({"sym": sym, "mkt": "onchain", "name": p["name"], "side": side, "setup": "Rug Shield v2 pass · net buy pressure" if m["shieldPass"] else "Rug Shield v2 incomplete", "score": round(min(0.95, 0.4 + abs(p["ch1"]) / 20 + max(0, m["netBuy"]) * 0.3), 3) * (1 if m["shieldPass"] else 0.6), "px": p["px"], "atr": p["px"] * max(0.01, abs(p["ch1"]) / 100), "liq": p["reserve"],
                      "feat": {"impact": m["impact"], "top3": m.get("top3"), "entropy": m.get("entropy"), "halfLifeH": None if m["halfLife"] == float("inf") else round(m["halfLife"], 1), "rising": m["halfLife"] == float("inf"), "freeze": m.get("freeze"), "lpLocked": m.get("lpLocked"), "shield": m["shield"], "shieldPass": m["shieldPass"], "ch1": p["ch1"], "ch24": p["ch24"]}})
    ser = st.setdefault("ser", []); ser.append(sum(p["ch1"] for p in pools) / max(1, len(pools)) / 100); del ser[:-64]
    st["last"] = {"scan": {"rows": cands, "chains": list(DEX_CHAINS), "sample": False, "ts": now, "clmm": "CLMM tick-cliff data is not in the free APIs: shown as pending"}, "fwd": {"cands": cands, "series": list(ser), "forensics": fx}}
    return st["last"]

# ---- Lane 14: transfer entropy + BOCPD + 6-bot consensus ----
def _disc(a, bins=3):
    s = sorted(a); q = [s[(i * len(s)) // bins] for i in range(1, bins)]
    return [sum(1 for t in q if v > t) for v in a]

def transfer_entropy(x, y, bins=3):
    """TE X → Y in bits (k = 1), same estimator as V178.transferEntropy in the page"""
    n = min(len(x), len(y))
    if n < 8: return 0.0
    X, Y = _disc(x[:n], bins), _disc(y[:n], bins); c3, c2a, c2b, c1 = {}, {}, {}, {}
    for t in range(n - 1):
        for d, k in ((c3, (Y[t + 1], Y[t], X[t])), (c2a, (Y[t], X[t])), (c2b, (Y[t + 1], Y[t])), (c1, Y[t])): d[k] = d.get(k, 0) + 1
    N = n - 1; te = 0.0
    for (y1, y0, x0), v in c3.items(): te += (v / N) * math.log2((v / c2a[(y0, x0)]) / (c2b[(y1, y0)] / c1[y0]))
    return max(0.0, te)

class BOCPDpy:
    """Adams–MacKay BOCPD, Normal-Gamma prior, truncated run length (same model as V178.BOCPD)"""
    def __init__(self, h=1 / 60, mx=120): self.h, self.mx, self.R, self.mu, self.k, self.a, self.b, self.cp, self.map = h, mx, [1.0], [0.0], [1.0], [1.0], [1.0], 0.0, 0
    def push(self, x):
        n = len(self.R); pred = []
        for r in range(n):
            nu = 2 * self.a[r]; sc = math.sqrt(self.b[r] * (self.k[r] + 1) / (self.a[r] * self.k[r])); z = (x - self.mu[r]) / sc
            pred.append(math.exp(math.lgamma((nu + 1) / 2) - math.lgamma(nu / 2) - 0.5 * math.log(nu * math.pi) - math.log(sc) - (nu + 1) / 2 * math.log1p(z * z / nu)))
        m = min(n + 1, self.mx); R2 = [0.0] * m; cp = 0.0
        for r in range(n):
            g = self.R[r] * pred[r]; cp += g * self.h
            if r + 1 < m: R2[r + 1] += g * (1 - self.h)
        R2[0] = cp; s = sum(R2) or 1.0; R2 = [v / s for v in R2]
        mu, k, a, b = [0.0], [1.0], [1.0], [1.0]
        for r in range(min(m - 1, n)): mu.append((self.k[r] * self.mu[r] + x) / (self.k[r] + 1)); k.append(self.k[r] + 1); a.append(self.a[r] + 0.5); b.append(self.b[r] + self.k[r] * (x - self.mu[r]) ** 2 / (2 * (self.k[r] + 1)))
        self.R, self.mu, self.k, self.a, self.b = R2, mu, k, a, b; self.cp = sum(R2[:6]); self.map = max(range(m), key=lambda i: R2[i]); return self

def bot_votes(c, regime_cp):
    """the 6-bot peer review: each bot scores the candidate in [−1, 1] from its own discipline"""
    f = c.get("feat") or {}; sgn = 1 if c["side"] == "buy" else -1; liq = c.get("liq") or 0; imp = f.get("impact") if f.get("impact") is not None else amm_impact_pct(1000, liq * 2) if liq else 5
    v = {"HUNTER-α": max(-1, min(1, c.get("score", 0) * 1.4 - 0.3)),
         "MUTATOR-EVO": max(-1, min(1, 0.6 - regime_cp * 1.2)),
         "HEDGER-ARB": max(-1, min(1, -sgn * (f.get("funding8hBps", 0) or 0) / 8 - sgn * (f.get("basisBps", 0) or 0) / 30 + 0.2)),
         "RISK-GUARD": 1.0 if imp <= 0.5 else 0.4 if imp <= 2 else -1.0,
         "SNIPER-EXEC": max(-1, min(1, 0.3 + sgn * (f.get("microSkewBps", 0) or 0) / 2 + (0.3 if f.get("avwap") or f.get("flip") or f.get("wall") else 0))),
         "SCALPER-EXIT": max(-1, min(1, 0.5 if (c.get("atr") or 0) > 0 and c["atr"] / (c["px"] or 1) < 0.05 else -0.3))}
    return {k: round(x, 3) for k, x in v.items()}

def consensus(cands, series, regime_cp):
    w = {"HUNTER-α": 1.2, "MUTATOR-EVO": 0.8, "HEDGER-ARB": 1.0, "RISK-GUARD": 1.4, "SNIPER-EXEC": 1.0, "SCALPER-EXIT": 0.8}; out = []
    for c in cands:
        v = bot_votes(c, regime_cp); sc = sum(v[k] * w[k] for k in v) / sum(w.values()); yes = sum(1 for x in v.values() if x > 0)
        out.append(dict(c, votes=v, consensus=round(sc, 3), agree=yes, peer=yes >= 4 and v["RISK-GUARD"] > 0))
    return sorted(out, key=lambda x: -x["consensus"])

def _warm14(st, pool, offline, wants):
    now = time.time(); F = st.get("feed", {}); cands = []; series = {}
    for ln in (11, 12, 13):
        d = F.get("lane%d" % ln) or {}; cands += d.get("cands") or []; series[ln] = d.get("series") or []
    bo = st.setdefault("bo", BOCPDpy(1 / 40)); s12 = series.get(12) or []
    for x in s12[st.get("seen12", 0) if st.get("seen12", 0) <= len(s12) else 0:]: bo.push(x * 100)
    st["seen12"] = len(s12)
    links = []
    names = {11: "US equities (SPY)", 12: "Crypto majors (BTC)", 13: "On-chain DEX"}
    for a in (11, 12, 13):
        for b in (11, 12, 13):
            if a != b and len(series[a]) >= 16 and len(series[b]) >= 16: links.append({"from": names[a], "to": names[b], "te": round(transfer_entropy(series[a], series[b]), 4)})
    links.sort(key=lambda x: -x["te"]); ranked = consensus(cands, series, bo.cp)
    out = {"rows": ranked[:40], "te": links, "regime": {"cp": round(bo.cp, 3), "runLength": bo.map, "state": "CHANGE-POINT" if bo.cp > 0.5 else "STABLE"}, "bots": list(BOTS6), "sample": offline or any(c.get("sample") for c in cands), "ts": now}
    return {"consensus": out, "fwd": {"cands": ranked[:30], "regime": out["regime"]}}

# ---- Lane 15: adversarial 1,000-path Monte Carlo + liquidity stress ----
_TT = None
def _t_table(n=20000, nu=3, seed=1789):
    global _TT
    if _TT is None:
        R = _fr.Random(seed); out = []
        for _ in range(n):
            z = R.gauss(0, 1); ch = sum(R.gauss(0, 1) ** 2 for _ in range(nu)); out.append(z / math.sqrt(ch / nu) / math.sqrt(nu / (nu - 2)))  # unit-variance Student-t(3)
        _TT = out
    return _TT

def mc_stress(c, paths=1000, steps=40, size_usd=1000.0, seed=0):
    """1,000 fat-tailed paths (unit-variance Student-t ν = 3 + Hawkes-clustered jumps); SL 1 ATR, TP 2 ATR →
    P(TP first), expectancy (R), 5 % CVaR (R), slippage %; veto on > 2 % slippage, negative expectancy or a fat left tail"""
    T = _t_table(); R = _fr.Random(seed or hash((c["sym"], c["side"], round(c["px"], 6))) & 0xFFFFFFFF); px = c["px"]; atr = c.get("atr") or px * 0.01
    sgn = 1 if c["side"] == "buy" else -1; sig = atr / 3.0; tp, sl = 2.0, 1.0; outs = []; wins = 0; nT = len(T)
    # signal-edge prior: the scanner score sets a small drift in the signal's direction (score 0.5 = no edge, 1.0 = 0.15 σ / step);
    # without it every path is pure noise and no setup could ever pass. The adversarial part stays: fat tails, jump clusters, gaps
    mu = sgn * max(0.0, min(1.0, c.get("score", 0.5)) - 0.5) * 0.3 * sig
    for _ in range(paths):
        x = 0.0; lam = 0.02; res = None
        for k in range(steps):
            x += mu + sig * T[R.randrange(nT)]
            if R.random() < lam: j = 2.5 * sig * T[R.randrange(nT)]; x += j; lam = min(0.5, lam + 0.15)  # self-exciting jump cluster
            lam = 0.02 + (lam - 0.02) * 0.8
            r = sgn * x / atr
            if r >= tp: res = tp; wins += 1; break
            if r <= -sl: res = -sl * (1 + max(0, -r - sl)); break  # gap through the stop costs extra
        outs.append(res if res is not None else sgn * x / atr)
    outs.sort(); cv = outs[:max(1, paths // 20)]; cvar = sum(cv) / len(cv); ev = sum(outs) / paths; liq = c.get("liq") or 0
    imp = (c.get("feat") or {}).get("impact")
    slip = imp if imp is not None and c.get("mkt") == "onchain" else (amm_impact_pct(size_usd, liq * 2) if c.get("mkt") == "onchain" else min(5.0, 0.02 + size_usd / max(1.0, liq) * 10))
    veto = []
    if slip > 2: veto.append("slippage %.2f%% > 2%%" % slip)
    if ev <= 0: veto.append("negative expectancy %.2fR" % ev)
    if cvar < -2.5: veto.append("tail 5%% CVaR %.2fR" % cvar)  # gap-through-stop losses on fat tails routinely reach ≈ −2R
    return {"pTP": round(wins / paths, 3), "evR": round(ev, 3), "cvar5R": round(cvar, 3), "slipPct": round(slip, 3), "paths": paths, "veto": veto, "verdict": "VETO" if len(veto) >= 2 or (veto and veto[0].startswith("slippage")) else "DOWNGRADE" if veto else "PASS"}

def _warm15(st, pool, offline, wants):
    now = time.time(); F = (st.get("feed") or {}).get("lane14") or {}; cands = F.get("cands") or []
    key = json.dumps([(c["sym"], c["side"], c["setup"]) for c in cands]);
    if key == st.get("key") and now - st.get("at", 0) < 30 and st.get("last"): return st["last"]
    _t_table(); rows = [dict(c, mc=m) for c, m in zip(cands, pool.map(mc_stress, cands))]
    st["key"], st["at"] = key, now
    st["last"] = {"stress": {"rows": rows, "paths": 1000, "model": "Student-t(3) + Hawkes jumps", "sample": offline or any(c.get("sample") for c in cands), "ts": now}, "fwd": {"cands": rows, "regime": F.get("regime") or {}}}
    return st["last"]

# ---- Lane 16: multi-timeframe confluence + journal correlator ----
_WORD = re.compile(r"[a-z0-9]+")
def journal_match(c, journal, k=8):
    """lexical retrieval over the personal journal (setup + symbol + market words, Jaccard) → similarity-weighted win rate"""
    q = set(_WORD.findall((c.get("setup", "") + " " + c["sym"].split(":")[-1] + " " + c.get("mkt", "")).lower())); sc = []
    for e in journal or []:
        txt = " ".join(str(e.get(f, "")) for f in ("sym", "setup", "strategy", "tags", "note", "notes", "side")).lower(); w = set(_WORD.findall(txt))
        if not w: continue
        j = len(q & w) / len(q | w)
        if j > 0: sc.append((j, 1 if _hnum(e.get("pnl")) > 0 else 0))
    sc.sort(reverse=True); sc = sc[:k]
    if not sc: return None, 0
    return round(sum(j * x for j, x in sc) / sum(j for j, _ in sc) * 100, 1), len(sc)

def mtf_align(c, mtf):
    key = c["sym"] if c["sym"] in mtf else c["sym"].replace("-USD", "") if c["sym"].replace("-USD", "") in mtf else None
    row = mtf.get(key) if key else None
    if not row:
        f = c.get("feat") or {}
        if c.get("mkt") == "onchain" and ("ch1" in f): s = [1 if f.get("ch1", 0) > 0 else -1, 1 if f.get("ch24", 0) > 0 else -1]; sgn = 1 if c["side"] == "buy" else -1; return sum(1 for x in s if x == sgn), len(s)
        return None, 0
    sgn = 1 if c["side"] == "buy" else -1; return sum(1 for tf in MTF if row.get(tf) == sgn), len(MTF)

def tier_of(c, mtf, journal, regime):
    """criteria → 0–100 score, tier, and Passed / Pending / Failed badges (never empty: partial matches rank as B+ / Watchlist)"""
    mc = c.get("mc") or {}; al, n = mtf_align(c, mtf); wr, jn = journal_match(c, journal); cr = []
    cr.append(["6-bot consensus ≥ 4/6 (peer-reviewed)", "passed" if c.get("peer") else "failed"])
    cr.append(["Monte Carlo 1,000 paths: expectancy > 0, tail ok", "passed" if mc.get("verdict") == "PASS" else "failed" if mc.get("verdict") == "VETO" else "pending" if not mc else "failed"])
    cr.append(["Multi-timeframe alignment ≥ 4/5 (1m · 5m · 15m · 1h · 1d)" if n == 5 else "Timeframe alignment (%d frames)" % n if n else "Multi-timeframe alignment", "pending" if not n else "passed" if al >= max(2, round(n * 0.8)) else "failed"])
    cr.append(["Slippage ≤ 2%", "passed" if mc and mc.get("slipPct", 9) <= 2 else "pending" if not mc else "failed"])
    cr.append(["Journal: similar setups win ≥ 55%", "pending" if wr is None or jn < 3 else "passed" if wr >= 55 else "failed"])
    cr.append(["Regime stable (BOCPD change-point < 50%)", "passed" if (regime or {}).get("cp", 0) < 0.5 else "failed"])
    wts = [22, 22, 18, 14, 12, 12]; pts = sum(w * (1 if s == "passed" else 0.45 if s == "pending" else 0) for w, (_, s) in zip(wts, cr))
    pts += 6 * max(0, min(1, (c.get("consensus") or 0))) - (8 if mc.get("verdict") == "VETO" else 0); score = int(max(0, min(100, round(pts))))
    allp = all(s == "passed" for _, s in cr); score = max(92, score) if allp else min(91, score)
    tier = "S-TIER" if allp else "A" if score >= 80 else "B+" if score >= 62 else "WATCHLIST"
    return dict(c, tierScore=score, tier=tier, criteria=cr, passed=sum(1 for _, s in cr if s == "passed"), pending=sum(1 for _, s in cr if s == "pending"), journalWin=wr, journalN=jn, mtf="%d/%d" % (al, n) if n else "–")

def _warm16(st, pool, offline, wants):
    now = time.time(); F = st.get("feed") or {}; cands = (F.get("lane15") or {}).get("cands") or []; regime = (F.get("lane15") or {}).get("regime") or {}
    mtf = dict((F.get("lane9") or {}).get("mtf") or {}); mtf.update((F.get("lane10") or {}).get("mtf") or {}); journal = (F.get("journal") or {}).get("rows") or []
    rows = sorted((tier_of(c, mtf, journal, regime) for c in cands), key=lambda r: (-r["tierScore"], -(r.get("consensus") or 0)))
    seen = set(); uniq = []
    for r in rows:
        k = (r["sym"], r["side"])
        if k in seen: continue
        seen.add(k); uniq.append(r)
    return {"recs": {"rows": uniq[:30], "tiers": {t: sum(1 for r in uniq if r["tier"] == t) for t in ("S-TIER", "A", "B+", "WATCHLIST")}, "journal": len(journal), "mtfSyms": len(mtf), "sample": offline or any(r.get("sample") for r in uniq), "ts": now}}

# ---- Lane 17: smart order router + shadow-bracket slicer (plans only) ----
VENUES = {"crypto": [("Coinbase", 6.0, 1.0), ("Kraken", 8.0, 1.2)], "onchain": [("Jupiter", 0.0, 1.0), ("Raydium", 25.0, 1.1), ("Orca", 30.0, 1.15)], "stocks": [("Alpaca", 0.0, 1.0), ("IBKR", 0.5, 0.9)]}  # (venue, taker fee bps, depth factor)

def route_plan(req, fees=None):
    """SOR: rank venues by all-in cost (fee + half spread + impact), POV-paced IOC micro-slices, RAM-only shadow brackets,
    Solana priority fee from live percentiles, optional split across up to 3 of your own wallets (a sizing plan; ExTerm never signs)"""
    mkt = req.get("mkt") or ("onchain" if str(req.get("sym", "")).startswith("oc:") else "crypto" if "-" in str(req.get("sym", "")) else "stocks")
    usd = max(0.0, _hnum(req.get("usd"))); px = _hnum(req.get("px")); liq = max(1.0, _hnum(req.get("liq"), 1e6)); spread = _hnum(req.get("spreadBps"), 4.0); vol = max(1.0, _hnum(req.get("volPerMin"), liq / 50)); pov = min(0.25, max(0.01, _hnum(req.get("pov"), 0.1)))
    ranked = []
    for v, fee, depth in VENUES[mkt]:
        imp = amm_impact_pct(usd, liq * 2 * depth) * 100 if mkt == "onchain" else usd / (liq * depth) * 1e4 * 0.1
        ranked.append({"venue": v, "feeBps": fee, "impactBps": round(imp, 2), "allInBps": round(fee + spread / 2 + imp, 2)})
    ranked.sort(key=lambda x: x["allInBps"]); per_min = vol * pov; n = max(1, min(60, int(math.ceil(usd / max(1.0, per_min))))); child = usd / n
    sl, tp = _hnum(req.get("sl")), _hnum(req.get("tp")); wallets = max(1, min(3, int(_hnum(req.get("wallets"), 1))))
    plan = {"mkt": mkt, "route": ranked, "best": ranked[0]["venue"], "slices": n, "childUsd": round(child, 2), "orderType": "IOC", "povPct": round(pov * 100, 1), "spacingSec": round(60.0 / max(1, min(n, 60)) * (1 if n > 1 else 0), 2),
            "shadowBracket": {"sl": sl or None, "tp": tp or None, "where": "RAM only (never sent to the venue until triggered)"}, "wallets": [{"wallet": "W%d" % (i + 1), "usd": round(usd / wallets, 2)} for i in range(wallets)], "signs": False}
    if mkt == "onchain":
        f = fees or {}; plan["priorityFee"] = {"microLamports": int(f.get("p75") or 10000), "p50": f.get("p50"), "p90": f.get("p90"), "src": f.get("src", "default"), "jitoTip": "use your bot's Jito tip floor (not fetched: not on the allow-list)"}
    return plan

def _warm17(st, pool, offline, wants):
    now = time.time()
    if not offline and now - st.get("fAt", 0) >= 10:
        st["fAt"] = now
        try:
            j = json.loads(shield_fetch("https://solana-rpc.publicnode.com", "POST", json.dumps({"jsonrpc": "2.0", "id": 1, "method": "getRecentPrioritizationFees", "params": []}).encode(), {"Content-Type": "application/json", "User-Agent": "ExTerm/1.0"}, timeout=6)[1])
            fs = sorted(int(x.get("prioritizationFee") or 0) for x in j.get("result") or []); q = lambda f: fs[min(len(fs) - 1, int(f * (len(fs) - 1)))] if fs else 0
            st["fees"] = {"p50": q(0.5), "p75": q(0.75), "p90": q(0.9), "src": "getRecentPrioritizationFees", "at": now}
        except Exception: pass
    if offline and "fees" not in st: st["fees"] = {"p50": 5000, "p75": 12000, "p90": 50000, "src": "sample", "at": now}
    return {"status": {"fees": st.get("fees"), "brackets": len(st.get("br", {})), "venues": VENUES, "ts": now, "sample": offline}}

def _call17(st, job, a):
    if job == "route": return route_plan(a, st.get("fees"))
    br = st.setdefault("br", {})
    if job == "bracket":
        oid = str(a.get("id") or "")[:64]
        if not oid: raise ValueError("id required")
        if len(br) >= 500 and oid not in br: raise ValueError("too many open shadow brackets")
        br[oid] = {"sym": str(a.get("sym", ""))[:120], "side": "sell" if a.get("side") == "sell" else "buy", "sl": _hnum(a.get("sl")), "tp": _hnum(a.get("tp")), "qty": _hnum(a.get("qty"))}
        return {"ok": True, "open": len(br)}
    if job == "tick":
        sym, px, hits = str(a.get("sym", "")), _hnum(a.get("px")), []
        for oid, b in list(br.items()):
            if b["sym"] != sym or not px > 0: continue
            long = b["side"] == "buy"
            if b["sl"] and (px <= b["sl"] if long else px >= b["sl"]): hits.append({"id": oid, "exit": "STOP", "px": px, "orderType": "IOC"}); br.pop(oid)
            elif b["tp"] and (px >= b["tp"] if long else px <= b["tp"]): hits.append({"id": oid, "exit": "TAKE-PROFIT", "px": px, "orderType": "IOC"}); br.pop(oid)
        return {"triggered": hits, "open": len(br)}
    if job == "cancel": return {"ok": br.pop(str(a.get("id", "")), None) is not None, "open": len(br)}
    raise ValueError("unknown job")

# ---- Lane 18: pre-trade risk firewall + PIN-gated arming ----
MACRO_2026 = [("FOMC", "2026-01-28 19:00"), ("FOMC", "2026-03-18 18:00"), ("FOMC", "2026-04-29 18:00"), ("FOMC", "2026-06-17 18:00"), ("FOMC", "2026-07-29 18:00"), ("FOMC", "2026-09-16 18:00"), ("FOMC", "2026-10-28 18:00"), ("FOMC", "2026-12-09 19:00")]  # UTC decision times; add CPI dates in macro.json (the BLS calendar changes)

def macro_events(data_dir):
    from datetime import datetime as _dt, timezone as _tz
    ev = list(MACRO_2026)
    try: ev += [(str(e[0])[:12], str(e[1])[:16]) for e in json.loads((pathlib.Path(data_dir) / "macro.json").read_text())[:200]]
    except Exception: pass
    out = []
    for n, s in ev:
        try: out.append((n, _dt.strptime(s, "%Y-%m-%d %H:%M").replace(tzinfo=_tz.utc).timestamp()))
        except ValueError: pass
    return out

def risk_check(a, st, now=None):
    """the synchronous pre-trade firewall → {ok, verdict, checks[], size}; every LIVE order must pass, PAPER orders get the same report"""
    now = now or time.time(); ch = []; usd = _hnum(a.get("usd")); px = _hnum(a.get("px")); eq = max(1.0, _hnum(a.get("equity"), 10000)); atr = _hnum(a.get("atr")); sym = str(a.get("sym", ""))
    fx = (st.get("feed", {}).get("lane13") or {}).get("forensics", {}).get(sym) or a.get("forensics") or {}
    if sym.startswith("oc:"):
        ch.append(["honeypot / sell simulation", "fail" if fx.get("honeypot") else "pass" if fx else "warn", "sells blocked or no sells seen" if fx.get("honeypot") else "sells observed in the pool" if fx else "not yet scanned by Lane 13"])
        ch.append(["freeze / mint authority", "fail" if fx.get("freeze") else "pass" if fx else "warn", "authority still enabled" if fx.get("freeze") else "renounced" if fx else "unknown"])
    slip = _hnum(a.get("slipPct"), fx.get("impact") if fx.get("impact") is not None else 0.0)
    ch.append(["slippage ≤ 2% hard cap", "fail" if slip > 2 else "pass", "%.2f%%" % slip])
    p, b = min(0.99, max(0.01, _hnum(a.get("winp"), 0.5))), max(0.1, _hnum(a.get("payoff"), 2.0)); kelly = max(0.0, p - (1 - p) / b); risk_pct = min(0.02, kelly * 0.25)
    vol_size = (eq * risk_pct) / (atr / px) if atr > 0 and px > 0 else eq * risk_pct * 10; cap = min(vol_size, eq * 0.25)
    ch.append(["volatility-scaled size (ATR + ¼ Kelly f*)", "fail" if usd > cap * 1.0001 else "pass", "max $%.0f (f* %.3f)" % (cap, kelly)])
    pos = a.get("positions") or []; var = 1.65 * math.sqrt(sum((_hnum(x.get("usd")) * _hnum(x.get("vol"), 0.03)) ** 2 for x in pos) + (usd * (atr / px if px else 0.03)) ** 2)
    ch.append(["portfolio VaR heat cap (95 %, ≤ 6 % equity)", "fail" if var > eq * 0.06 else "pass", "VaR $%.0f" % var])
    losses = sorted(_hnum(t) for t in (a.get("lossTimes") or []))[-3:]
    ch.append(["3-loss cooldown (30 min)", "fail" if len(losses) == 3 and now - losses[0] <= 3600 and now - losses[-1] < 1800 else "pass", "%d recent losses" % len(losses)])
    age = _hnum(a.get("feedAgeSec"), 0); ch.append(["dead-feed lock (> 5.0 s)", "fail" if age > 5.0 else "pass", "%.1f s since the last tick" % age])
    soon = [n for n, t in macro_events(st.get("data", ".")) if 0 <= t - now <= 1800]; ch.append(["pre-CPI / FOMC 30-min pause", "fail" if soon else "pass", (soon[0] + " within 30 min") if soon else "no event within 30 min"])
    mode = st.get("mode", "PAPER"); fails = [c for c in ch if c[1] == "fail"]
    return {"ok": not fails, "verdict": "BLOCK" if fails else "ALLOW", "mode": mode, "live": mode == "LIVE" and not fails, "checks": [{"name": n, "state": s, "detail": d} for n, s, d in ch], "maxUsd": round(cap, 2)}

def _pin_hash(pin, salt): return hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(salt), 200000).hex()

def _call18(st, job, a):
    d = pathlib.Path(st.get("data", ".")); f = d / "arming.json"
    if job == "check": return risk_check(a, st)
    if job == "status":
        cfg = json.loads(f.read_text()) if f.exists() else {}
        return {"mode": st.get("mode", "PAPER"), "pinSet": bool(cfg.get("hash")), "locked": st.get("lockUntil", 0) > time.time(), "lockLeft": max(0, int(st.get("lockUntil", 0) - time.time()))}
    if job == "pin":  # set the PIN once (changing it needs the old PIN)
        pin = str(a.get("pin", "")); cfg = json.loads(f.read_text()) if f.exists() else {}
        if not re.match(r"^\d{4,12}$", pin): raise ValueError("PIN must be 4–12 digits")
        if cfg.get("hash") and _pin_hash(str(a.get("old", "")), cfg["salt"]) != cfg["hash"]: raise ValueError("old PIN is wrong")
        salt = secrets.token_hex(16); d.mkdir(parents=True, exist_ok=True); f.write_text(json.dumps({"salt": salt, "hash": _pin_hash(pin, salt)})); st["mode"] = "PAPER"; return {"ok": True, "mode": "PAPER"}
    if job == "arm":
        want = "LIVE" if a.get("mode") == "LIVE" else "PAPER"
        if want == "PAPER": st["mode"] = "PAPER"; return {"ok": True, "mode": "PAPER"}  # disarming never needs the PIN
        if st.get("lockUntil", 0) > time.time(): raise ValueError("too many wrong PINs: locked for %ds" % int(st["lockUntil"] - time.time()))
        cfg = json.loads(f.read_text()) if f.exists() else {}
        if not cfg.get("hash"): raise ValueError("set a PIN first")
        if not _hmac.compare_digest(_pin_hash(str(a.get("pin", "")), cfg["salt"]), cfg["hash"]):
            st["bad"] = st.get("bad", 0) + 1
            if st["bad"] >= 5: st["bad"] = 0; st["lockUntil"] = time.time() + 300
            raise ValueError("wrong PIN")
        st["bad"] = 0; st["mode"] = "LIVE"; return {"ok": True, "mode": "LIVE"}
    raise ValueError("unknown job")

def _warm18(st, pool, offline, wants):
    return {"status": dict(_call18(st, "status", {}), events=[{"name": n, "at": t} for n, t in macro_events(st.get("data", ".")) if t > time.time()][:4], ts=time.time())}

# ---- Lane 19: fill accuracy, toxic-flow scratch, 3-stage ratchet, SHA-256 audit ledger ----
def ratchet_stop(side, entry, r_unit, px, atr, stop):
    """3-stage profit lock: break-even at +1R → lock +1.5R at +2.5R → trail 0.6 × ATR beyond that; stops only ever tighten"""
    s = 1 if side == "buy" else -1; gain = s * (px - entry) / r_unit if r_unit > 0 else 0; new, stage = stop, 0
    if gain >= 1: new, stage = entry, 1
    if gain >= 2.5: new, stage = entry + s * 1.5 * r_unit, 2
    if gain > 2.5 and atr > 0: tr = px - s * 0.6 * atr; new, stage = (max(new, tr) if s > 0 else min(new, tr)), 3
    new = max(stop, new) if s > 0 else min(stop, new)
    return {"stop": round(new, 10), "stage": stage, "gainR": round(gain, 3)}

def manage_position(a):
    """→ actions: toxic-flow scratch (< 500 ms after entry, VPIN > 0.75 against us), emergency IOC exit (> 25 % pool liquidity
    drained in one block), or the ratchet stop"""
    side = "sell" if a.get("side") == "sell" else "buy"; age_ms = _hnum(a.get("ageMs")); vpin = _hnum(a.get("vpin")); flow = _hnum(a.get("flowSign"))  # +1 buys dominate, −1 sells
    if age_ms <= 500 and vpin > 0.75 and flow * (1 if side == "buy" else -1) < 0: return {"action": "SCRATCH", "orderType": "IOC", "why": "toxic flow: VPIN %.2f against the position %d ms after entry" % (vpin, age_ms)}
    drain = _hnum(a.get("liqDrainPct"))
    if drain > 25: return {"action": "EMERGENCY_EXIT", "orderType": "IOC", "why": "%.1f%% of pool liquidity drained in one block" % drain}
    r = ratchet_stop(side, _hnum(a.get("entry")), _hnum(a.get("rUnit")), _hnum(a.get("px")), _hnum(a.get("atr")), _hnum(a.get("stop")))
    return dict(r, action="MOVE_STOP" if r["stop"] != _hnum(a.get("stop")) else "HOLD")

def ledger_append(path, rec, cache=None):
    """SHA-256 hash chain: each line carries the previous line's hash; editing any line breaks every later hash.
    `cache` (the lane's memory) keeps the chain head, so an append is O(1) after the first scan"""
    p = pathlib.Path(path); prev = "0" * 64; n = 0
    if cache is not None and cache.get("path") == str(p) and p.exists() and cache.get("size") == p.stat().st_size: prev, n = cache["head"], cache["n"]
    elif p.exists():
        with p.open("rb") as fh:
            for line in fh:
                if line.strip(): n += 1; last = line
        if n: prev = json.loads(last)["hash"]
    body = {"n": n, "ts": round(time.time(), 3), "prev": prev, "rec": rec}
    h = hashlib.sha256((prev + json.dumps(body["rec"], sort_keys=True, separators=(",", ":")) + str(body["ts"]) + str(n)).encode()).hexdigest(); body["hash"] = h
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("ab") as fh: fh.write((json.dumps(body, separators=(",", ":")) + "\n").encode())
    if cache is not None: cache.update(path=str(p), head=h, n=n + 1, size=p.stat().st_size)
    return {"n": n, "hash": h}

def ledger_verify(path):
    p = pathlib.Path(path); prev = "0" * 64; n = 0
    if not p.exists(): return {"ok": True, "n": 0, "head": prev}
    for line in p.read_bytes().splitlines():
        if not line.strip(): continue
        b = json.loads(line); h = hashlib.sha256((prev + json.dumps(b["rec"], sort_keys=True, separators=(",", ":")) + str(b["ts"]) + str(b["n"])).encode()).hexdigest()
        if b.get("prev") != prev or b.get("hash") != h or b.get("n") != n: return {"ok": False, "n": n, "badAt": n}
        prev = h; n += 1
    return {"ok": True, "n": n, "head": prev}

def _call19(st, job, a):
    led = str(pathlib.Path(st.get("data", ".")) / "audit-ledger.jsonl"); fills = st.setdefault("fills", deque(maxlen=500))
    if job == "fill":
        exp, got, side = _hnum(a.get("expected")), _hnum(a.get("fill")), "sell" if a.get("side") == "sell" else "buy"
        bps = ((got / exp - 1) * 1e4 * (1 if side == "buy" else -1)) if exp > 0 else 0.0; fills.append(bps)
        rec = {"kind": "fill", "id": str(a.get("id", ""))[:64], "sym": str(a.get("sym", ""))[:120], "side": side, "expected": exp, "fill": got, "qty": _hnum(a.get("qty")), "slipBps": round(bps, 3), "mode": str(a.get("mode", "PAPER"))[:8]}
        L = ledger_append(led, rec, st.setdefault("lc", {})); return {"slipBps": round(bps, 3), "avgBps": round(sum(fills) / len(fills), 3), "n": len(fills), "ledger": L}
    if job == "order": return {"ledger": ledger_append(led, {"kind": "order", **{k: (str(v)[:120] if isinstance(v, str) else v) for k, v in a.items() if k in ("id", "sym", "side", "usd", "type", "mode", "venue", "verdict")}}, st.setdefault("lc", {}))}
    if job == "manage": return manage_position(a)
    if job == "verify": return ledger_verify(led)
    if job == "stats": v = ledger_verify(led); return {"fills": len(fills), "avgBps": round(sum(fills) / len(fills), 3) if fills else 0.0, "ledger": v}
    raise ValueError("unknown job")

def _warm19(st, pool, offline, wants):
    return {"status": dict(_call19(st, "stats", {}), ts=time.time())}

FAST_CALL = {17: _call17, 18: _call18, 19: _call19}
FAST_FWD = {9: (16,), 10: (16,), 11: (14,), 12: (14,), 13: (14, 18), 14: (15,), 15: (16,)}

FAST_WARM = {5: (_warm5, 15.0), 6: (_warm6, 10.0), 7: (lambda st, p, o, w: _warm_tape(st, p, o, w, 7), 1.0), 8: (lambda st, p, o, w: _warm_tape(st, p, o, w, 8), 2.0),
             9: (lambda st, p, o, w: _warm_ohlc(st, p, o, w, 9), 1.0), 10: (lambda st, p, o, w: _warm_ohlc(st, p, o, w, 10), 2.0), 11: (_warm11, 60.0), 12: (_warm12, 10.0), 13: (_warm13, 30.0),
             14: (_warm14, 5.0), 15: (_warm15, 5.0), 16: (_warm16, 5.0), 17: (_warm17, 10.0), 18: (_warm18, 5.0), 19: (_warm19, 10.0)}

def _fast_child(lane, inq, outq, offline, data_dir="."):
    """lane process entry point (top-level so Windows spawn can import it). Event-driven: blocks on its queue, so a call is
    answered the moment it arrives; warms on its period; forwarded snapshots re-warm early; exits with the parent"""
    import queue as _q
    fn, period = FAST_WARM[lane]; st = {"data": data_dir, "feed": {}}; wants = {}; pool = ThreadPoolExecutor(max_workers=LANE_WORKERS.get(lane, FAST_WORKERS), thread_name_prefix="fast%d" % lane); call = FAST_CALL.get(lane)
    try:
        import multiprocessing as _mp
        parent = _mp.parent_process()
    except Exception: parent = None
    nxt = 0.0; pid = os.getpid()
    while True:
        try:
            cmd, a, b = inq.get(timeout=max(0.0, min(0.5, nxt - time.time())))
            if cmd == "want": wants[a] = b; wants.pop(next(iter(wants)), None) if len(wants) > 24 else None; nxt = 0.0
            elif cmd == "feed": st["feed"][a] = b; nxt = min(nxt, time.time() + 0.25)
            elif cmd == "call":
                t0 = time.perf_counter()
                try: out = {"ok": True, "out": call(st, b[0], b[1]) if call else None}
                except Exception as e: out = {"ok": False, "err": str(e)[:200]}
                out["ms"] = (time.perf_counter() - t0) * 1000; outq.put(("res", a, out, pid)); continue
            elif cmd == "stop": return
        except _q.Empty: pass
        except (EOFError, OSError): return
        if parent is not None and not parent.is_alive(): return
        if time.time() >= nxt:
            t0 = time.perf_counter()
            try: snap = fn(st, pool, offline, dict(wants)); err = ""
            except Exception as e: snap = {}; err = str(e)[:160]
            try: outq.put(("snap", lane, snap, (time.perf_counter() - t0) * 1000, err, pid))
            except Exception: return
            nxt = time.time() + period

class FastLane:
    NAMES = {5: "Lane 5 · Crypto / Perps / On-Chain PnL", 6: "Lane 6 · Stocks / SEC Form 4 / 13F", 7: "Lane 7 · Crypto + DEX Transactions Tape", 8: "Lane 8 · US Stocks Tape / Blocks / L2",
             9: "Lane 9 · Crypto + DEX 1s–1M OHLCV", 10: "Lane 10 · US Equities 1m–1M OHLCV", 11: "Lane 11 · Equities & 0DTE Gamma Scanner", 12: "Lane 12 · Crypto Perps Squeeze Scanner", 13: "Lane 13 · On-Chain DEX / Rug Shield v2",
             14: "Lane 14 · Transfer Entropy + 6-Bot Consensus", 15: "Lane 15 · 1,000-Path Monte Carlo Stress", 16: "Lane 16 · MTF Confluence + Journal Correlator", 17: "Lane 17 · Order Router & Shadow-Bracket Slicer",
             18: "Lane 18 · Pre-Trade Risk Firewall & PIN Arming", 19: "Lane 19 · Fill Accuracy, Toxic Scratch & SHA-256 Audit"}
    def __init__(self, lane, offline=False, mode=None, data_dir="."):
        self.lane, self.offline = lane, offline; self.mode = mode or os.environ.get("EXTERM_FASTLANES", "process")
        self.snap, self.lru, self.lock = {}, MicroLRU(), threading.Lock(); self.ms = deque(maxlen=512); self.cms = deque(maxlen=512); self.warms = 0; self.warm_ms = 0.0; self.err = ""; self.pid = None; self.kind = "cold"; self.wants = {}
        self.waits, self.seq = {}, 0
        try:
            if self.mode != "process": raise RuntimeError("thread mode")
            import multiprocessing as _mp
            ctx = _mp.get_context("spawn"); self.inq, self.outq = ctx.Queue(), ctx.Queue()
            self.proc = ctx.Process(target=_fast_child, args=(lane, self.inq, self.outq, offline, str(data_dir)), daemon=True, name="exterm-lane%d" % lane); self.proc.start(); self.kind = "process"
        except Exception:
            import queue as _q
            self.inq, self.outq, self.proc = _q.Queue(), _q.Queue(), None
            threading.Thread(target=_fast_child, args=(lane, self.inq, self.outq, offline, str(data_dir)), daemon=True, name="exterm-lane%d" % lane).start(); self.kind = "thread"
        threading.Thread(target=self._drain, daemon=True, name="lane%d-drain" % lane).start()
    def _drain(self):
        while True:
            try: m = self.outq.get()
            except Exception: return
            if m[0] == "res":
                w = self.waits.pop(m[1], None); self.pid = m[3]
                if w: w[1].append(m[2]); w[0].set()
                continue
            _, lane, snap, ms, err, pid = m; fwd = snap.pop("fwd", None)
            with self.lock: self.snap.update(snap); self.warms += 1; self.warm_ms = ms; self.err = err; self.pid = pid
            if fwd is not None:
                for t in FAST_FWD.get(lane, ()):
                    L = FAST.get(t)
                    if L is not None: L.feed("lane%d" % lane, fwd)
    def feed(self, key, val):
        try: self.inq.put(("feed", key, val))
        except Exception: pass
    def call(self, job, args, timeout=2.0):
        """request / response through the lane process → (result, round-trip ms, in-lane ms); raises ValueError with the lane's message"""
        t0 = time.perf_counter(); ev = threading.Event(); box = []
        with self.lock: self.seq += 1; k = self.seq
        self.waits[k] = (ev, box); self.inq.put(("call", k, (job, args)))
        if not ev.wait(timeout): self.waits.pop(k, None); raise ValueError("lane %d timed out" % self.lane)
        r = box[0]; ms = (time.perf_counter() - t0) * 1000; self.cms.append(ms)
        if not r.get("ok"): raise ValueError(r.get("err") or "lane error")
        return r["out"], ms, r.get("ms", 0.0)
    def want(self, sym, px):
        if sym in self.wants and time.time() - self.wants[sym] < 5: return
        self.wants[sym] = time.time()
        if len(self.wants) > 64: self.wants.pop(next(iter(self.wants)))
        try: self.inq.put(("want", sym, px))
        except Exception: pass
    def get(self, key, fallback=None):
        """→ (encoded bytes, cache state). Never blocks on upstream: LRU → snapshot → fallback builder (synth / warming stub)"""
        t0 = time.perf_counter(); b = self.lru.get(key); state = "LRU"
        if b is None:
            with self.lock: v = self.snap.get(key)
            state = "SNAP"
            if v is None: v = fallback() if fallback else {"warming": True, "rows": [], "items": []}; state = "FALLBACK"
            v = dict(v, lane=self.lane); b = json.dumps(v).encode(); self.lru.put(key, b)
        ms = (time.perf_counter() - t0) * 1000; self.ms.append(ms)
        return b, state, ms
    def public(self):
        ms = sorted(self.ms); cm = sorted(self.cms); q = lambda a, f: a[min(len(a) - 1, int(f * (len(a) - 1) + 0.5))] if a else 0
        return {"lane": self.lane, "name": self.NAMES[self.lane], "kind": self.kind, "workers": LANE_WORKERS.get(self.lane, FAST_WORKERS), "pid": self.pid, "isolated": self.kind == "process" and self.pid not in (None, os.getpid()),
                "warms": self.warms, "warmMs": round(self.warm_ms, 1), "keys": len(self.snap), "hits": self.lru.hits, "miss": self.lru.miss, "err": self.err,
                "p50": q(ms, 0.5), "p99": q(ms, 0.99), "callP50": q(cm, 0.5), "callP99": q(cm, 0.99), "calls": len(cm), "lruMs": int(FAST_LRU_TTL * 1000)}
    def shutdown(self):
        try: self.inq.put(("stop", None, None))
        except Exception: pass

FAST = {}
FAST_LANE_IDS = tuple(range(5, 20))  # v17.8 Lanes 5–8 + v17.9 Lanes 9–19


class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *a):
        pass

    def _send(self, code, body, ctype="application/json", extra=None):
        try:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "no-store")
            for k, v in SEC_HEADERS.items():
                self.send_header(k, v)
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # the tab went away mid-response: nothing to report

    def _local_ok(self):
        """Security: reject DNS-rebinding (foreign Host) and cross-site requests (foreign Origin).
        --lan also accepts private / Tailscale IP literals and *.ts.net (never arbitrary DNS names), with Origin == Host."""
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0].strip("[]").lower()
        if not (host in ("localhost", "127.0.0.1", "::1") or (LAN and OPS is not None and OPS.lan_host_ok(host))):
            self._send(421, b"misdirected request", "text/plain"); return False
        origin = self.headers.get("Origin")
        ou = urllib.parse.urlparse(origin) if origin else None
        okh = ("localhost", "127.0.0.1", "::1") + ((host,) if LAN else ())
        if origin and not (ou.scheme == "http" and ou.hostname in okh and ou.port == PORT):
            self._send(403, b'{"error":"cross-origin request blocked"}'); return False
        return True

    def _loopback(self):
        ip = self.client_address[0]
        if ip in ("127.0.0.1", "::1", "::ffff:127.0.0.1"): return True
        # Docker (EXTERM_BIND=0.0.0.0, no --lan): the host's loopback arrives through the bridge gateway (172.17.0.1 …); the compose
        # file publishes the port on the host's 127.0.0.1 only, so a private source here is the host itself
        return not LAN and os.environ.get("EXTERM_BIND") == "0.0.0.0" and _private_ip(ip)

    def _token_ok(self):
        return _hmac.compare_digest(self.headers.get("X-ExTerm") or "", TOKEN)

    def _json_body(self, limit=64 * 1024):
        n = int(self.headers.get("Content-Length") or 0)
        if n > limit: raise ValueError("request too large")
        if n and "application/json" not in (self.headers.get("Content-Type") or ""): raise ValueError("expected JSON")
        j = json.loads(self.rfile.read(n) or b"{}")
        if not isinstance(j, dict): raise ValueError("expected a JSON object")
        return j

    def _api(self, method, p):
        if not self._token_ok():
            return self._send(403, b'{"error":"missing or wrong session token"}')
        if not rate_ok(0.5):
            return self._send(429, b'{"error":"local rate limit"}')
        try:
            if p == "/api/caps" and method == "GET":
                return self._send(200, json.dumps({"version": VERSION, "alerts": ALERTS is not None, "bots": BOTS is not None, "ollama": ollama_up(), "state": STATE is not None, "feed": FEED is not None, "intel": INTEL is not None, "llm": LLM is not None, "update": "--no-update-check" not in sys.argv}).encode())
            if p == "/api/update" and method == "GET":
                if "--no-update-check" in sys.argv: return self._send(503, b'{"error":"update check is off"}')
                return self._send(200, json.dumps(update_info()).encode())
            if p == "/api/health" and method == "GET":  # Grok telemetry strip: uptime, RAM cache hit rate, bot heartbeats (read-only, no secrets)
                bots = BOTS.public()["bots"] if BOTS is not None else []
                return self._send(200, json.dumps({"version": VERSION, "uptime": int(time.time() - STARTED), "cache": dict(CACHE_STATS), "polls": FEED.polls if FEED is not None else 0,
                                                   "bots": {"total": len(bots), "active": sum(1 for b in bots if b.get("active")), "lastBar": max([b.get("lastBar") or 0 for b in bots] or [0])}}).encode())
            if p == "/api/fast" and method == "GET":  # v17.8: Lanes 5–8 telemetry
                return self._send(200, json.dumps({"lanes": [FAST[k].public() for k in sorted(FAST)], "server_pid": os.getpid()}).encode())
            m8 = re.match(r"^/api/lane([5-8])/([a-z0-9]{2,12})$", p)
            if m8 and method == "GET":  # v17.8: answered from the lane's RAM snapshot (never waits on upstream)
                ln, what = int(m8.group(1)), m8.group(2); L = FAST.get(ln)
                if L is None: return self._send(503, b'{"error":"fast lanes are off (--no-fastlanes)"}')
                q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query); fb = None
                if ln == 5 and what == "board":
                    win = (q.get("win") or ["24h"])[0]
                    if win not in LB_WIN: raise ValueError("win must be 24h, 7d or 30d")
                    key = "board:" + win
                elif (ln, what) in ((5, "whales"), (5, "perps"), (6, "insiders"), (6, "clusters"), (6, "alerts"), (6, "f13")): key = what
                elif ln in (7, 8) and what == "tape":
                    sym = (q.get("sym") or [""])[0][:120]
                    if not TAPE_SYM.match(sym) or (ln == 8) == (sym.startswith("oc:") or "-" in sym): raise ValueError("unsupported symbol for this lane")
                    px = _hnum((q.get("px") or ["0"])[0][:24]); L.want(sym, px if 0 < px < 1e9 else 0.0); key = "tape:" + sym
                    fb = lambda: {"sym": sym, "rows": tape_tags(synth_prints(sym, px, 40, time.time(), ln == 8), 25000), "src": "synth", "synth": True, "warming": True, "ts": time.time(), **({"l2": model_l2(px, sym), "blocks": [], "sweeps": []} if ln == 8 else {})}
                else: return self._send(404, b'{"error":"not found"}')
                body, state, ms = L.get(key, fb)
                return self._send(200, body, "application/json", {"X-ExTerm-Lane": str(ln), "X-ExTerm-Cache": state, "Server-Timing": "lane%d;dur=%.3f;desc=%s" % (ln, ms, state)})
            m9 = re.match(r"^/api/lane(9|1[0-9])/([a-z0-9]{2,12})$", p)
            if m9:  # v17.9: Lanes 9–19 (snapshots for GET, request / response through the lane process for POST)
                ln, what = int(m9.group(1)), m9.group(2); L = FAST.get(ln)
                if L is None: return self._send(503, b'{"error":"fast lanes are off (--no-fastlanes)"}')
                q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query); fb = None
                if method == "GET":
                    if ln in (9, 10) and what == "candles":
                        sym, tf = (q.get("sym") or [""])[0][:120], (q.get("tf") or [""])[0][:4]
                        if tf not in TF_SEC or not TAPE_SYM.match(sym) or (ln == 10) == (sym.startswith("oc:") or "-" in sym): raise ValueError("unsupported symbol / timeframe for this lane")
                        px = _hnum((q.get("px") or ["0"])[0][:24]); L.want(sym + "|" + tf, px if 0 < px < 1e12 else 0.0); key = "c:" + sym + "|" + tf
                        fb = lambda: {"sym": sym, "tf": tf, "rows": [], "warming": True, "unsupported": ln == 10 and TF_SEC[tf] < 60}
                    elif (ln, what) in ((9, "mtf"), (10, "mtf"), (11, "scan"), (12, "scan"), (13, "scan"), (14, "consensus"), (15, "stress"), (16, "recs"), (17, "status"), (19, "status")): key = what
                    elif ln == 18 and what == "status":
                        out, rt, inner = L.call("status", {}); return self._send(200, json.dumps({"ok": True, "out": out, "ms": rt, "laneMs": inner}).encode(), "application/json", {"Server-Timing": "lane18;dur=%.3f" % rt})
                    elif ln == 19 and what == "ledger":
                        out, rt, inner = L.call("verify", {}); return self._send(200, json.dumps({"ok": True, "out": out, "ms": rt, "laneMs": inner}).encode(), "application/json", {"Server-Timing": "lane19;dur=%.3f" % rt})
                    else: return self._send(404, b'{"error":"not found"}')
                    body, state, ms = L.get(key, fb)
                    return self._send(200, body, "application/json", {"X-ExTerm-Lane": str(ln), "X-ExTerm-Cache": state, "Server-Timing": "lane%d;dur=%.3f;desc=%s" % (ln, ms, state)})
                if method == "POST":
                    jobs = {17: ("route", "bracket", "tick", "cancel"), 18: ("check", "pin", "arm"), 19: ("fill", "order", "manage", "verify")}
                    if what not in jobs.get(ln, ()): return self._send(404, b'{"error":"not found"}')
                    if ln == 18 and what in ("pin", "arm") and not self._loopback(): return self._send(403, b'{"error":"the PIN gate only works on the computer running ExTerm"}')
                    out, rt, inner = L.call(what, self._json_body(64 * 1024))
                    return self._send(200, json.dumps({"ok": True, "out": out, "ms": rt, "laneMs": inner}).encode(), "application/json", {"X-ExTerm-Lane": str(ln), "Server-Timing": "lane%d;dur=%.3f" % (ln, rt)})
                return self._send(405, b'{"error":"method not allowed"}')
            if p.startswith("/api/lanes"):  # v17.5: 4 dedicated execution lanes (telemetry + allow-listed jobs)
                if LANES is None: return self._send(503, b'{"error":"execution lanes are off (--no-lanes)"}')
                if p == "/api/lanes" and method == "GET": return self._send(200, json.dumps(LANES.public()).encode())
                if p == "/api/lanes/run" and method == "POST":
                    j = self._json_body(512 * 1024); lane, job, args = j.get("lane"), j.get("job"), j.get("args")
                    if not lane_args_ok(lane, job, args): return self._send(400, b'{"error":"unknown lane / job or bad arguments"}')
                    t0 = time.perf_counter(); out = LANES.run(lane, job, args)
                    return self._send(200, json.dumps({"ok": True, "lane": lane, "job": job, "ms": (time.perf_counter() - t0) * 1000, "out": out}).encode())
            if p.startswith("/api/daemon"):  # v17.0: 24/7 daemon status + Wake-Up digest; arming only from this computer
                if not DAEMON or OPS is None: return self._send(503, b'{"error":"start the launcher with --bot-daemon"}')
                if p == "/api/daemon" and method == "GET":
                    return self._send(200, json.dumps(OPS.status(DATA_DIR, SUP)).encode())
                if not self._loopback(): return self._send(403, b'{"error":"arming is only possible on the computer running the daemon"}')
                if p == "/api/daemon/arm" and method == "POST":
                    rec = OPS.arm(DATA_DIR, self._json_body(8 * 1024)); return self._send(200, json.dumps({"armed": True, "armedAt": rec["ts"], "cashCap": rec["cashCap"], "maxSlipBps": rec["maxSlipBps"]}).encode())
                if p == "/api/daemon/disarm" and method == "POST":
                    OPS.disarm(DATA_DIR); return self._send(200, b'{"armed":false}')
                return self._send(404, b'{"error":"not found"}')
            if p == "/api/pair" and method == "GET":  # --lan: the URL behind the QR (loopback page only)
                if not (LAN and self._loopback()): return self._send(404, b'{"error":"not in --lan mode"}')
                return self._send(200, json.dumps({"url": pair_url(), "qr": "/pair.svg", "ips": OPS.lan_ips()}).encode())
            if p == "/api/integrity" and method == "GET":  # Settings -> Verify build integrity: on-disk files vs SHA256SUMS.txt
                return self._send(200, json.dumps(integrity()).encode())
            if p == "/api/doctor" and method == "GET":  # read-only health checks for Settings -> Field Manual -> System Doctor
                return self._send(200, json.dumps({"checks": doctor_cached(net="--offline" not in sys.argv)}).encode())
            if p == "/api/feed" and method == "GET":  # ?syms=oc:solana:<pool>,AAPL,... registers them; answers from RAM, never blocks on upstream
                if FEED is None: return self._send(503, b'{"error":"the price feed is off"}')
                q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
                syms = [x for x in (q.get("syms") or [""])[0][:40000].split(",")[:PriceFeed.MAX_SYMS + 1] if x][:PriceFeed.MAX_SYMS]
                FEED.want(syms)
                snap = FEED.snapshot(syms or None)
                if syms: CACHE_STATS["total"] += len(syms); CACHE_STATS["hits"] += sum(1 for s in syms if s in snap)
                return self._send(200, json.dumps({"ts": time.time(), "prices": snap, "polls": FEED.polls, "error": FEED.last_err}).encode())
            if p == "/api/swaps" and method == "GET":  # v16.4: ?sym=oc:<chain>:<pool>&since=<unix s> -> de-duplicated DEX swaps from RAM (poll every 500 ms)
                q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
                try: since = float((q.get("since") or ["0"])[0][:20])
                except ValueError: since = 0.0
                return self._send(200, json.dumps(SWAPS.get((q.get("sym") or [""])[0][:140], since)).encode())
            if p == "/api/ticks" and method == "GET":  # ?sym=AAPL -> the RAM tick buffer (last hour at 2 s) for 1s / 5s / 15s bars
                if FEED is None: return self._send(503, b'{"error":"the price feed is off"}')
                sym = (urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("sym") or [""])[0][:120]
                if PriceFeed.kind(sym) is None: raise ValueError("unsupported symbol")
                return self._send(200, json.dumps({"sym": sym, "ticks": FEED.tick_history(sym)}).encode())
            if p.startswith("/api/hl/"):  # v15.4 leaderboards: allow-listed, read-only, 30 s RAM cache
                if HL is None: return self._send(503, b'{"error":"leaderboards are off"}')
                q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
                if p == "/api/hl/leaderboard" and method == "GET": return self._send(200, json.dumps(HL.board()).encode())
                if p == "/api/hl/trader" and method == "GET":
                    types = [t for t in (q.get("types") or ["clearinghouseState"])[0][:120].split(",") if t][:3]
                    return self._send(200, json.dumps(HL.trader((q.get("addr") or [""])[0][:64], types, hl_refs((q.get("ref") or [""])[0]))).encode())
                return self._send(404, b'{"error":"not found"}')
            if p.startswith("/api/intel"):
                if INTEL is None: return self._send(503, b'{"error":"World Monitor intel is off"}')
                if p == "/api/intel" and method == "GET": return self._send(200, json.dumps(INTEL.public()).encode())
                if p == "/api/intel/config" and method == "POST":
                    INTEL.set_cfg(self._json_body(4096)); return self._send(200, json.dumps(INTEL.public()).encode())
                return self._send(404, b'{"error":"not found"}')
            if p.startswith("/api/state") or p == "/api/journal":
                if STATE is None: return self._send(503, b'{"error":"saving to this computer is off"}')
                if p == "/api/state" and method == "GET": return self._send(200, json.dumps(STATE.public()).encode())
                if p == "/api/state/summary" and method == "GET": return self._send(200, json.dumps(STATE.summary()).encode())
                if p == "/api/journal" and method == "GET": return self._send(200, json.dumps(STATE.public(True)["journal"]).encode())
                if p == "/api/state" and method == "POST": return self._send(200, json.dumps({"ok": True, **STATE.apply(self._json_body(20 * 1024 * 1024))}).encode())
                return self._send(404, b'{"error":"not found"}')
            if p.startswith("/api/bots"):
                if BOTS is None: return self._send(503, b'{"error":"background bots are off"}')
                if p == "/api/bots" and method == "GET": return self._send(200, json.dumps(BOTS.public()).encode())
                if p == "/api/bots" and method == "POST":
                    nb = BOTS.upsert(self._json_body(48 * 1024)); return self._send(200, json.dumps({"ok": True, "bot": nb}).encode())
                if p == "/api/bots/shield" and method == "POST":  # Grok tab: "shield my bots now" / lift the shield on resume
                    b = self._json_body(4096); n = BOTS.shield(pause=bool(b.get("pause", True)), tighten=bool(b.get("tighten", False)), clear=bool(b.get("clear", False)))
                    return self._send(200, json.dumps({"ok": True, "bots": n}).encode())
                if p in ("/api/bots/delete", "/api/bots/close") and method == "POST":
                    bid = str(self._json_body(4096).get("id", ""))[:40]
                    if not BOT_ID_RX.match(bid): raise ValueError("bad bot id")
                    if p.endswith("delete"): BOTS.remove(bid); return self._send(200, b'{"ok":true}')
                    t = BOTS.close(bid); return self._send(200, json.dumps({"ok": True, "trade": t}).encode())
                return self._send(404, b'{"error":"not found"}')
            if p.startswith("/api/llm-signal"):  # v16.5 AI Bridge: the page pulls queued receipts and reads its bridge key (token-gated)
                if LLM is None: return self._send(503, b'{"error":"the AI Bridge endpoint is off"}')
                if p == "/api/llm-signal" and method == "GET":
                    try: since = int((urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("since") or ["0"])[0][:12])
                    except ValueError: since = 0
                    return self._send(200, json.dumps(LLM.since(since)).encode())
                if p == "/api/llm-signal/key" and method == "GET": return self._send(200, json.dumps({"key": LLM.key, "endpoint": "http://127.0.0.1:%d/llm-signal" % PORT, "header": "X-ExTerm-Bridge"}).encode())
                if p == "/api/llm-signal" and method == "POST":
                    rc = LLM.submit(self._json_body(16 * 1024)); return self._send(200 if rc["status"] == "accepted" else 422, json.dumps({"ok": rc["status"] == "accepted", "receipt": rc}).encode())
                return self._send(404, b'{"error":"not found"}')
            if p == "/api/notify" and method == "POST":  # wallet-tracker / social alerts from the page -> your Telegram / Discord
                if ALERTS is None: return self._send(503, b'{"error":"notifications are off"}')
                if not NOTIFY_RL.ok(): return self._send(429, b'{"error":"too many notifications (max 20 a minute)"}')
                body = self._json_body(600 * 1024)
                text = str(body.get("text", "")).replace("\r", " ")[:900]
                if len(text.strip()) < 3: raise ValueError("empty message")
                png = b""
                if body.get("png"):  # optional chart snapshot: base64 PNG, magic bytes checked, 400 KB max
                    import base64 as _b64
                    try: png = _b64.b64decode(str(body["png"])[:560000], validate=True)
                    except Exception: raise ValueError("bad snapshot")
                    if not png.startswith(b"\x89PNG\r\n\x1a\n") or len(png) > 400 * 1024: raise ValueError("snapshot must be a PNG under 400 KB")
                sent = ALERTS.send_card("ExTerm · " + neutralize(text), png) if png and hasattr(ALERTS, "send_card") else ALERTS.send("ExTerm · " + neutralize(text))
                return self._send(200, json.dumps({"ok": bool(sent), "sent": sent}).encode())
            if ALERTS is None and p.startswith("/api/alerts"):
                return self._send(503, b'{"error":"background alerts are off"}')
            if not p.startswith("/api/alerts"):
                return self._send(404, b'{"error":"not found"}')
            if p == "/api/alerts" and method == "GET":
                return self._send(200, json.dumps(ALERTS.public()).encode())
            if p == "/api/alerts" and method == "POST":
                n = ALERTS.set_alerts(self._json_body().get("alerts"))
                return self._send(200, json.dumps({"ok": True, "count": n}).encode())
            if p == "/api/alerts/config" and method == "POST":
                ALERTS.set_cfg(self._json_body(8 * 1024))
                return self._send(200, json.dumps(ALERTS.public()).encode())
            if p == "/api/alerts/test" and method == "POST":
                sent = ALERTS.send("✅ ExTerm test message: background alerts can reach you here.")
                return self._send(200, json.dumps({"ok": bool(sent), "sent": sent}).encode())
        except ValueError as e:
            return self._send(400, json.dumps({"error": str(e)[:120]}).encode())
        except Exception as e:
            return self._send(502, json.dumps({"error": str(e)[:120]}).encode())
        self._send(404, b'{"error":"not found"}')

    def _ollama(self, method, p):
        """Bridge to a model running on THIS computer (Ollama), so the page needs no CORS setup. Fixed host, fixed paths."""
        if not self._token_ok():
            return self._send(403, b'{"error":"missing or wrong session token"}')
        sub = p[len("/ollama/"):]
        if sub not in OLLAMA_PATHS:
            return self._send(404, b'{"error":"not an allowed local-model route"}')
        data = None
        if method == "POST":
            n = int(self.headers.get("Content-Length") or 0)
            if n > 512 * 1024:
                return self._send(413, b'{"error":"request too large"}')
            data = self.rfile.read(n)
        try:
            req = urllib.request.Request(OLLAMA + "/" + sub, data=data, headers={"Content-Type": "application/json"}, method=method)
            with LOCAL_OPENER.open(req, timeout=180) as r:
                body = r.read(8 * 1024 * 1024 + 1)
                if len(body) > 8 * 1024 * 1024:
                    return self._send(502, b'{"error":"model response too large"}')
                self._send(r.status, body, "application/json")
        except urllib.error.HTTPError as e:
            self._send(e.code, (e.read(65536) if e.fp else b"") or b'{"error":"local model error"}')
        except Exception:
            self._send(502, b'{"error":"Ollama isn\'t running on this computer (start it, then try again)"}')

    def _proxy(self, method):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        url = (q.get("u") or [""])[0]
        host = urllib.parse.urlparse(url).hostname or ""
        if not _hmac.compare_digest(self.headers.get("X-ExTerm") or "", TOKEN):  # per-launch token; foreign origins can't read it or send custom headers without a preflight we never approve
            return self._send(403, b'{"error":"missing or wrong session token"}')
        if not rate_ok():
            return self._send(429, b'{"error":"local rate limit"}')
        if not url.startswith("https://") or not host_allowed(host):
            return self._send(403, b'{"error":"host not allowed"}')
        data = None
        if method == "POST":
            n = int(self.headers.get("Content-Length") or 0)
            if n > 1024 * 1024:
                return self._send(413, b'{"error":"request too large"}')
            data = self.rfile.read(n)
        hdr = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept": "application/json, text/xml, */*"}
        if host.endswith("sec.gov"):  # SEC requires a descriptive User-Agent with a contact address
            hdr["User-Agent"] = "ExTerm personal research tool " + (self.headers.get("X-Contact") or "exterm-user@example.com")
            hdr["Accept-Encoding"] = "identity"
        if host.endswith("cnn.io"):
            hdr["Referer"] = "https://edition.cnn.com/"; hdr["Origin"] = "https://edition.cnn.com"
        for k in ("Content-Type", "Authorization", "HTTP-Referer", "X-Title", "x-api-key", "X-MBX-APIKEY", "API-Key", "API-Sign", "X-BAPI-API-KEY", "X-BAPI-SIGN", "X-BAPI-TIMESTAMP", "X-BAPI-RECV-WINDOW", "APCA-API-KEY-ID", "APCA-API-SECRET-KEY"):
            if self.headers.get(k):
                hdr[k] = self.headers[k]
        try:
            status, body, ctype = shield_fetch(url, method, data, hdr, timeout=30)
            if status == 200 and (self.headers.get("X-ExTerm-Pack") or "").lower() == "ohlcv":  # v17.0 compact candles (~65% smaller)
                packed = pack_ohlcv(host, body)
                if packed is not None:
                    return self._send(200, packed, "application/json", {"X-ExTerm-Cache": "LIVE", "X-ExTerm-Packed": "ohlcv", "Server-Timing": "swr;desc=LIVE"})
            self._send(status, body, ctype, {"X-ExTerm-Cache": "LIVE", "Server-Timing": "swr;desc=LIVE"})  # Server-Timing: the v17.2 Synapse reads L2 cache state from Resource Timing
        except UpstreamBlocked as e:
            ra = str(max(1, int(e.retry_after + 0.999)))
            stale = shield_stale(url) if method == "GET" else None  # never replay a stale answer to a POST
            if stale and e.status in (429, 502, 504):
                age = max(0, int(time.time() - stale[0]))
                return self._send(200, stale[1], stale[2], {"X-ExTerm-Cache": "STALE", "X-ExTerm-Stale-Age": str(age), "Retry-After": ra, "Server-Timing": "swr;desc=STALE"})
            self._send(e.status, json.dumps({"error": e.reason, "rateLimited": e.status == 429, "retryAfter": int(ra), "host": host}).encode(),
                       "application/json", {"Retry-After": ra, "X-ExTerm-Cache": "MISS", "Server-Timing": "swr;desc=MISS"})
        except urllib.error.HTTPError as e:
            self._send(e.code, getattr(e, "exterm_body", b"") or json.dumps({"error": str(e.reason)}).encode())
        except Exception as e:
            self._send(502, json.dumps({"error": str(e)[:200]}).encode())

    def do_GET(self):
        if not self._local_ok():
            return
        p = urllib.parse.urlparse(self.path).path
        if p in ("/", "/index.html", "/exterm.html") and not self._loopback():  # --lan: a phone must present this launch's pairing secret
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if not (LAN and PAIR and _hmac.compare_digest((q.get("pair") or [""])[0], PAIR)):
                return self._send(403, b"<!doctype html><meta name=viewport content='width=device-width'><body style='font:16px system-ui;background:#07080B;color:#F5C84B;padding:24px'>Scan the pairing QR code shown by ExTerm on your computer.</body>", "text/html; charset=utf-8")
        if p == "/pair.svg":  # the pairing QR, shown only on the computer itself
            if not (LAN and OPS is not None and self._loopback()): return self._send(404, b"not found", "text/plain")
            return self._send(200, OPS.qr_svg(pair_url()).encode(), "image/svg+xml")
        if p in ("/", "/index.html", "/exterm.html"):
            page = APP.read_bytes().replace(b'<meta name="referrer"', b'<meta name="nt-token" content="' + TOKEN.encode() + b'">\n<meta name="referrer"', 1)
            return self._send(200, page, "text/html; charset=utf-8")
        if p == "/manifest.webmanifest":
            return self._send(200, MANIFEST, "application/manifest+json")
        if p == "/sw.js":
            return self._send(200, SW_JS, "text/javascript; charset=utf-8")
        if p in ("/icon-192.png", "/icon-512.png"):
            b, ct = icon_bytes(int(p[6:9]))
            return self._send(200, b, ct)
        if p == "/proxy/ping":
            if not _hmac.compare_digest(self.headers.get("X-ExTerm") or "", TOKEN):
                return self._send(403, b"missing header", "text/plain")
            return self._send(200, b"exterm-proxy", "text/plain")
        if p == "/llm-signal":  # usage hint for bot authors (never the key)
            return self._send(200, json.dumps({"ok": LLM is not None, "post": "/llm-signal", "header": "X-ExTerm-Bridge", "keyfile": "~/.exterm/bridge.key",
                                               "schema": {"symbol": "SOL", "side": "long|short", "entry": 0, "stop_loss": 0, "tp": [0], "confidence": "0-100", "reason": "", "source": ""}}).encode())
        if p == "/proxy":
            return self._proxy("GET")
        if p.startswith("/api/"):
            return self._api("GET", p)
        if p.startswith("/ollama/"):
            return self._ollama("GET", p)
        self._send(404, b"not found", "text/plain")

    def _hook(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        url = (q.get("u") or [""])[0]; u = urllib.parse.urlparse(url); host = (u.hostname or "").lower()
        if not _hmac.compare_digest(self.headers.get("X-ExTerm") or "", TOKEN):
            return self._send(403, b'{"error":"missing or wrong session token"}')
        if not hook_target_ok(url):
            return self._send(403, json.dumps({"error": "webhook target must be 127.0.0.1 / localhost or an allow-listed private-LAN https host:port: " + host[:80]}).encode())
        if not rate_ok(2):
            return self._send(429, b'{"error":"local rate limit"}')
        n = int(self.headers.get("Content-Length") or 0)
        if n > 64 * 1024:
            return self._send(413, b'{"error":"signal too large"}')
        data = self.rfile.read(n)
        hdr = {"User-Agent": "ExTerm-Signal/1.0", "Content-Type": self.headers.get("Content-Type") or "application/json"}
        try:
            with OPENER.open(urllib.request.Request(url, data=data, headers=hdr, method="POST"), timeout=20) as r:
                self._send(r.status, r.read(65536) or b"{}", r.headers.get("Content-Type", "text/plain"))
        except urllib.error.HTTPError as e:
            self._send(e.code, (e.read(65536) if e.fp else b"") or json.dumps({"error": str(e.reason)}).encode())
        except Exception as e:
            self._send(502, json.dumps({"error": str(e)}).encode())

    def _llm_signal(self):
        """v16.5 universal AI / bot proposal endpoint. Loopback only, no browser origins (_local_ok), bridge key or session token."""
        if LLM is None: return self._send(503, b'{"error":"the AI Bridge endpoint is off"}')
        if self.client_address[0] not in ("127.0.0.1", "::1", "::ffff:127.0.0.1"): return self._send(403, b'{"error":"loopback only"}')
        if not (_hmac.compare_digest(self.headers.get("X-ExTerm-Bridge") or "", LLM.key) or self._token_ok()):
            return self._send(403, b'{"error":"missing or wrong X-ExTerm-Bridge key (see the AI Bridge tab or ~/.exterm/bridge.key)"}')
        if not LLM.rl.ok(): return self._send(429, b'{"error":"too many proposals (max 60 a minute)"}')
        try:
            j = self._json_body(16 * 1024)
        except ValueError as e:
            return self._send(400, json.dumps({"error": str(e)[:120]}).encode())
        except Exception:
            return self._send(400, b'{"error":"body must be a JSON object"}')
        rc = LLM.submit(j)
        return self._send(200 if rc["status"] == "accepted" else 422, json.dumps({"ok": rc["status"] == "accepted", "receipt": rc}).encode())

    def do_POST(self):
        if not self._local_ok():
            return
        if urllib.parse.urlparse(self.path).path == "/llm-signal":
            return self._llm_signal()
        if urllib.parse.urlparse(self.path).path == "/hook":
            return self._hook()
        if urllib.parse.urlparse(self.path).path == "/proxy":
            return self._proxy("POST")
        p = urllib.parse.urlparse(self.path).path
        if p.startswith("/api/"):
            return self._api("POST", p)
        if p.startswith("/ollama/"):
            return self._ollama("POST", p)
        self._send(404, b"not found", "text/plain")

# ───────── installable app (PWA) ─────────
MANIFEST = json.dumps({"name": "ExTerm", "short_name": "ExTerm", "start_url": "/", "scope": "/", "display": "standalone", "background_color": "#07080B", "theme_color": "#07080B",
                       "description": "Free paper-trading terminal: crypto, stocks, on-chain tokens, bots and backtests.",
                       "icons": [{"src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"}, {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"}]}).encode()
# Network-first: the page always comes fresh from the launcher (it carries a per-launch token), the cached copy is only
# an offline fallback. API, proxy, local-model and webhook calls are never cached or intercepted.
SW_JS = b"""const C = 'exterm-v15';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (/^\\/(api|proxy|ollama|hook|llm-signal)(\\/|$|\\?)/.test(u.pathname)) return;
  if (e.request.mode === 'navigate' || u.pathname === '/' || /\\.(png|webmanifest)$/.test(u.pathname)) {
    e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(C).then((c) => c.put(e.request, cp)); } return r; }).catch(() => caches.match(e.request).then((m) => m || new Response('ExTerm is offline: start the launcher again.', { status: 503, headers: { 'Content-Type': 'text/plain' } }))));
  }
});
"""
ICON_SVG = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#07080B"/><path d="M150 380V132l212 248V132" fill="none" stroke="#F5C84B" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/></svg>'

def icon_bytes(size):
    for c in (HERE / ("icon-%d.png" % size), HERE / "dist" / ("icon-%d.png" % size), HERE / "brand" / "exterm-icon-512.png"):
        if c.exists(): return c.read_bytes(), "image/png"
    return ICON_SVG, "image/svg+xml"

def find_chrome():
    """Locate Google Chrome (falls back to Chromium) on Windows, macOS and Linux."""
    cands = []
    if sys.platform.startswith("win"):
        try:
            import winreg
            for root in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
                try:
                    with winreg.OpenKey(root, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe") as k:
                        cands.append(winreg.QueryValue(k, None))
                except OSError:
                    pass
        except Exception:
            pass
        for env in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA", "ProgramW6432"):
            base = os.environ.get(env)
            if base:
                cands.append(os.path.join(base, "Google", "Chrome", "Application", "chrome.exe"))
    elif sys.platform == "darwin":
        cands += ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", os.path.expanduser("~/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")]
    else:
        for n in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
            p = shutil.which(n)
            if p:
                cands.append(p)
    for c in cands:
        if c and os.path.exists(c):
            return c
    return None


def open_in_chrome(url):
    chrome = find_chrome()
    if chrome:
        try:
            subprocess.Popen([chrome, "--new-window", url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return "Google Chrome"
        except Exception:
            pass
    webbrowser.open(url)
    return "your default browser (Chrome not found, so install it from google.com/chrome)"


# ───────── system doctor: `python serve.py --doctor` in a terminal, GET /api/doctor from the page ─────────
# Read-only checks; nothing is changed, downloaded or installed. Each row: {name, ok: True / False / None (warning), detail}.
_doc = {"ts": 0, "rows": None}
_doc_lock = threading.Lock()
_doc_run = threading.Lock()  # one doctor run at a time: concurrent requests wait for it and share the result
def doctor(net=True, port=None, fetch=None):
    import hashlib
    rows = []
    def add(name, ok, detail=""): rows.append({"name": name, "ok": ok, "detail": str(detail)[:300]})
    add("Python", sys.version_info >= (3, 8), "%d.%d.%d" % tuple(sys.version_info[:3]) + ("" if sys.version_info >= (3, 8) else " (3.8 or newer needed)"))
    add("ExTerm version", True, VERSION)
    try:
        ok = APP.exists()
        add("App file", ok, ("%s (%d KB)" % (APP.name, APP.stat().st_size // 1024)) if ok else "exterm.html not found: run python build.py")
        sums = next((s for s in (APP.parent / "SHA256SUMS.txt", HERE / "dist" / "SHA256SUMS.txt") if s.exists()), None)
        if ok and sums:
            want = {}
            for line in sums.read_text(encoding="utf-8", errors="replace").splitlines():
                parts = line.split()
                if len(parts) == 2: want[parts[1].lstrip("*")] = parts[0].lower()  # 'hash *name' = binary-mode sha256sum line
            got = hashlib.sha256(APP.read_bytes()).hexdigest()
            if APP.name in want: add("App file checksum", got == want[APP.name], "matches SHA256SUMS.txt" if got == want[APP.name] else "does not match SHA256SUMS.txt: rebuild (python build.py) or re-download")
            else: add("App file checksum", None, "not listed in SHA256SUMS.txt")
        elif ok: add("App file checksum", None, "no SHA256SUMS.txt next to the app")
    except Exception as e:
        add("App file", False, e)
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        t = DATA_DIR / (".doctor-%d" % os.getpid()); t.write_text("ok", encoding="utf-8"); t.unlink()
        add("Data folder", True, "%s is writable" % DATA_DIR)
    except Exception as e:
        add("Data folder", False, "%s: %s" % (DATA_DIR, e))
    if port:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            busy = s.connect_ex(("127.0.0.1", port)) == 0
        add("Port %d" % port, None if busy else True, "in use (ExTerm may already be running; it picks the next free port)" if busy else "free")
    try:
        c = find_chrome(); add("Google Chrome", True if c else None, c or "not found: your default browser will be used")
    except Exception as e:
        add("Google Chrome", None, e)
    up = ollama_up(); add("Local AI (Ollama, optional)", True if up else None, "running" if up else "not running (only needed for the offline Copilot)")
    if net:
        for name, url in (("Coinbase (crypto prices)", "https://api.exchange.coinbase.com/products/BTC-USD/ticker"),
                          ("Yahoo Finance (stocks)", "https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=1d&interval=1d"),
                          ("DexScreener (DEX tokens)", "https://api.dexscreener.com/latest/dex/search?q=SOL")):
            t0 = time.time()
            try:
                if fetch: fetch(url)
                else:
                    with OPENER.open(urllib.request.Request(url, headers={"User-Agent": "ExTerm-doctor"}), timeout=6) as r: r.read(2048)
                add(name, True, "reachable in %d ms" % ((time.time() - t0) * 1000))
            except urllib.error.HTTPError as e:
                add(name, None if e.code in (403, 429) else False, "answered HTTP %d" % e.code)
            except Exception as e:
                add(name, False, "unreachable: %s" % str(e)[:80])
        if "--no-update-check" in sys.argv:
            add("Update check", None, "off (--no-update-check)")
        else:
            u = update_info(fetch=(lambda _u: fetch(_u)) if fetch else None)
            if u.get("error"): add("Update check", None, "could not reach GitHub: %s" % u["error"])
            elif u.get("newer"): add("Update check", None, "ExTerm %s is out (you have %s): %s" % (u["latest"], u["current"], u["url"]))
            else: add("Update check", True, ("you have the latest release (%s)" % VERSION) if u.get("latest") else "no published release found")
    return rows
def integrity():
    """SHA-256 of the shipped files on disk vs SHA256SUMS.txt (dist/ or next to this file). LF-normalised for serve.py,
    exactly as build.py hashes it. Relative names only: no paths leave this function."""
    sums_file = next((c for c in (HERE / "dist" / "SHA256SUMS.txt", HERE / "SHA256SUMS.txt") if c.exists()), None)
    want = {}
    if sums_file:
        for ln in sums_file.read_text(encoding="utf-8", errors="replace").splitlines():
            m = re.match(r"^([0-9a-f]{64})\s+\*?([\w./-]{1,80})$", ln.strip())
            if m: want[m.group(2).replace("dist/", "")] = m.group(1)
    rows = []
    for name, path, lf in (("exterm.html", APP, False), ("serve.py", pathlib.Path(__file__).resolve(), True)):
        try:
            b = path.read_bytes()
            if lf: b = b.replace(b"\r\n", b"\n")
            sha = hashlib.sha256(b).hexdigest()
        except Exception as e:
            rows.append({"name": name, "ok": False, "why": "unreadable"}); continue
        exp = want.get(name)
        rows.append({"name": name, "sha": sha, "expected": exp, "ok": exp == sha, "why": "" if exp == sha else ("not listed in SHA256SUMS.txt" if not exp else "hash differs from SHA256SUMS.txt")})
    return {"sums": bool(sums_file), "files": rows}

def doctor_cached(net=True):
    with _doc_run:
        with _doc_lock:
            if _doc["rows"] is not None and time.time() - _doc["ts"] < 30: return _doc["rows"]
        rows = doctor(net=net)
        with _doc_lock: _doc.update(ts=time.time(), rows=rows)
        return rows
def run_doctor():
    enc = sys.stdout.encoding or "utf-8"
    out = lambda s: print(str(s).encode(enc, "replace").decode(enc, "replace"))
    out("ExTerm System Doctor %s" % VERSION)
    rows = doctor(net="--offline" not in sys.argv, port=PORT)
    for r in rows: out("  %s %-30s %s" % ({True: "[ ok ]", False: "[FAIL]", None: "[warn]"}[r["ok"]], r["name"], r["detail"]))
    bad = [r for r in rows if r["ok"] is False]
    out(("\n%d problem(s) found." % len(bad)) if bad else "\nAll required checks passed.")
    return 1 if bad else 0


def pair_url():
    """--lan: the URL a phone opens (Tailscale address first: its traffic is WireGuard-encrypted end to end)."""
    ips = OPS.lan_ips() if OPS is not None else []
    return "http://%s:%d/?pair=%s" % (ips[0] if ips else "127.0.0.1", PORT, PAIR)

def free_port(start):
    for p in range(start, start + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", p)) != 0:
                return p
    return start


if __name__ == "__main__":
    if "--doctor" in sys.argv:
        sys.exit(run_doctor())
    PORT = free_port(PORT)
    if LAN or DAEMON:
        import exterm_ops as OPS
    # --lan listens on every interface (phones pair with a per-launch secret); EXTERM_BIND=0.0.0.0 is for Docker, where the
    # compose file publishes the port on the host's 127.0.0.1 only and the Host-header check still admits loopback names only
    bind = "0.0.0.0" if LAN or os.environ.get("EXTERM_BIND") == "0.0.0.0" else "127.0.0.1"
    srv = http.server.ThreadingHTTPServer((bind, PORT), H)
    if not (os.environ.get("EXTERM_DATA") or os.environ.get("NOVATERM_DATA")) and migrate_data_dir():
        print("Moved your saved data from %s to %s" % (OLD_DATA_DIR, DATA_DIR))
    if "--no-alerts" not in sys.argv:
        ALERTS = Alerts()
        threading.Thread(target=ALERTS.run, daemon=True).start()
    if "--no-state" not in sys.argv:
        STATE = StateStore()
    if DAEMON:  # the 24/7 loops run in three supervised processes; this process serves the UI and edits bot configs
        SUP = OPS.Supervisor(DATA_DIR)
        threading.Thread(target=SUP.run, daemon=True, name="watchdog").start()
        BOTS = OPS.shared_bots_class(sys.modules[__name__])(notify=None)
        _cmd_db = OPS.db(DATA_DIR); _cmd_lock = threading.Lock()
        def _cmd(cmd, arg):
            with _cmd_lock: OPS.command(_cmd_db, cmd, arg)
        BOTS.cmd = _cmd
        print("24/7 daemon: ingest · bots (10-gate risk firewall) · webhook dispatcher  (data: %s)" % DATA_DIR)
    elif "--no-bots" not in sys.argv:
        BOTS = BgBots(notify=(ALERTS.send if ALERTS else None))
        threading.Thread(target=BOTS.run, daemon=True).start()
    if DAEMON:
        pass  # the ingest process owns the price feed
    elif "--no-feed" not in sys.argv:  # keeps running with no browser open: bots' and alerts' symbols are always watched
        FEED = PriceFeed(extra=lambda: [a.get("sym") for a in list(ALERTS.alerts if ALERTS else []) if a.get("active")] + [b.get("sym") for b in list(BOTS.bots if BOTS else []) if b.get("active")])
        threading.Thread(target=FEED.run, daemon=True, name="feed").start()
    if "--no-intel" not in sys.argv and "--offline" not in sys.argv:
        INTEL = WorldMonitor(on_critical=on_critical)
        threading.Thread(target=INTEL.run, daemon=True, name="intel").start()
    if "--no-leaderboards" not in sys.argv:
        HL = HLCache(offline="--offline" in sys.argv)
    if "--no-llm-signal" not in sys.argv:
        LLM = LlmBridge()
    if "--no-lanes" not in sys.argv:
        LANES = Lanes()
    if "--no-fastlanes" not in sys.argv:  # v17.8: Lanes 5–8 start warming now, before the first browser request
        for _ln in FAST_LANE_IDS: FAST[_ln] = FastLane(_ln, offline="--offline" in sys.argv, data_dir=DATA_DIR)
        def _journal_fwd():  # v17.9: the personal journal feeds Lane 16's correlator
            while True:
                try:
                    if STATE is not None and 16 in FAST: FAST[16].feed("journal", {"rows": (STATE.public(True).get("journal") or [])[-500:]})
                except Exception: pass
                time.sleep(30)
        threading.Thread(target=_journal_fwd, daemon=True, name="journal-fwd").start()
    if FEED is not None:
        if ALERTS:
            _slow = ALERTS.fetch
            ALERTS.fetch = lambda sym: FEED.price(sym) or _slow(sym)  # fresh cached price first, direct call as fallback
    url = f"http://localhost:{PORT}"
    print(f"ExTerm running at {url}  (keep this window open · Ctrl+C to stop)")
    if LAN:
        PAIR = secrets.token_urlsafe(18)
        pu = pair_url()
        print("\nPhone pairing (same Wi-Fi or Tailscale): scan this QR code, or open " + pu)
        try: print(OPS.qr_ascii(pu))
        except UnicodeEncodeError: print("(this console can't draw the QR code: open %s/pair.svg on this computer)" % url)
        print("Plain HTTP on your network: prefer Tailscale (encrypted). The pairing secret changes every launch.\n")
    if not NO_BROWSER:
        print("Opening in " + open_in_chrome(url))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")
