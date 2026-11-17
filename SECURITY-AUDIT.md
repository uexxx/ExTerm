# NovaTerm security audit (security-audit skill · quick profile)

**Scope.** NovaTerm single-page app (`src/*.js`, `index.html`), local servers (`serve.py`, `serve.ps1`), and the third-party data paths: DexScreener, on-chain RPC, Yahoo/SEC, the public CORS relays, the new Social feeds, and the AI Copilot.
**Method.** A source-first trace from each untrusted source to each HTML or navigation sink and to the proxy, with bounded local reproduction only: headless Chrome with all external traffic aborted, plus curl against 127.0.0.1. This was a single-pass *quick* run without independent verifier agents or a coverage ledger, so treat it as partial coverage, not proof that nothing else exists.
`findings.json` passes `validate-findings.cjs`.

| # | Finding | Verdict | Severity | Status |
|---|---|---|---|---|
| 1 | Script execution from third-party market data rendered into link attributes (DexScreener url, tx signatures and hashes) | confirmed | **medium** | **fixed** (safeUrl, ingestion sanitizing, hex and encoding checks, CSP) |
| 2 | News links accepted `javascript:` URLs | confirmed | low | **fixed** (safeUrl) |
| 3 | Local proxy accepted any website's requests and any Host header (DNS rebinding) | confirmed | low | **fixed** (Host and Origin gates, required `X-NovaTerm` header, size caps, security headers) |
| 4 | Proxy followed redirects off the allow-list | confirmed | low | **fixed and proven end to end** (`test/redirect_e2e.py`, 11/11) |
| 5 | AI Copilot output injection or actions | rejected | — | output is escaped; model-suggested actions (v9) only become buttons the user must click, internal commands are blocked, and everything is paper-only |

**Extra hardening shipped with the fixes**
- A Content-Security-Policy: no external scripts, objects or frames; base-uri and form-action locked.
- `X-Frame-Options: DENY`, `nosniff` and `no-referrer` on the served page.
- A "Remember API keys on this computer" switch. When off, keys are kept for the browser session only.
- A "Forget all API keys" button.
- A relay opt-out. Relays never receive your API keys or contact email.
- A 1 MB request cap and a 25 MB response cap on the proxy.

**Regression tests:** `test/sec_xss.js` (0 script executions), plus curl checks for the proxy and the `SafeRedirect` unit test.

## v9 re-audit (On-chain mode, sub-minute timeframes, Copilot+, Bar Replay, stop orders, 3D UI)

**Scope.** New code: `dex.js` (GeckoTerminal and DexScreener data), `copilot.js`, `replay.js`, `pro.js` (stop orders, 3D depth, transitions), the timeframe engine in `data.js`, the new order-ticket options, `fx3d.js` (backdrop) and the `serve.py`/`serve.ps1` allow-list change (adds `api.geckoterminal.com`).
**Method.** Same quick profile: source-to-sink tracing for every new untrusted input, then local browser checks with all external traffic mocked or aborted.

| # | Finding | Verdict | Severity | Status |
|---|---|---|---|---|
| 6 | Malicious DEX token names/symbols injecting markup (watchlist, picker, heat map, pool stats, swaps tape, Copilot) | rejected | — | sanitized on ingest (`txt()`), escaped on render, strict `oc:<chain>:<pool>` pattern; proven by `test/oc.js` |
| 7 | Token logos load from creator-chosen image hosts (IP disclosure) | confirmed | low | **mitigated**: https only, `no-referrer`, new **Settings › Privacy › Show on-chain token logos** switch |
| 8 | Persisted chain id placed into the GeckoTerminal API path | rejected | — | local-only input, same read-only host; hardened anyway with an allow-list |

**Other checks that passed**
- Pool addresses, wallet addresses, contract addresses and tx hashes are pattern-checked before they reach a link or attribute. Explorer/DexScreener links are built only from validated parts and go through `safeUrl()`.
- DEX search text is limited to letters, digits, spaces and `.-_` (2–64 characters) and URL-encoded.
- Copilot "internal" buttons (`__setup`, `__bot`) re-validate the strategy, symbol and timeframe, and only accept numeric parameters for keys the strategy defines.
- Stop orders, replay trades and the 3D views read only numbers; nothing from them is written as HTML without escaping.
- No new external scripts, frames or inline handlers; the CSP hash still matches.

