# ExTerm v16.1 launcher test: the /hook webhook gateway forwards only to 127.0.0.1 / localhost (never the launcher's own
# port) or to a private-LAN host:port allow-listed over https in EXTERM_HOOK_ALLOW; third-party bot services are refused.
import os, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
sys.argv = ["serve.py", "8765", "--no-browser"]
import serve
res = []
def ok(n, c, i=""): res.append(("PASS " if c else "FAIL ") + n + ("" if c or not i else " - " + str(i)[:200]))
good = ["http://127.0.0.1:8766/hook", "https://localhost:9443/x", "http://[::1]:9000/", "http://localhost:18765/signal"]
ok("loopback bot endpoints are accepted", all(serve.hook_target_ok(u) for u in good), [u for u in good if not serve.hook_target_ok(u)])
bad = ["https://bot-service.example/signal", "https://relay.example.net/x", "https://example.com/hook", "http://127.0.0.1:8765/api/state",
       "http://user:pw@127.0.0.1:9000/", "ftp://127.0.0.1/", "http://169.254.169.254/latest", "http://127.0.0.1.nip.io/", "http://localhost.evil.com/",
       "https://192.168.1.20:8443/x", "javascript:alert(1)", "", "http://127.0.0.1:99999/"]
ok("third-party services, the launcher's own port, credentials, metadata IPs, look-alikes and non-allow-listed LAN hosts are refused",
   not any(serve.hook_target_ok(u) for u in bad), [u for u in bad if serve.hook_target_ok(u)])
os.environ["EXTERM_HOOK_ALLOW"] = "192.168.1.20:8443, 8.8.8.8:443, evil.com:80"
ok("an allow-listed private-LAN host:port passes over https only", serve.hook_target_ok("https://192.168.1.20:8443/x") and not serve.hook_target_ok("http://192.168.1.20:8443/x") and not serve.hook_target_ok("https://192.168.1.20:8444/x"))
ok("public IPs and hostnames in the allowlist are ignored", not serve.hook_target_ok("https://8.8.8.8:443/") and not serve.hook_target_ok("https://evil.com:80/"))
del os.environ["EXTERM_HOOK_ALLOW"]
ok("launcher version is 16.1", serve.VERSION == "16.1")
ok("legacy bot-domain allowlists are gone", not hasattr(serve, "HOOK_ALLOW") and not hasattr(serve, "HOOK_SUFFIX"))
print("\n".join(res)); fl = sum(r.startswith("FAIL") for r in res); print(f"\n{len(res) - fl}/{len(res)} passed"); sys.exit(1 if fl else 0)
