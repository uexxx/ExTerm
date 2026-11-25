#!/usr/bin/env python3
# Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited.
"""grok_exterm_bridge.py: a token-authenticated local bridge between xAI Grok and ExTerm's Lane 18 risk firewall.

  python grok_exterm_bridge.py --exterm http://127.0.0.1:8765 --exterm-token <token> [--port 8790] [--mock]

* Listens on 127.0.0.1 only. Every request needs the header  X-Bridge-Token: <token>  (printed at start, or EXTERM_BRIDGE_TOKEN).
* Reads XAI_API_KEY from the environment (never from a file, never logged). XAI_MODEL overrides the model (default grok-4).
* POST /signal {"sym": "BTC-USD", "context": "...", "equity": 10000}: Grok proposes ONE trade as strict JSON; the bridge then
  runs it through ExTerm Lane 18 (/api/lane18/check). The answer is advice for PAPER mode. The bridge never places orders and
  never arms anything: LIVE stays behind ExTerm's PIN gate and 5-step wizard.
* GET /health: version, mode (always PAPER here), whether a key is present, whether ExTerm answers.
* GET /evo (v18.2): the Lane 21 Auto-Evolution books (Stocks EVO / Crypto-DEX EVO). Every /signal adds the symbol's book
  parameters to the Grok context and returns them; they are drift-locked inside the Lane 18 bounds and read-only here.
* --mock: no xAI call; a deterministic proposal (for tests and offline use).
Standard library only."""
import hashlib, hmac, http.server, json, os, re, secrets, sys, time, urllib.error, urllib.request

VERSION = "18.2"
XAI_URL = "https://api.x.ai/v1/chat/completions"
SYMBOL = re.compile(r"^(oc:[a-z0-9_-]{2,30}:[A-Za-z0-9]{20,90}|[A-Z0-9]{2,12}-(USD|USDT|USDC|EUR)|[A-Z^][A-Z0-9.^=-]{0,11})$")
PROMPT = ("You are a risk-aware trading assistant inside ExTerm. Propose at most ONE trade for the symbol as strict JSON only: "
          '{"side":"buy|sell|none","usd":number,"px":number,"atr":number,"winp":0..1,"payoff":number,"why":"short reason"}. '
          "Use side none when there is no edge. No prose outside the JSON.")

def arg(name, default=None):
    if name in sys.argv:
        i = sys.argv.index(name)
        if i + 1 < len(sys.argv): return sys.argv[i + 1]
    return default

CFG = {"port": int(arg("--port", os.environ.get("EXTERM_BRIDGE_PORT", "8790"))), "exterm": arg("--exterm", os.environ.get("EXTERM_URL", "http://127.0.0.1:8765")).rstrip("/"),
       "xtoken": arg("--exterm-token", os.environ.get("EXTERM_TOKEN", "")), "token": os.environ.get("EXTERM_BRIDGE_TOKEN") or secrets.token_urlsafe(24),
       "mock": "--mock" in sys.argv, "model": os.environ.get("XAI_MODEL", "grok-4")}

def parse_proposal(text):
    """first JSON object in the model's answer → a sanitised proposal (numbers only, side in buy / sell / none)"""
    m = re.search(r"\{.*\}", text or "", re.S)
    if not m: raise ValueError("no JSON in the model answer")
    j = json.loads(m.group(0)); num = lambda k, d=0.0: float(j.get(k, d)) if isinstance(j.get(k, d), (int, float)) and j.get(k, d) == j.get(k, d) else d
    side = j.get("side") if j.get("side") in ("buy", "sell", "none") else "none"
    return {"side": side, "usd": max(0.0, min(1e7, num("usd"))), "px": max(0.0, num("px")), "atr": max(0.0, num("atr")), "winp": max(0.0, min(1.0, num("winp", 0.5))), "payoff": max(0.0, min(20.0, num("payoff", 2.0))), "why": str(j.get("why", ""))[:300]}

def ask_grok(sym, context):
    if CFG["mock"]: return {"side": "buy", "usd": 500.0, "px": 100.0, "atr": 1.5, "winp": 0.55, "payoff": 2.0, "why": "mock proposal (no xAI call)"}
    key = os.environ.get("XAI_API_KEY", "")
    if not key: raise PermissionError("XAI_API_KEY is not set")
    body = {"model": CFG["model"], "temperature": 0.2, "messages": [{"role": "system", "content": PROMPT}, {"role": "user", "content": "Symbol: %s\nContext: %s" % (sym, str(context)[:4000])}]}
    req = urllib.request.Request(XAI_URL, data=json.dumps(body).encode(), headers={"Authorization": "Bearer " + key, "Content-Type": "application/json", "User-Agent": "ExTerm-Grok-Bridge/" + VERSION}, method="POST")
    with urllib.request.urlopen(req, timeout=60) as r: j = json.loads(r.read(4_000_000))
    return parse_proposal(((j.get("choices") or [{}])[0].get("message") or {}).get("content", ""))