**Regression tests:** `test/oc.js` (40/40), `test/pro.js` (36/36), `test/sec_xss.js`, plus the full suites. `findings.json` (8 findings) passes `validate-findings.cjs`.

## v9.1 hardening pass ("fix it all")

| # | Finding | Verdict | Severity | Status |
|---|---|---|---|---|
| 4 | Proxy redirect protection (was *needs validation*) | confirmed | low | **validated**: the real handler and `SafeRedirect` refuse off-list, http-downgrade, multi-hop and cloud-metadata redirects, and the forbidden host is never contacted |
| 9 | API keys could be saved in plain text in localStorage | confirmed | low | **fixed**: keys never touch persistent storage unencrypted. Default is this-session-only; optional vault encrypts them with your passphrase (PBKDF2-SHA256, 600,000 rounds → AES-256-GCM). Old plain-text keys are migrated automatically. `test/vault.js` 15/15 |
| 10 | Windows launcher: chunked request bodies bypassed the 1 MB / 64 KB caps | confirmed | low | **fixed**: bodies are counted while read. Static review only (no PowerShell in the audit sandbox) |

**Release integrity.** Every build writes `dist/SHA256SUMS.txt` (SHA-256 of `novaterm.html`, `novaterm.min.html`, `serve.py`, `serve.ps1`); the README explains how to verify a download on Windows, macOS and Linux.
**Reporting.** `SECURITY.md` now explains GitHub private vulnerability reporting and what to include.
**Known limits.** Not independently reviewed by a second person; `serve.ps1` was reviewed line by line against the tested `serve.py` but not executed; live third-party APIs were exercised only through mocks. `findings.json` (10 findings) passes `validate-findings.cjs`.

## v12 re-audit (token safety scanner, strategy builder + community library, workspaces, order flow, trade journal, replay challenges, local AI bridge, background alerts, themes)

**Scope.** New code: `safety.js`, `stratspec.js`, `builder.js`, `community/strategies/*` + `tools/validate-strategies.js`, `workspace.js`, `orderflow.js`, `journal.js`, `challenge.js`, `localai.js`, `themes.js`, `v12.js`; launcher additions in `serve.py` (`/api/caps`, `/api/alerts*`, `/ollama/*`, the alert engine, `api.rugcheck.xyz` on the allow-list); small core changes (`NT.onTrade` hook, per-signal stop/target).
**Method.** Same quick profile: source-to-sink tracing for every new untrusted input (strategy files, token metadata, RugCheck text, journal notes, stored workspace/theme settings, model output, launcher request bodies), then reproduction against the real launcher process and headless Chrome with all external traffic mocked or aborted.

| # | Finding | Verdict | Severity | Status |
|---|---|---|---|---|
| 11 | Alert notifications and the Ollama bridge followed HTTP redirects (urllib default) | confirmed | low | **fixed**: dedicated no-redirect openers; proven with a local redirecting server |
| 12 | A shared strategy file could pin the backtest worker (quadratic rolling high/low) | confirmed | low | **fixed**: linear-time monotonic deque + schema caps (8 conditions per group, periods 2–400, 20 KB files) |
| 13 | Strategy files as a code-execution / prototype-pollution vector | rejected | — | strict schema, allow-listed fields/indicators/comparisons, interpreted not eval'd; CI validates every community file |
| 14 | Safety scanner rendering creator-controlled token names and RugCheck text | rejected | — | stripped on ingest, escaped on render, links only from validated addresses |
| 15 | Other websites calling `/api/alerts` or `/ollama` on the launcher | rejected | — | per-launch token header, Host/Origin checks, JSON-only, size caps, 3 fixed Ollama paths |
| 16 | Telegram token / Discord webhook exposure | rejected | — | format-checked, stored owner-only (0600) in `~/.novaterm`, masked in every reply, redacted in errors |
| 17 | Journal notes, CSV export, stored workspace/theme settings as injection vectors | rejected | — | escaped, snapshot data-URL pattern check, CSV formula neutralising, storage re-validated on load |

**Bugs the new tests caught before release (not security issues).** "Remove saved details" for background alerts was rejected by the server's own validator; a duplicate element id (`wsName`) made the workspace "Save as" box type into the wallet-tracker form; custom strategies were missing from the strategy menu; 3D tilt was applied to the order ticket (made precise clicks harder) and is now limited to display-only cards. All fixed and covered by tests.

