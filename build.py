#!/usr/bin/env python3
# Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited.
"""Inline CSS + JS into one self-contained HTML file: dist/exterm.html"""
import pathlib
root = pathlib.Path(__file__).parent
src = root / "src"
html = (src / "index.html").read_text(encoding="utf-8")
css = (src / "style.css").read_text(encoding="utf-8")
order = ["disksync.js", "core.js", "strategies2.js", "stratspec.js", "strategies3.js", "strategies4.js", "validate.js", "data.js", "stocks.js", "solana.js", "dex.js", "sec.js", "keyvault.js", "onchain.js", "safety.js", "charts.js","indicators.js","orderflow.js","indpick.js","picker.js","fx3d.js", "themes.js", "app_a.js", "app_b.js", "builder.js", "app_d.js", "app_c.js","social.js","app_e.js","workspace.js","journal.js","challenge.js","copilot.js","replay.js","pro.js","localai.js","v12.js", "v13core.js", "v14core.js", "perps.js", "onchain2.js", "walletpro.js", "socialpro.js", "bgbots.js", "v13.js", "v14.js", "v15core.js", "v15p2core.js", "v15p2.js", "v15p3core.js", "grok.js", "world.js", "v15p4core.js", "v15p4.js", "v15p5core.js", "v15p5.js", "v151core.js", "v151.js", "i18n.js", "v152core.js", "v152.js", "v153core.js", "v153.js", "v154core.js", "learn_academy.js", "leaderboards.js", "v154_core_upgrades.js", "v155core.js", "v155.js", "v155s.js", "v156core.js", "v156.js", "v157core.js", "v157.js", "v160core.js", "v161core.js", "v162core.js", "v163core.js", "v164core.js", "v165core.js", "v166core.js", "v170core.js", "v160.js", "v161.js", "v162.js", "v163.js", "v164.js", "v165.js", "v166.js", "v170.js", "boot.js"]
V17_PRO = ["v170pro.js", "v170app.js", "v170mob.js", "v171core.js", "v171.js"]  # v17.0 Phases 2–5 + v17.1: pure core, then the UI wrappers; they wrap boot(), so they load right before boot.js
order = order[:order.index("boot.js")] + V17_PRO + order[order.index("boot.js"):]
V172 = ["v172core.js", "v172.js", "v173core.js", "v173.js", "v175core.js", "v175.js", "v176core.js", "v176.js", "v177core.js", "v177.js", "v178core.js", "v178.js", "v179core.js", "v179.js", "v180core.js", "v180.js", "v181core.js", "v181.js", "v182core.js", "v182.js"]  # v18.2 strip cluster + Zen / R / P hotkeys + atomic tfSeq + Lane 22 outlier guard (wraps TFX.candles after V181) + OffscreenCanvas HUD + Portfolio & Risk Console (Lane 26) + hover pre-warm + Lane 21 EVO feed · v18.1 universal symbol normalizer + instant Lane 9 / 10 candle hydration + cross-lane pre-warm (wraps TFX.candles / selectSym / setMode) · v18.0 5-tab rail + 24/7 Alpha Recs + fighter-jet 2D depth pill / magnifier / R:R handles / Ctrl+K (wraps V177 + V179UI) · v17.9 19-lane mesh client (candles, Picks, Live Bot strip, firewall / ledger / brackets) · v17.8 Lanes 5–8 client + Tracker + predator Radar + self-healing Brain + tape (wraps V177UI) · v17.2 THE SYNAPSE (takes over V171UI.core) + v17.3 live bubbles / dual-engine Synapse / matrix (wraps V172UI) + v17.5 worker mesh / 3D layers / Shock Lab / Working Bots squad + v17.6 4D singularity / Alpha Radar (needs V175), after v171.js
order = order[:order.index("boot.js")] + V172 + order[order.index("boot.js"):]
js = "\n".join(f"/* ===== {n} ===== */\n" + (src / n).read_text(encoding="utf-8") for n in order if (src / n).exists())
wallets = (src / "wallets.json").read_text(encoding="utf-8")
import json as _json
worker_src = "\n".join((src / f).read_text(encoding="utf-8") for f in ("core.js", "strategies2.js", "stratspec.js", "strategies3.js", "strategies4.js", "validate.js", "v153core.js", "v15p5core.js", "v164core.js", "v170core.js", "worker.js"))
js = "const WORKER_SRC = " + _json.dumps(worker_src) + ";\n" + js
# v17.5: the 8 dedicated worker lanes share one source (pure V175 maths + v17.6 renderers / Alpha Radar scan + the allow-listed message kernel)
worker175_src = "\n".join((src / f).read_text(encoding="utf-8") for f in ("v175core.js", "v176core.js", "v175work.js"))
js = "const WORKER175_SRC = " + _json.dumps(worker175_src) + ";\n" + js
# v18.2: the chart HUD worker (OffscreenCanvas) = pure V182 maths + the 12-line render kernel
worker182_src = "\n".join((src / f).read_text(encoding="utf-8") for f in ("v182core.js", "v182work.js"))
js = "const WORKER182_SRC = " + _json.dumps(worker182_src) + ";\n" + js
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
# strict style CSP: the one <style> element is allowed by its exact SHA-256 hash (no injected stylesheets); style="" attributes
# stay allowed via style-src-attr because the UI positions bars and meters with them (CSSOM writes never need it)
import re as _re
_style = _re.search(r"<style>(.*?)</style>", out, _re.S).group(1)
_sdig = base64.b64encode(hashlib.sha256(_style.encode("utf-8")).digest()).decode()
out = out.replace("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;", "style-src 'self' https://fonts.googleapis.com; style-src-elem 'self' 'sha256-" + _sdig + "' https://fonts.googleapis.com; style-src-attr 'unsafe-inline';")
assert "style-src-elem 'self' 'sha256-" in out, "style CSP not pinned"
dist = root / "dist"
dist.mkdir(exist_ok=True)
(dist / ("exterm.min.html" if HARDEN else "exterm.html")).write_bytes(out.encode("utf-8"))  # bytes: same file on Windows and Linux (no CRLF, no cp1252)
assert "script-src 'sha256-" in out and "default-src 'none'" in out, "CSP not pinned"
if HARDEN:  # v18.0 secret scan: refuse to ship a bundle or launcher that carries a credential-shaped string
    _SECRETS = [("private key", r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----"), ("AWS access key", r"\bAKIA[0-9A-Z]{16}\b"), ("GitHub token", r"\bgh[pousr]_[A-Za-z0-9]{36,}\b"),
                ("OpenAI / Anthropic key", r"\bsk-(?:ant-|proj-)?[A-Za-z0-9_\-]{32,}\b"), ("Slack token", r"\bxox[abprs]-[A-Za-z0-9-]{10,}\b"), ("Google API key", r"\bAIza[0-9A-Za-z_\-]{35}\b"), ("Stripe live key", r"\b[rs]k_live_[0-9A-Za-z]{20,}\b")]
    _hits = []
    for _name, _text in [("dist/exterm.min.html", out)] + [(f, (root / f).read_text(encoding="utf-8", errors="replace")) for f in ("serve.py", "exterm_ops.py", "grok_exterm_bridge.py")]:
        for _k, _rx in _SECRETS:
            for _m in _re.finditer(_rx, _text):
                _hits.append("%s: %s at offset %d" % (_name, _k, _m.start()))
    if _hits: (dist / "exterm.min.html").unlink(); raise SystemExit("secret scan FAILED (hardened build deleted):\n  " + "\n  ".join(_hits[:20]))
    print("secret scan: 0 findings (%d patterns over the bundle + 3 launchers)" % len(_SECRETS))
print(f"built dist/{'exterm.min.html' if HARDEN else 'exterm.html'}  {len(out)/1024:.0f} KB")
import shutil as _sh
for _f in ("serve.py", "serve.ps1", "exterm_ops.py", "grok_exterm_bridge.py", "Dockerfile", "docker-compose.yml"):  # LF-normalised: git ships LF blobs, so SHA256SUMS must hash the LF bytes (a CRLF checkout would not match)
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
for _f in ("exterm.html", "exterm.min.html", "serve.py", "serve.ps1", "exterm_ops.py", "grok_exterm_bridge.py", "Dockerfile", "docker-compose.yml", "icon-192.png", "icon-512.png"):
    _p = dist / _f
    if _p.exists():
        _sums.append(hashlib.sha256(_p.read_bytes()).hexdigest() + "  " + _f)
(dist / "SHA256SUMS.txt").write_bytes(("\n".join(_sums) + "\n").encode())
print("wrote dist/SHA256SUMS.txt (" + str(len(_sums)) + " files)")
