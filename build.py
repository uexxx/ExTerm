#!/usr/bin/env python3
# Copyright (c) 2026 ExTerm Labs (@exterm.labs) · Licensed under GNU AGPL-3.0 · https://github.com/uexxx/ExTerm
"""Inline CSS + JS into one self-contained HTML file: dist/exterm.html"""
import pathlib
root = pathlib.Path(__file__).parent
src = root / "src"
html = (src / "index.html").read_text(encoding="utf-8")
css = (src / "style.css").read_text(encoding="utf-8")
order = ["disksync.js", "core.js", "strategies2.js", "stratspec.js", "strategies3.js", "strategies4.js", "validate.js", "data.js", "stocks.js", "solana.js", "dex.js", "sec.js", "keyvault.js", "onchain.js", "safety.js", "charts.js","indicators.js","orderflow.js","indpick.js","picker.js","fx3d.js", "themes.js", "app_a.js", "app_b.js", "builder.js", "app_d.js", "app_c.js","social.js","app_e.js","workspace.js","journal.js","challenge.js","copilot.js","replay.js","pro.js","localai.js","v12.js", "v13core.js", "v14core.js", "perps.js", "onchain2.js", "walletpro.js", "socialpro.js", "bgbots.js", "v13.js", "v14.js", "v15core.js", "v15p2core.js", "v15p2.js", "v15p3core.js", "grok.js", "world.js", "v15p4core.js", "v15p4.js", "v15p5core.js", "v15p5.js", "v151core.js", "v151.js", "i18n.js", "v152core.js", "v152.js", "v153core.js", "v153.js", "boot.js"]
js = "\n".join(f"/* ===== {n} ===== */\n" + (src / n).read_text(encoding="utf-8") for n in order if (src / n).exists())
wallets = (src / "wallets.json").read_text(encoding="utf-8")
import json as _json
worker_src = "\n".join((src / f).read_text(encoding="utf-8") for f in ("core.js", "strategies2.js", "stratspec.js", "strategies3.js", "strategies4.js", "validate.js", "v153core.js", "worker.js"))
js = "const WORKER_SRC = " + _json.dumps(worker_src) + ";\n" + js
js = "const DEFAULT_WALLETS = " + wallets.strip() + ";\n" + js
_community = []
for _f in sorted((root / "community" / "strategies").glob("*.json")):
    try:
        _community.append(_json.loads(_f.read_text(encoding="utf-8")))
    except Exception as _e:
        raise SystemExit("community strategy %s is not valid JSON: %s" % (_f.name, _e))
js = "const COMMUNITY_SPECS = " + _json.dumps(_community) + ";\n" + js
js = "const TOP_WALLETS = " + (src / "topwallets.json").read_text(encoding="utf-8").strip() + ";\n" + js
js = js.replace("</script", "<\\/script")
import sys, hashlib, base64, subprocess
HARDEN = "--harden" in sys.argv
if HARDEN:  # minify + mangle + strip comments with esbuild (raises the cost of copying/reverse-engineering; not a security boundary)
    def _min(code):
        r = subprocess.run(["node", "-e", "const e=require('/opt/npm-tools/node_modules/esbuild');let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=e.transformSync(s,{minify:true,format:'iife',legalComments:'none',target:'es2020'});process.stdout.write(o.code)})"], input=code, capture_output=True, text=True, encoding="utf-8")  # UTF-8 pipe: the Windows default codepage can't carry emoji
        if r.returncode: raise SystemExit("esbuild failed: " + r.stderr[:500])
        return r.stdout
    js = js.replace("typeof module === 'object'", 'false')  # browser bundle: drop Node/CommonJS branches so esbuild doesn't wrap them
    js = _min(js)
    js = js.replace("</script", "<\\/script")
# strict CSP: the one inline script is allowed by its exact SHA-256 hash; nothing else (no injected <script>, no inline handlers, no eval)
digest = base64.b64encode(hashlib.sha256(("\n" + js + "\n").encode("utf-8")).digest()).decode()  # exact text between <script> and </script>
html = html.replace("script-src 'self' 'unsafe-inline'", "script-src 'sha256-" + digest + "'")
out = html.replace("/*__CSS__*/", css).replace("/*__JS__*/", js)
dist = root / "dist"
dist.mkdir(exist_ok=True)
(dist / ("exterm.min.html" if HARDEN else "exterm.html")).write_bytes(out.encode("utf-8"))  # bytes: same file on Windows and Linux (no CRLF, no cp1252)
assert "script-src 'sha256-" in out and "default-src 'none'" in out, "CSP not pinned"
print(f"built dist/{'exterm.min.html' if HARDEN else 'exterm.html'}  {len(out)/1024:.0f} KB")
import shutil as _sh
for _f in ("serve.py", "serve.ps1"):  # LF-normalised: git ships LF blobs, so SHA256SUMS must hash the LF bytes (a CRLF checkout would not match)
    (dist / _f).write_bytes((root / _f).read_bytes().replace(b"\r\n", b"\n"))
if not HARDEN:  # the top-level copy is what serve.py serves first and what people double-click: keep it in sync
    _sh.copy(dist / "exterm.html", root / "exterm.html")
# app icons for the installable (PWA) version, served by the launcher
_icon = root / "brand" / "exterm-icon-512.png"
if _icon.exists():
    _sh.copy(_icon, dist / "icon-512.png")
    try:
        from PIL import Image as _Im
        _Im.open(_icon).resize((192, 192), _Im.LANCZOS).save(dist / "icon-192.png")
    except Exception:
        _sh.copy(_icon, dist / "icon-192.png")
# release integrity: SHA-256 of every shipped file, so anyone can check a download wasn't tampered with
_sums = []
for _f in ("exterm.html", "exterm.min.html", "serve.py", "serve.ps1", "icon-192.png", "icon-512.png"):
    _p = dist / _f
    if _p.exists():
        _sums.append(hashlib.sha256(_p.read_bytes()).hexdigest() + "  " + _f)
(dist / "SHA256SUMS.txt").write_bytes(("\n".join(_sums) + "\n").encode())
print("wrote dist/SHA256SUMS.txt (" + str(len(_sums)) + " files)")