**Design notes.**
- Background alerts run only while the launcher window is open and only call allow-listed price APIs (with redirect re-validation) and the official Telegram / Discord endpoints. Discord messages disable all mentions.
- The safety grade is a heuristic screen over public data, labelled as such in the UI; "no data" is shown as **?**, never as a pass.
- Order-flow layers (delta, liquidation levels) are estimates from candle data and are labelled "est." on the chart.
- Still paper-only: no new code path signs or sends orders.

**Tests.** `test/v12.test.js` 43/43 · `test/v12_server_test.py` 49/49 · `test/v12_e2e.js` 79/79 · `tools/validate-strategies.js` 6/6, plus every older suite re-run green (`test/run-all.sh`). `security-findings.json` (17 findings) passes `validate-findings.cjs`.
**Known limits.** Same as before: one reviewer, quick profile; `serve.ps1` (Windows fallback when Python is missing) does not implement the v12 launcher features, so the page hides background alerts and the local-AI bridge there; live third-party APIs exercised only through mocks; Windows file-permission behaviour for `~/.novaterm` reasoned about, not executed.

## v13 re-audit (Launch Radar, token card, launch forensics, perps + paper futures, strategy pack 3, short / windowed / multi-timeframe backtests, background bots, wallet tracker and social upgrades, chart tools, safe storage, PWA)

**Scope.** New code: `v13core.js`, `perps.js`, `onchain2.js`, `walletpro.js`, `socialpro.js`, `bgbots.js`, `strategies3.js`, `v13.js`; changes to `core.js` (short account, windowed backtests), `stratspec.js` (short + higher-timeframe operands), `charts.js` (drawing tools, time zones), `dex.js` (socials, 5-minute flows), `app_c.js` (backup export), and the launcher (`serve.py`: Python strategy interpreter + background bots, `/api/bots`, `/api/notify`, PWA files, two new allow-listed hosts).
**Method.** Same quick profile: source-to-sink tracing for every new untrusted input (token info and socials, DEX trades, RPC transactions, derivatives data, launcher request bodies, stored bots, backup snapshots, social posts sent to a local model, chart notes), then reproduction against the real launcher and a headless browser with every third-party API mocked.

| # | Finding | Verdict | Severity | Status |
|---|---|---|---|---|
| 18 | Exported backups contained the wallet-tracker key, Helius key, on-chain RPC URL, X token and SEC contact (only the AI key was stripped) | confirmed | **medium** | **fixed**: every `SECRET_PATHS` field is blanked on export and on import |
| 19 | Telegram / Discord messages could contain clickable links chosen by token creators (Markdown masked links, auto-linked URLs and domains) | confirmed | low | **fixed**: `neutralize()` breaks links, `discord_escape()` shows Markdown literally, link previews off |
| 20 | A malformed social handle was "repaired" into a different, real-looking link | confirmed | low | **fixed**: invalid handles are dropped; only `https` links are kept |
| 21 | Token metadata (names, descriptions, socials, logos) as XSS on the token card, radar and bubble map | rejected | — | stripped on ingest, escaped on render, https-only links, canvas labels |
| 22 | Other websites / DNS rebinding driving `/api/bots` or `/api/notify` | rejected | — | per-launch token, Host/Origin checks, JSON-object bodies, size caps, 20/min rate limit |
| 23 | The launcher's Python strategy interpreter as code execution or CPU exhaustion | rejected | — | strict allow-list schema re-checked server-side, interpreted (no eval), bounded work; tampered `bots.json` entries dropped |
| 24 | Background-bot candle requests as SSRF | rejected | — | symbol regex, fixed URL templates, allow-listed https hosts, redirect re-validation |
| 25 | Prompt injection through posts sent to the local model for sentiment | rejected | — | only clamped numbers are read; text is never rendered or executed; bridge routes unchanged |
| 26 | The service worker caching the token-carrying page | rejected | — | network-first, offline fallback only, API/proxy/Ollama/hook never cached; token rotates per launch |

**Bugs the new tests caught before release (not security issues).** Backup snapshots were empty before the first save; the Launch Radar read an undefined variable; periodic re-renders wiped the radar toolbar, the bubble hover, copy-backtest results and armed "Sure?" buttons (portfolio "Close all" could need several clicks: fixed too); the worker dropped the short / window flags; synced background-bot trades without a symbol were skipped by the journal; the wallet leaderboard's fallback threw when a bad key was set; the chart note box lost focus on the click that opened it; social sentiment first used an Ollama route the bridge (correctly) refuses, so it now uses the existing OpenAI-compatible route instead of widening the bridge.