def evo_status():
    """v18.2: Lane 21 Auto-Evolution books (Stocks EVO / Crypto-DEX EVO): read-only, drift-locked inside the Lane 18 bounds"""
    req = urllib.request.Request(CFG["exterm"] + "/api/lane21/status", headers={"X-ExTerm": CFG["xtoken"]})
    with urllib.request.urlopen(req, timeout=3) as r: return json.loads(r.read(1_000_000)).get("out") or {}

def evo_book(sym):
    return "crypto" if sym.startswith("oc:") or "-" in sym else "stocks"

def firewall(sym, prop, equity):
    """Lane 18 pre-trade check on the ExTerm launcher (PAPER unless the user armed LIVE there with the PIN)"""
    body = {"sym": sym, "usd": prop["usd"], "px": prop["px"], "atr": prop["atr"], "winp": prop["winp"], "payoff": prop["payoff"], "equity": equity}
    req = urllib.request.Request(CFG["exterm"] + "/api/lane18/check", data=json.dumps(body).encode(), headers={"X-ExTerm": CFG["xtoken"], "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=5) as r: return json.loads(r.read(1_000_000)).get("out")

class Bridge(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, obj):
        b = json.dumps(obj).encode(); self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Cache-Control", "no-store"); self.send_header("X-Content-Type-Options", "nosniff"); self.end_headers(); self.wfile.write(b)
    def _auth(self):
        if self.client_address[0] not in ("127.0.0.1", "::1"): self._send(403, {"error": "loopback only"}); return False
        if self.headers.get("Origin"): self._send(403, {"error": "browser cross-origin requests are refused"}); return False
        if not hmac.compare_digest(self.headers.get("X-Bridge-Token") or "", CFG["token"]): self._send(401, {"error": "missing or wrong X-Bridge-Token"}); return False
        return True
    def do_GET(self):
        if not self._auth(): return
        if self.path == "/evo":  # v18.2: the evolved parameters Grok is told to respect (read-only)
            try: return self._send(200, {"evo": evo_status(), "mode": "PAPER", "places_orders": False})
            except Exception as e: return self._send(502, {"error": "ExTerm Lane 21 unavailable: %s" % str(e)[:120]})
        if self.path != "/health": return self._send(404, {"error": "not found"})
        up = False
        try: up = urllib.request.urlopen(urllib.request.Request(CFG["exterm"] + "/api/lane18/status", headers={"X-ExTerm": CFG["xtoken"]}), timeout=3).status == 200
        except Exception: up = False
        self._send(200, {"version": VERSION, "mode": "PAPER", "places_orders": False, "xai_key": bool(os.environ.get("XAI_API_KEY")), "mock": CFG["mock"], "model": CFG["model"], "exterm": up})
    def do_POST(self):
        if not self._auth(): return
        if self.path != "/signal": return self._send(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n > 16384: return self._send(413, {"error": "request too large"})
            j = json.loads(self.rfile.read(n) or b"{}"); sym = str(j.get("sym", ""))[:120]
            if not SYMBOL.match(sym): return self._send(400, {"error": "unsupported symbol"})
            book = evo_book(sym); evo = None
            try: evo = (evo_status() or {}).get(book)
            except Exception: evo = None
            ctx = str(j.get("context", ""))[:3500] + ("\nExTerm %s EVO v%s parameters (respect them): %s" % (book, evo.get("ver"), json.dumps(evo.get("params"))) if evo else "")
            prop = ask_grok(sym, ctx)
            if prop["side"] == "none" or not prop["usd"] > 0: return self._send(200, {"sym": sym, "proposal": prop, "verdict": "NO-TRADE", "evo": {"book": book, "ver": evo and evo.get("ver")}, "mode": "PAPER", "places_orders": False})
            fw = firewall(sym, prop, float(j.get("equity") or 10000))
            digest = hashlib.sha256(json.dumps({"sym": sym, "p": prop, "fw": fw.get("verdict")}, sort_keys=True).encode()).hexdigest()
            self._send(200, {"sym": sym, "proposal": prop, "firewall": fw, "verdict": fw.get("verdict"), "evo": {"book": book, "ver": evo and evo.get("ver"), "params": evo and evo.get("params")}, "mode": "PAPER", "places_orders": False, "sha256": digest, "ts": time.time()})
        except PermissionError as e: self._send(503, {"error": str(e)})
        except urllib.error.HTTPError as e: self._send(502, {"error": "upstream HTTP %d" % e.code})
        except Exception as e: self._send(400, {"error": str(e)[:200]})

def main():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", CFG["port"]), Bridge)
    print("ExTerm Grok bridge v%s on http://127.0.0.1:%d  (PAPER only · places no orders)" % (VERSION, CFG["port"]))
    print("X-Bridge-Token: " + CFG["token"])
    if not os.environ.get("XAI_API_KEY") and not CFG["mock"]: print("XAI_API_KEY is not set: /signal will answer 503 until it is (or run with --mock).")
    try: srv.serve_forever()
    except KeyboardInterrupt: print("bye")

if __name__ == "__main__":
    main()
