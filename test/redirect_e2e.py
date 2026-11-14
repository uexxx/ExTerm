#!/usr/bin/env python3
"""End-to-end test of the local proxy's redirect protection (finding #4 / local-proxy:redirect-follow-ssrf).
Runs the real serve.py request handler and its real SafeRedirect against a local HTTPS server that tries to
bounce the proxy to a host that isn't allow-listed, to plain http, and through a chain of redirects.
Loopback only: no external network. Usage: python3 test/redirect_e2e.py"""
import http.client, http.server, importlib.util, os, pathlib, ssl, subprocess, sys, tempfile, threading, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.argv = ["serve.py", "0", "--no-browser"]
spec = importlib.util.spec_from_file_location("serve", ROOT / "serve.py"); serve = importlib.util.module_from_spec(spec); spec.loader.exec_module(serve)

tmp = tempfile.mkdtemp(); cert, key = os.path.join(tmp, "c.pem"), os.path.join(tmp, "k.pem")
import shutil
OPENSSL = shutil.which("openssl") or next((p for p in (r"C:\Program Files\Git\usr\bin\openssl.exe", r"C:\Program Files\Git\mingw64\bin\openssl.exe") if os.path.exists(p)), None)
if not OPENSSL: sys.exit("FAIL openssl not found (needed to mint a throwaway localhost cert)")
subprocess.run([OPENSSL, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1", "-keyout", key, "-out", cert], check=True, capture_output=True)

HITS = {"/secret": 0, "/data": 0}
class Up(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        p = self.path; base = f"https://localhost:{UP}"
        routes = {"/redir-ok": base + "/data", "/redir-evil": f"https://127.0.0.1:{UP}/secret", "/redir-http": f"http://localhost:{UP}/data",
                  "/chain1": base + "/chain2", "/chain2": base + "/redir-evil", "/redir-meta": "https://169.254.169.254/latest/meta-data/"}
        if p in routes:
            self.send_response(302); self.send_header("Location", routes[p]); self.end_headers(); return
        if p in HITS: HITS[p] += 1
        body = b"SECRET" if p == "/secret" else b"ok"
        self.send_response(200); self.send_header("Content-Type", "text/plain"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

up = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Up); UP = up.server_address[1]
sctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); sctx.load_cert_chain(cert, key); up.socket = sctx.wrap_socket(up.socket, server_side=True)
threading.Thread(target=up.serve_forever, daemon=True).start()

# the proxy under test: real handler + real SafeRedirect; only the trust store and allow-list are adjusted for the test host
serve.ALLOW = set(serve.ALLOW) | {"localhost"}
assert not serve.host_allowed("127.0.0.1") and not serve.host_allowed("169.254.169.254")
serve.OPENER = urllib.request.build_opener(serve.SafeRedirect(), urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=cert)))
px = http.server.ThreadingHTTPServer(("127.0.0.1", 0), serve.H); serve.PORT = px.server_address[1]
threading.Thread(target=px.serve_forever, daemon=True).start()

def call(u, token=True, host=None, origin=None):
    c = http.client.HTTPConnection("127.0.0.1", serve.PORT, timeout=20)
    h = {"Host": host or f"localhost:{serve.PORT}"}
    if token: h["X-ExTerm"] = serve.TOKEN
    if origin: h["Origin"] = origin
    c.request("GET", "/proxy?u=" + urllib.parse.quote(u, safe=""), headers=h); r = c.getresponse(); b = r.read(); c.close(); return r.status, b

passed, failed = 0, 0
def check(name, cond, info=""):
    global passed, failed
    print(("PASS " if cond else "FAIL ") + name + (f" — {info}" if info and not cond else "")); passed += cond; failed += (not cond)

B = f"https://localhost:{UP}"
s, b = call(B + "/data"); check("baseline: allow-listed https host is proxied", s == 200 and b == b"ok", f"{s} {b[:40]}")
s, b = call(B + "/redir-ok"); check("redirect that stays on the allow-list is followed", s == 200 and b == b"ok", f"{s} {b[:40]}")
s, b = call(B + "/redir-evil"); check("redirect to a non-allow-listed host is blocked (403)", s == 403 and b"SECRET" not in b, f"{s} {b[:60]}")
s, b = call(B + "/redir-http"); check("redirect that downgrades to plain http is blocked", s == 403, f"{s} {b[:60]}")
s, b = call(B + "/chain1"); check("multi-hop chain ending off the list is blocked", s == 403 and b"SECRET" not in b, f"{s} {b[:60]}")
s, b = call(B + "/redir-meta"); check("redirect to a cloud-metadata address is blocked", s == 403, f"{s} {b[:60]}")
check("the forbidden upstream was never contacted", HITS["/secret"] == 0, str(HITS))
s, b = call(f"https://127.0.0.1:{UP}/secret"); check("direct request to a non-allow-listed host is refused", s == 403 and HITS["/secret"] == 0, f"{s}")
s, b = call(B + "/data", token=False); check("missing session token is refused", s == 403, f"{s}")
s, b = call(B + "/data", origin="https://evil.example"); check("foreign Origin is refused", s == 403, f"{s}")
s, b = call(B + "/data", host="evil.example:80"); check("foreign Host (DNS rebinding) is refused (421)", s == 421, f"{s}")
print(f"{passed}/{passed + failed}"); up.shutdown(); px.shutdown(); sys.exit(1 if failed else 0)