**Design notes.**
- Still paper-only. Paper futures, short selling and background bots never sign or send orders; the launcher's only network calls are GETs to allow-listed public candle APIs and the user's own Telegram / Discord.
- Background bots support no-code strategies only: the launcher interprets JSON rules with a Python port that `test/v13_parity.js` checks bit-for-bit against the page (142 random strategies, 58,777 signals).
- Backups contain no secrets (keys live in session storage or the encrypted vault); the vault's ciphertext is included so a restore keeps it.
- New allow-listed hosts: `api.hyperliquid.xyz`, `www.okx.com` (public market data only, no credentials).
- Estimates are labelled: liquidation zones, copy-backtest delay costs without candles ("est."), launch forensics ("a warning sign, not proof").

**Tests.** `test/v13.test.js` 45/45 · `test/v13_parity.js` 142/142 · `test/v13_server_test.py` 51/51 · `test/v13_e2e.js` 116/116, plus every older suite re-run green (`test/run-all.sh`). `security-findings.json` (26 findings) passes `validate-findings.cjs`.
**Known limits.** One reviewer, quick profile. Live third-party APIs (Hyperliquid, OKX, Bybit, GeckoTerminal, DexScreener) were exercised only through mocks of their documented formats, because the build environment has no internet. `serve.ps1` (the Windows fallback when Python is missing) doesn't implement background bots or `/api/notify`; the page hides those features there.

## v13.1 + v14 re-audit (saving to this computer, rate-limit handling, welcome back, P&L calendar, chart markers, multi-timeframe trend, strategy compare, risk of ruin, data-quality check, update check, keyboard shortcuts)

**Scope.** New code: `disksync.js`, `v14core.js`, `v14.js`; launcher `StateStore` (`/api/state`, `/api/state/summary`, `/api/journal`) and `update_info` (`/api/update`); changes to `data.js` (per-host pacing for DexScreener), `dex.js` (GeckoTerminal limiter, cache and DexScreener fallback), `journal.js` (merge, day filter, change hooks), `onchain2.js` (radar back-off), `app_b.js` / `journal.js` / `v13.js` (CSV writers), `app_c.js` (reset), `style.css`.
**Method.** Same quick profile: every new input traced from source to sink (request bodies and the state file, GitHub release data, the last-visit snapshot, journal entries restored from disk, strategy names in compare, rate-limit errors from APIs), then each claim checked by a test that runs the real code.

| # | Finding | Verdict | Severity | Status |
|---|---|---|---|---|
| 27 | Portfolio trade CSV kept leading `= + - @`, and trade reasons can contain token names from copy-trading | confirmed | low | **fixed**: formula-safe cell writer (numbers stay numeric), applied to every CSV export |
| 28 | "Reset everything" was undone by the copy saved on this computer | confirmed | low | **fixed**: reset mirrors the cleared storage to disk before reloading |
| 29 | Other websites / DNS rebinding reading or overwriting the saved terminal | rejected | — | per-launch token, Host/Origin checks, JSON-object bodies, 20 MB cap, key allow-list, owner-only files |
| 30 | API keys reaching `state.json` | rejected | — | keys stay in session storage or the encrypted vault; blanked by the page and again by the launcher |
| 31 | A tampered `state.json` injecting data | rejected | — | re-validated on load (launcher) and on merge (page); same validators as the app's own data |
| 32 | Update banner as an XSS or phishing channel | rejected | — | numeric tag, https link under the project's GitHub releases only, escaped text, nothing downloaded |
| 33 | Update check as SSRF | rejected | — | constant URL, no page input, redirect re-validation, 256 KB cap, 6-hour cache, can be turned off |
| 34 | Stored XSS in the new views (welcome back, calendar, markers, compare) | rejected | — | only watchlist symbols shown (escaped), dates and numbers in the calendar, canvas text, escaped names |

**Bugs the new tests caught before release (not security issues).** The symbol picker kept focus after closing and swallowed shortcut keys; bar replay's own B / S keys clashed with the new ticket shortcuts (now replay keeps them); on phones the top bar made every page scroll sideways (it now scrolls inside itself); unknown `/api/*` routes answered "background alerts are off" when alerts were disabled (now 404); journal CSVs turned negative P&L into text.

