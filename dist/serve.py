#!/usr/bin/env python3
# Copyright (c) 2026 ExTerm Labs (@exterm.labs) · Licensed under GNU AGPL-3.0 · https://github.com/uexxx/ExTerm
"""ExTerm launcher: serves the app at http://localhost:8765 and provides a small
CORS proxy (/proxy?u=...) for the public market-data APIs, in case your browser blocks
direct requests. Standard library only. Usage:  python3 serve.py [port]   ·   health check:  python3 serve.py --doctor [--offline]"""
import http.server, hashlib, json, time, os, pathlib, shutil, socket, ssl, subprocess, sys, urllib.parse, urllib.request, webbrowser

ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
PORT = int(ARGS[0]) if ARGS else 8765
NO_BROWSER = "--no-browser" in sys.argv
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
    "api.mainnet-beta.solana.com", "solana-rpc.publicnode.com", "solana.drpc.org", "solana.api.onfinality.io", "api.dexscreener.com", "api.geckoterminal.com", "api.binance.com", "testnet.binance.vision", "api.bybit.com", "api.hyperliquid.xyz", "www.okx.com", "api-testnet.bybit.com", "api.alpaca.markets", "paper-api.alpaca.markets", "data.alpaca.markets", "api.x.com", "api.twitter.com", "api.stocktwits.com", "www.reddit.com",
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
import secrets, hmac as _hmac, threading, re
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

class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Notifications and the local-model bridge never follow redirects (a redirect could point anywhere)."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(newurl, code, "redirects are not followed", headers, fp)

NOTIFY_OPENER = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPSHandler(context=CTX))
LOCAL_OPENER = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPHandler())

VERSION = "16.3"
STARTED = time.time()
CACHE_STATS = {"hits": 0, "total": 0}  # /api/feed symbols answered from RAM vs asked for (Grok telemetry strip)
OLD_DATA_DIR = pathlib.Path.home() / ".novaterm"  # pre-v15 name, moved to ~/.exterm on first start
DATA_DIR = pathlib.Path(os.environ.get("EXTERM_DATA") or os.environ.get("NOVATERM_DATA") or (pathlib.Path.home() / ".exterm"))

def migrate_data_dir(old=None, new=None):
    """Move ~/.novaterm to ~/.exterm once, so saved alerts, bots and state survive the rename. Never overwrites."""
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
            j = self._get_json("https://api.geckoterminal.com/api/v2/networks/%s/pools/%s/ohlcv/%s?aggregate=%d&limit=300&currency=usd" % (urllib.parse.quote(chain), urllib.parse.quote(pool), unit, agg))
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
UPDATE_REPO = "uexxx/novaterm-pioneering-trading-terminals"
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


