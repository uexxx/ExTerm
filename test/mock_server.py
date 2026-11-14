#!/usr/bin/env python3
"""Mock Solana JSON-RPC (single + batch), DexScreener and SEC EDGAR endpoints for end-to-end tests."""
import http.server, json, time, re, sys
T0 = time.time()
WALLETS = json.load(open(sys.argv[1], encoding='utf-8'))
ADDRS = [w["trackedWalletAddress"] for w in WALLETS]
MINTS = ["MockMint%02dxxxxxxxxxxxxxxxxxxxxxxxxxxxxxpump" % i for i in range(6)]
POOL, PUMP = "PooL1111111111111111111111111111111111111111", "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
def count(addr):  # first 30 wallets trade every ~6 s
    i = ADDRS.index(addr) if addr in ADDRS else 999
    return int((time.time() - T0) / 6) + 1 if i < 30 else 1
def sig(addr, n): return f"sig_{ADDRS.index(addr)}_{n}"
def tx(s):
    m = re.match(r"sig_(\d+)_(\d+)", s); i, n = int(m.group(1)), int(m.group(2)); w = ADDRS[i]; mint = MINTS[(i + n) % 3 if n % 2 == 0 else (i + n - 1) % 3]
    buy = n % 2 == 0; lam = 1_500_000_000 if buy else 1_800_000_000
    pre = [10_000_000_000, 0, 1]; post = [pre[0] - lam - 5000 if buy else pre[0] + lam - 5000, 0, 1]
    tb = lambda amt: {"mint": mint, "owner": w, "uiTokenAmount": {"uiAmountString": str(amt), "decimals": 6}}
    return {"blockTime": int(time.time()), "transaction": {"message": {"accountKeys": [{"pubkey": w}, {"pubkey": POOL}, {"pubkey": PUMP}]}},
            "meta": {"err": None, "fee": 5000, "preBalances": pre, "postBalances": post,
                     "preTokenBalances": [] if buy else [tb(1000)], "postTokenBalances": [tb(1000)] if buy else [tb(0)]}}
def call(method, params):
    if method == "getSlot": return 300000000
    if method == "getSignaturesForAddress":
        a, o = params[0], (params[1] if len(params) > 1 else {}); n = count(a); lim = o.get("limit", 10); until = o.get("until")
        out = []
        for k in range(n, 0, -1):
            s = sig(a, k)
            if s == until: break
            out.append({"signature": s, "blockTime": int(time.time()) - (n - k) * 6, "err": None})
            if len(out) >= lim: break
        return out
    if method == "getTransaction": return tx(params[0])
    if method == "getMultipleAccounts": return {"value": [{"lamports": (7 + i % 50) * 1_000_000_000} for i, _ in enumerate(params[0])]}
    if method == "getTokenAccountsByOwner":
        if params[1]["programId"].startswith("Tokenz"): return {"value": []}
        return {"value": [{"account": {"data": {"parsed": {"info": {"mint": m, "tokenAmount": {"uiAmountString": str(1000 * (k + 1)), "uiAmount": 1000 * (k + 1)}}}}}} for k, m in enumerate(MINTS[:3])]}
    raise KeyError(method)