**Design notes.**
- Still paper-only: no new code path signs or sends orders.
- Saving to this computer writes `~/.novaterm/state.json` (or `NOVATERM_DATA`), owner-only, plus one dated copy per day in `state-backups/` (14 kept). Deleting journal entries removes them from `state.json` at once; older daily copies age out after 14 days. `--no-state` turns saving off.
- The update check sends one request to GitHub every 6 hours while the launcher runs (GitHub sees the IP address, as with any visit). `--no-update-check` turns it off. It only shows a banner; nothing is downloaded or installed.
- Rate limits: GeckoTerminal (~30 calls/min) and DexScreener (~60/min on list endpoints) are paced in the page, identical requests share one call, a 429 starts a shared cool-down and the last real data stays on screen. Prices keep updating from DexScreener while GeckoTerminal is cooling down.
- Risk of ruin and the data-quality grade are labelled estimates from the backtest's own trades and candles.

**Tests.** `test/v14.test.js` 48/48 · `test/v14_server_test.py` 26/26 · `test/v14_e2e.js` 42/42 · `test/v131_server_test.py` 46/46 · `test/v131_e2e.js` 39/39, plus every older suite re-run (`test/run-all.sh`). `security-findings.json` (34 findings) passes `validate-findings.cjs`.
**Known limits.** One reviewer, quick profile. GitHub, GeckoTerminal and DexScreener were exercised through mocks of their documented formats (the build environment has no internet). `serve.ps1` (Windows fallback without Python) does not implement saving to disk or the update check; the page detects this and keeps data in the browser only.

## v15 phases 4–5 audit (heat-map bubbles, Launch Radar, scanner sidebar, Pro Desk, encrypted backups)

**Method.** An independent source review of each phase's diff, run by a separate reviewer agent that only reported and changed nothing. Findings were fixed and then covered by regression tests (`test/v15p4*.js`, `test/v15p5*.js`, `test/harden_smoke.js`). Browser end-to-end runs use headless Chrome with all third-party traffic aborted.

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Encrypted backup encoder spread the whole ciphertext into one `String.fromCharCode` call, so backups over about 100 KB failed | high (availability) | **fixed**: chunked base64; E2E round-trips a 300 KB field |
| 2 | A restore could be overwritten before reload by save-on-close or the launcher's disk mirror, and a full storage quota left half-written state | medium | **fixed**: atomic replace with rollback, write lock until reload, newer `nt.savedAt` |
| 3 | Correlation guard also blocked resting limit-order fills, which then disappeared silently | medium | **fixed**: fills skip the guard, which runs when the order is placed |
| 4 | Options panel could retry a failing Yahoo request forever | medium | **fixed**: 60 s back-off and a manual Retry |
| 5 | Pine importer silently changed `a and b or c` precedence; it also had quadratic regexes on huge lines | medium / low | **fixed**: mixed and/or is refused; lines over 500 chars are reported, never parsed |
| 6 | Sub-wallet ids collided for look-alike names; sub-wallet cash dropped out of displayed equity | medium | **fixed**: unique ids; header and flex card include sub-wallet equity |
| 7 | Numbers from restored state reached markup unescaped (CSP still blocked execution) | low | **fixed**: everything goes through `esc()` |
| 8 | BroadcastChannel peers accepted any well-formed symbol; peer set unbounded; malformed `#popout=` link aborted start-up | low | **fixed**: only known markets, capped peers, guarded decode |
| 9 | Bubble animation loops kept running while hidden; ⚡ Grok fired twice on keyboard; scanner history loads were unthrottled | medium / low | **fixed** |
| 10 | XSS in heat maps, radar, sidebar, Pro Desk (pool names, wallet names, chain data, Pine errors, BroadcastChannel) | — | **none found**: verified by review and by hostile-string E2E checks |
| 11 | CSP: inline handlers, `eval`, string timers | — | **none**: E2E asserts zero `on*` attributes and zero CSP violations; the minified build passes the same checks |

**Crypto.** `.exterm` backups use AES-256-GCM with a fresh 16-byte salt and 12-byte IV per file, and PBKDF2-HMAC-SHA256 at 600,000 rounds. Import accepts only files with 100k–2M rounds. A restore writes only ExTerm's own storage keys, as strings capped at 8 MB.

## v16.0 addendum: local external bot bridges