class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *a):
        pass

    def _send(self, code, body, ctype="application/json"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        for k, v in SEC_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _local_ok(self):
        """Security: reject DNS-rebinding (foreign Host) and cross-site requests (foreign Origin)."""
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0].strip("[]").lower()
        if host not in ("localhost", "127.0.0.1", "::1"):
            self._send(421, b"misdirected request", "text/plain"); return False
        origin = self.headers.get("Origin")
        ou = urllib.parse.urlparse(origin) if origin else None
        if origin and not (ou.scheme == "http" and ou.hostname in ("localhost", "127.0.0.1", "::1") and ou.port == PORT):
            self._send(403, b'{"error":"cross-origin request blocked"}'); return False
        return True

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
                return self._send(200, json.dumps({"version": VERSION, "alerts": ALERTS is not None, "bots": BOTS is not None, "ollama": ollama_up(), "state": STATE is not None, "feed": FEED is not None, "intel": INTEL is not None, "update": "--no-update-check" not in sys.argv}).encode())
            if p == "/api/update" and method == "GET":
                if "--no-update-check" in sys.argv: return self._send(503, b'{"error":"update check is off"}')
                return self._send(200, json.dumps(update_info()).encode())
            if p == "/api/health" and method == "GET":  # Grok telemetry strip: uptime, RAM cache hit rate, bot heartbeats (read-only, no secrets)
                bots = BOTS.public()["bots"] if BOTS is not None else []
                return self._send(200, json.dumps({"version": VERSION, "uptime": int(time.time() - STARTED), "cache": dict(CACHE_STATS), "polls": FEED.polls if FEED is not None else 0,
                                                   "bots": {"total": len(bots), "active": sum(1 for b in bots if b.get("active")), "lastBar": max([b.get("lastBar") or 0 for b in bots] or [0])}}).encode())
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
            req = urllib.request.Request(url, data=data, headers=hdr, method=method)
            with OPENER.open(req, timeout=30) as r:
                body = r.read(MAX_BYTES + 1)
                if len(body) > MAX_BYTES:
                    return self._send(502, b'{"error":"upstream response too large"}')
                self._send(r.status, body, r.headers.get("Content-Type", "application/json"))
        except urllib.error.HTTPError as e:
            self._send(e.code, (e.read(MAX_BYTES) if e.fp else b"") or json.dumps({"error": str(e.reason)}).encode())
        except Exception as e:
            self._send(502, json.dumps({"error": str(e)}).encode())

    def do_GET(self):
        if not self._local_ok():
            return
        p = urllib.parse.urlparse(self.path).path
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

    def do_POST(self):
        if not self._local_ok():
            return
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
MANIFEST = json.dumps({"name": "ExTerm", "short_name": "ExTerm", "start_url": "/", "scope": "/", "display": "standalone", "background_color": "#05060e", "theme_color": "#05060e",
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
  if (/^\\/(api|proxy|ollama|hook)(\\/|$|\\?)/.test(u.pathname)) return;
  if (e.request.mode === 'navigate' || u.pathname === '/' || /\\.(png|webmanifest)$/.test(u.pathname)) {
    e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(C).then((c) => c.put(e.request, cp)); } return r; }).catch(() => caches.match(e.request).then((m) => m || new Response('ExTerm is offline: start the launcher again.', { status: 503, headers: { 'Content-Type': 'text/plain' } }))));
  }
});
"""
ICON_SVG = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#0b0d1a"/><path d="M150 380V132l212 248V132" fill="none" stroke="#8b5cf6" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/></svg>'

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
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H)
    if not (os.environ.get("EXTERM_DATA") or os.environ.get("NOVATERM_DATA")) and migrate_data_dir():
        print("Moved your saved data from %s to %s" % (OLD_DATA_DIR, DATA_DIR))
    if "--no-alerts" not in sys.argv:
        ALERTS = Alerts()
        threading.Thread(target=ALERTS.run, daemon=True).start()
    if "--no-state" not in sys.argv:
        STATE = StateStore()
    if "--no-bots" not in sys.argv:
        BOTS = BgBots(notify=(ALERTS.send if ALERTS else None))
        threading.Thread(target=BOTS.run, daemon=True).start()
    if "--no-feed" not in sys.argv:  # keeps running with no browser open: bots' and alerts' symbols are always watched
        FEED = PriceFeed(extra=lambda: [a.get("sym") for a in list(ALERTS.alerts if ALERTS else []) if a.get("active")] + [b.get("sym") for b in list(BOTS.bots if BOTS else []) if b.get("active")])
        threading.Thread(target=FEED.run, daemon=True, name="feed").start()
    if "--no-intel" not in sys.argv and "--offline" not in sys.argv:
        INTEL = WorldMonitor(on_critical=on_critical)
        threading.Thread(target=INTEL.run, daemon=True, name="intel").start()
    if "--no-leaderboards" not in sys.argv:
        HL = HLCache(offline="--offline" in sys.argv)
    if FEED is not None:
        if ALERTS:
            _slow = ALERTS.fetch
            ALERTS.fetch = lambda sym: FEED.price(sym) or _slow(sym)  # fresh cached price first, direct call as fallback
    url = f"http://localhost:{PORT}"
    print(f"ExTerm running at {url}  (keep this window open · Ctrl+C to stop)")
    if not NO_BROWSER:
        print("Opening in " + open_in_chrome(url))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")