F4 = """<?xml version="1.0"?><ownershipDocument><issuer><issuerCik>{cik}</issuerCik><issuerName>{name}</issuerName><issuerTradingSymbol>{tk}</issuerTradingSymbol></issuer>
<reportingOwner><reportingOwnerId><rptOwnerName>{who}</rptOwnerName></reportingOwnerId><reportingOwnerRelationship><isDirector>{dir}</isDirector><isOfficer>{off}</isOfficer><officerTitle>{title}</officerTitle></reportingOwnerRelationship></reportingOwner>
<nonDerivativeTable><nonDerivativeTransaction><securityTitle><value>Common Stock</value></securityTitle><transactionDate><value>{date}</value></transactionDate><transactionCoding><transactionCode>{code}</transactionCode></transactionCoding>
<transactionAmounts><transactionShares><value>{sh}</value></transactionShares><transactionPricePerShare><value>{px}</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>{ad}</value></transactionAcquiredDisposedCode></transactionAmounts>
<postTransactionAmounts><sharesOwnedFollowingTransaction><value>{after}</value></sharesOwnedFollowingTransaction></postTransactionAmounts></nonDerivativeTransaction></nonDerivativeTable></ownershipDocument>"""
CO = {"AAPL": (320193, "Apple Inc."), "NVDA": (1045810, "NVIDIA CORP"), "MSFT": (789019, "MICROSOFT CORP")}
PEOPLE = [("Cook Timothy D", "0", "1", "CEO", "S", 50000, 230.5), ("Levinson Arthur D", "1", "0", "", "P", 10000, 228.1), ("Wagner Susan", "1", "0", "", "P", 4000, 229.0)]
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*"); self.send_header("Access-Control-Allow-Headers", "*"); self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    def send(self, code, body, ct="application/json"):
        b = body if isinstance(body, bytes) else (body if isinstance(body, str) else json.dumps(body)).encode()
        self.send_response(code); self.cors(); self.send_header("Content-Type", ct); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_OPTIONS(self): self.send_response(204); self.cors(); self.end_headers()
    def do_POST(self):
        req = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)))
        one = lambda r: ({"jsonrpc": "2.0", "id": r["id"], "result": call(r["method"], r.get("params", []))})
        try: self.send(200, [one(r) for r in req] if isinstance(req, list) else one(req))
        except KeyError as e: self.send(200, {"jsonrpc": "2.0", "id": 1, "error": {"code": -32601, "message": "method not found " + str(e)}})
    def do_GET(self):
        p = self.path
        if p.startswith("/tokens/v1/solana/"):
            ids = p.split("/")[-1].split(",")
            return self.send(200, [{"chainId": "solana", "baseToken": {"address": m, "symbol": "MOCK" + m[8:10], "name": "Mock token " + m[8:10]}, "priceUsd": str(0.0001 * (1 + MINTS.index(m)) * (1 + 0.1 * ((time.time() // 5) % 3))), "marketCap": 250000 * (1 + MINTS.index(m)), "liquidity": {"usd": 50000}, "priceChange": {"h1": 12.5, "h24": 80}, "url": "https://dexscreener.com/solana/" + m} for m in ids if m in MINTS])
        if p.startswith("/files/company_tickers.json"):
            return self.send(200, {str(i): {"cik_str": c, "ticker": t, "title": n} for i, (t, (c, n)) in enumerate(CO.items())})
        m = re.match(r"/submissions/CIK(\d+)\.json", p)
        if m:
            cik = int(m.group(1)); acc = [f"{cik:010d}-25-{k:06d}" for k in range(1, 4)]
            return self.send(200, {"filings": {"recent": {"form": ["4", "10-Q", "4", "4"], "accessionNumber": [acc[0], "x", acc[1], acc[2]], "filingDate": ["2026-11-05", "2026-11-01", "2026-11-03", "2026-10-30"], "primaryDocument": [f"xslF345X05/f4_{k}.xml" for k in (0, 9, 1, 2)]}}})
        m = re.match(r"/Archives/edgar/data/(\d+)/(\d+)/(f4_(\d)|form4)\.xml", p)
        if m:
            cik = int(m.group(1)); k = int(m.group(4) or 1); tk = [t for t, (c, _) in CO.items() if c == cik][0]; who = PEOPLE[k % 3]
            return self.send(200, F4.format(cik=cik, name=CO[tk][1], tk=tk, who=who[0], dir=who[1], off=who[2], title=who[3], date="2026-11-0%d" % (5 - k), code=who[4], sh=who[5], px=who[6], ad="A" if who[4] == "P" else "D", after=who[5] * 9), "text/xml")
        m = re.match(r"/Archives/edgar/data/(\d+)/(\d+)/index\.json", p)
        if m: return self.send(200, {"directory": {"item": [{"name": "xslF345X05"}, {"name": "form4.xml"}]}})
        if p.startswith("/cgi-bin/browse-edgar"):
            ent = "".join(f'<entry><title>4 - {n}</title><link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/{c}/{c:010d}26{k:06d}/{c:010d}-26-{k:06d}-index.htm"/><updated>2026-11-06T16:00:00-05:00</updated></entry>' for k, (t, (c, n)) in enumerate(CO.items(), start=1))
            return self.send(200, f'<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">{ent}</feed>', "application/atom+xml")
        self.send(404, {"error": "not found " + p})
http.server.ThreadingHTTPServer(("127.0.0.1", 8899), H).serve_forever()