**New outbound path.** From v16.0 the page can POST (or send one WebSocket frame) to a bot process the user runs. Review of `src/v160core.js` and `src/v160.js`:

| Check | Result |
|---|---|
| SSRF / exfiltration | `V160.checkUrl` accepts only `127.0.0.1`, `localhost` and `[::1]`, or an exact allow-listed private-LAN `host:port` over https / wss. Public hosts, look-alike hostnames (`127.0.0.1.nip.io`, `localhost.evil.com`), link-local metadata IPs, `0.0.0.0`, credentials in URLs and non-web schemes are rejected (unit-tested). CSP `connect-src` allows plain http / ws only on loopback. |
| Redirect pivot | `fetch(..., { redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer' })`. |
| Message integrity | HMAC-SHA256 over the exact payload string with a 32-byte per-slot secret (WebCrypto); per-session nonce, timestamp and rising sequence number; the documented receiver check uses a constant-time compare and rejects stale (> 30 s) or replayed envelopes (unit + E2E against a verifying receiver). |
| Accidental live trading | Fresh installs and any inconsistent saved state load as PAPER. Live needs four gates (fresh heartbeat, three circuit breakers, disclosure, exact `ARM LIVE BOT`); configuration is frozen while live; a boot briefing holds signals after every reload; `Ctrl+Shift+K` and three missed heartbeats revert to PAPER. |
| XSS | Slot names, endpoints, log lines and receiver samples are rendered through `esc()` or `textContent`; no inline handlers (`build.py --harden` CSP pins unchanged). |
| Custody | No keys, seeds or exchange credentials are stored or requested; slot secrets only authenticate ExTerm to the user's own receiver. |

## v16.1 addendum: bot fail-safe engines, chart menu, localhost-only webhook gateway

Scope: `src/v161core.js`, `src/v161.js`, the v16.1 changes in `src/v160core.js` / `src/v160.js`, `serve.py` / `serve.ps1` `/hook`.

- **Replay & duplication.** Every envelope carries a UUID v4 `idempotency_key` and `expires_at_ms = ts + 3000`. The sender
  keeps a rolling nonce cache and never reuses a key. `V160.verify` rejects `expired` packets and, when given a
  `NonceCache`, any key it has already accepted. The sample receiver does the same. The e2e suite replays a captured
  packet against a real receiver and confirms the rejection.
- **Key exposure window.** Packets are signed with an ephemeral session key derived as
  `HMAC-SHA256(slot secret, "ExTerm-session-v2|" + session)`. The session nonce is redrawn on every boot and every arm,
  so a captured signature is bound to one session. The slot secret itself never travels.
- **Acknowledgment binding.** A receiver reply whose `ack` differs from the packet's `idempotency_key` is treated as a
  failure and recorded in the ledger.
- **Fat-finger / malformed output.** Opening orders must pass the schema validator (finite numbers, symbol pattern,
  known action, positive size, stop-loss below entry) and the Max Single-Order Notional cap before dispatch. Closes are
  never blocked, because blocking an exit would add risk.
- **Market-condition and behavioural breakers.** The spread ceiling and the consecutive-loss cooldown hold opening
  orders only. Every trip is written to the receipt ledger.
- **Fail-safe direction.** The Dead-Man's Switch (3 missed heartbeats, plus a watchdog for a stalled heartbeat loop) and
  Flatten All & Disarm always move toward PAPER. The `CANCEL_ALL_AND_FLATTEN` packets are built before the state flips,
  and local state is PAPER even if a receiver is unreachable.
- **Ledger export.** CSV cells that start with `= + - @` (other than plain numbers) are prefixed with `'`, so exported
  receipts cannot run spreadsheet formulas.
- **Webhook gateway (SSRF).** `/hook` now forwards only to `127.0.0.1` / `localhost` / `::1` (never the launcher's own
  port), or to a private-LAN `https` host:port listed in `EXTERM_HOOK_ALLOW`. Credentials in URLs, other schemes,
  public hosts, look-alike names and metadata addresses are refused. Redirects are still blocked by the existing
  opener. The legacy third-party bot-service allowlist is removed.
- **Chart UI.** The context menu, ruler readout, dry-run viewer and journal card build HTML only from `esc()`-escaped
  strings and listeners attached in JS. There are no inline handlers, so the `default-src 'none'` CSP with SHA-256
  script / style pins is unchanged. The ruler canvas is `pointer-events: none`.