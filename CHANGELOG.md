# Changelog

ExTerm holds no funds and no keys in every version. Up to v15.7 it was paper only; from v16.0 it can send HMAC-signed signals to a bot you run on your own machine, only after four explicit gates, and it starts in PAPER. v16.1 adds eight fail-safe engines on that path; v16.3 closes the loop with ACK + fill sync and a live cockpit; v16.4 adds DEX discovery, a local Copilot and a realistic backtester; v16.5 lets any AI or bot advise through one deterministic firewall; v16.6 adds a live transactions tape for every market.

## v17.6 — Psychedelic 4D Singularity, Alpha Radar, DEX Bubble Map & On-Chain Desk — 22 Nov 2026

- THE SYNAPSE: the Working Bots wireframe core is now the `sing` renderer (`src/v176core.js`).
  - Layers: a tesseract rotated in XW / YW / ZW, an inner counter-rotating tesseract, and 4 torus knots on nested Clifford tori in S³ stereographically projected (the pen lifts near the pole so no chords cross the canvas).
  - Also: a Keplerian accretion vortex, a photon ring + horizon, L-system dendrites and seeded midpoint-displacement plasma bolts to 6 orbiting squad nodes.
  - Drag-orbit / wheel-zoom. It renders off-thread in the 3D Spatial worker (≈ 0.8 ms/frame there; main thread p95 ≈ 0.2 ms).
  - The roster list stays in the DOM, visually hidden, for screen readers.
- 3 wide panels replace the 8: `ac` (attractor + Merton cone with P10 / P50 / P90 labels), `sonar2` (eigen-risk sonar + W1–W8 avg / p99 bars, with the lane table and frame budget below), and execution stream + KPIs.
  - KPIs are computed only from closed trades of `ST.bots` with `run = true`; the equity sparkline samples those bots' equity.
- Alpha Radar (`src/v176.js`, nav tab `radar`, a ◎ chip in the phone More sheet).
  - The universe is every live quote the terminal streams + on-chain pools + pins, with 2 s price rings.
  - `V176.scan` runs as the allow-listed `alphaScan` op in the Screener worker lane every 4 s while the tab is open.
  - Grading = the applicable engines (Hurst, Kalman, permutation entropy, shadow bracket, Kelly, ≤ 2 % impact size, order type, rug shield, MEV) + a 6-bot vote. There is a RISK-GUARD veto (≤ 69), on-chain is long-only, and a confidence shrink applies until 60 samples.
  - Output: a 6-box dossier, a summary and 4 handoffs. The dome renderer `radar` runs off-thread, and tap-to-select uses the renderer's own projection.
- DEX Bubble Map:
  - `OC.universe(chain, kind)` merges GeckoTerminal trending p1 + p2, DexScreener `token-boosts/top` pairs and new pairs into 28–40 pools (never mixed with simulated ones); `loadOcHeat` uses it.
  - 5m / 1h / 6h / 24h pills + Refresh on the map drive the label, colour scale (±4 / 10 / 20 / 40 %), momentum-weighted radius and a spring impulse.
  - `#v164Main` no longer clips the canvas.
  - The simulated fallback grew to 32 pools, and simulated swaps carry wallet tags so Rug Shield v2 runs offline.
- On-Chain Token Desk (On-Chain tab):
  - Chain pills; the CA resolver (`OC.search` → `OC.refreshPool`).
  - `V176.rug2`: Sybil entropy, slot-0 bundle share, LP lock and retention half-life, each `n/a` when it can't be measured.
  - `V176.twap`: constant-product TWAP + sandwich odds at a priority fee.
  - Load on Main Chart / 3D Shock Lab / Copy CA (with a clipboard fallback); the 2D ↔ 3D scene pill is verified.
  - "All Chains" loads one chain at a time, to respect GeckoTerminal's ~30 calls / min.
- Fixes:
  - EDGE strip glyph tops;
  - the chart toolbar wraps (it overflowed 1063 px into an 834 px row, under the ticket);
  - the phone Trade sheet was anchored to `main` because of `perspective`, so the ticket header sat at −100 px;
  - the grade-pill class collided with the global `.gB`;
  - the Alpha Radar nav sits after Lab.
- Palette: every v17.6 colour literal is a pre-v17.0 token (tests enforce it).
- Screenshots: 27 × 2× (new 21–27: Alpha Radar, DEX bubbles 1h / 24h, main chart, On-Chain desk, phone radar + bubbles; 17 now shows the singularity).
- Tests: new `test/v176.test.js` (26); `v17pro_e2e` 96/96; the v17.5 assertions for the build list, the replaced panel names and the version now accept v17.6.

## v17.5 — Multi-Worker Sovereign 3D & Quant Frontier — 22 Nov 2026

- Worker mesh: 8 dedicated Web Workers from one blob (`WORKER175_SRC` = `src/v175core.js` + `src/v175work.js`), one per lane.
  - Each lane runs only its allow-listed ops. `Float64Array` series are transferred zero-copy, and typed-array results are transferred back.
  - There is an inline fallback, a 20 s timeout, and per-lane BUSY / IDLE / HIBERNATE state with jobs, queue and avg / p99 ms.
- Off-thread rendering: the six Working Bots canvases are handed to the 3D Spatial worker with `transferControlToOffscreen` and drawn by the pure `V175.R` renderers.
  - Each frame the main thread posts one state snapshot; large payloads (attractor xyz, Monte Carlo paths) travel once.
  - One rAF driver (`V175UI.loop`) uses IntersectionObserver / ResizeObserver, so no layout reads happen inside the frame. It enforces a 0.6 ms per-frame budget and stops off-screen canvases.
  - Measured main-thread v17.5 frame work: p95 ≈ 0.2 ms; the e2e gate is ≤ 1.2 ms.
- `serve.py`: 4 execution lanes (ingest · forensics · quant · exec). Each is a lazily started single-worker `ProcessPoolExecutor`.
  - Jobs: OHLC aggregation, wash entropy, Bellman–Ford, Merton percentiles, book shock and Kelly sizing.
  - Allow-list, numeric and size caps (`lane_args_ok`) apply; `GET /api/lanes` and `POST /api/lanes/run` are token-gated.
  - Thread fallback (`EXTERM_LANES=thread`, or automatic if a process pool can't start); `--no-lanes`.
- Search: "Search any stock, coin, or paste meme coin CA…" + "Use Active Chart Symbol" now also covers the chart, Tracker, Portfolio, Journal, Workspace, Social, Bots, Challenges and Academy tabs, plus the Morning Briefing, which gets a MutationObserver. On the chart it shares one compact row with a single-line EDGE ticker you can click to expand.
- Working Bots squad (`V175.Squad`): 6 members mapped from real bus events.
  - It shows STANDBY, or IDLE / ARMED / ACTIVE once real events arrive.
  - The demo is opt-in and labelled. It feeds the squad only, is dropped while real bots run, and stops itself.
  - 4D core plus 8 quant panels: Lorenz–Rössler · Merton cone · eigen-risk sonar · firing matrix · events/s + p99 · KPIs · worker mesh · edge engines.
  - The Merton Kelly readout is gated on the drift t-statistic (|t| ≥ 2), and λ is marked when capped.
- Main-chart 3D: 3 default layers (OB Prisms, VPVR / POC, Whale Beacons) and a 12-layer drawer with IndexedDB presets and a 4D replay scrub. v17.1's renderer now gates OB / L2 on the layer state and exposes its projection (`chart3d.geo`) for the overlays.
- 2D | 3D pills on 10 tools; every scene says whether it shows live or model data.
- Shock Lab (Quant Lab): 156 scenarios, 4 sliders, a book-walk shock on the live L2 book or a model book, and a stress test of open positions and running bots' positions.
- 30+ edge engines (`V175.E`, catalogue `V175.ENGINES`) computed in the lanes for the active symbol, with honest "model" / "collecting" / "needs X" labels.
- WebAudio Sonar, Voice HUD (Shift+V; the chart keeps v17.0's Shift+V voice commands), 60 s Flight Recorder (Shift+R → JSON).
- Palette: every colour literal in the v17.5 JS and CSS is one of the pre-v17.0 tokens (`#07080B`, `#0D1117`, `#F5C84B`, `#2fd08a`, `#ff5a5f`, `#9a917a`, `#d8cfb6`); the tests enforce this, and the pre-v17.0 rules are untouched.
- Screenshots: new `17-working-bots-squad.png`, `18-shock-lab-flight-simulator.png`, `19-3d-layers-drawer.png` and `20-options-3d-iv-surface.png` (20 × 2×).
- Tests: new `test/v175.test.js` (118) and `test/v175_lanes_test.py` (20); `v17pro_e2e` 80/80; all 36 unit suites pass. `run-all.ps1` / `.sh` now include v17.1–v17.5. The v17.3 build-order assertion was relaxed to allow modules after `v173.js`.

## v17.3 — Exact Pre-v17.0 Gold Restored, Live Bubble Physics, Dual-Engine Synapse, Telemetry Matrix — 22 Nov 2026

- Theme: the v16.6 (`961e97d`) palette was measured from that build's computed styles and restored exactly; a probe of v17.3 shows zero token differences from it.
  - The v17.1 slate overrides (`#0D1117` / `#161B22` / `#F8FAFC` / `#94A3B8`) and the v17.2 strict token block are removed.
  - The 18 pre-v17 modules are back to their v16.6 colour literals, and the theme swatches match v16.6.
  - v17-era chrome uses the warm v16.6 tones. Obsidian & Gold stays the default.
- Bubble maps: a shared live engine (`src/v173core.js` physics, `src/v173.js` rendering) drives all three.
  - `Radar.bubbles` (On-Chain Age × Buy Pressure).
  - `P4UI.Bubbles` (heat bubbles).
  - The v16.4 Market / Discovery map: `v164.js` now hands its `bubPts` to the engine and reuses the canvas across its 500 ms price-driven re-renders, which previously rebuilt it every tick.
  - Engine features: ~85 % fill, spring attractors with orbiting targets, currents, buoyancy, elastic collisions, wall containment, hover repel, drag-fling, additive halos, specular highlights, update shockwaves, and 0 fps when hidden. Missing buy/sell counts fall back to a 1h-change estimate, so the map never collapses to a flat line.
- THE SYNAPSE: Visual Engine Switcher (Synapse Cortex · Singularity Burst · Auto-Morph), additive `lighter` compositing, fed by the bus and the sensors.
  - Cortex: fractal dendrites, comet relays, spore cascades.
  - Singularity: event horizon, ~3,000 radial filaments, coronal tendrils, shockwaves, callout badges.
  - The scope filter is now labelled "Working Bots".
- Telemetry matrix: RUN LOG (the ms trace) · ACCESS LEDGER · BLAST RADIUS · ACTION HEAT (6 × 30 flashing grid) · THROUGHPUT (stacked histogram) · BOT STATUS, plus Signal Rotation and The Pricer.
- Screenshots: `01-hero-chart-gex-dom.png`, `10-bot-fleet-neural-torus.png` and `14-mobile-touch-cockpit.png` recaptured, plus new `15-synapse-singularity-burst.png` and `16-live-bubble-map.png` (16 × 2×).
- Tests: new `test/v173.test.js` (34); `v17pro_e2e` 65/65; all 33 unit files pass. The v17.2 assertions were updated for the restored palette, and the v15.7 test is back to its original v16.6 expectation.

## v17.2 — Obsidian & Bullion Gold Everywhere, THE SYNAPSE Neural Cockpit — 21 Nov 2026

- Theme: strict Obsidian `#07080B` / `#0D1117` panels / `#161B22` headers, Bullion Gold `#F5C84B`, Emerald `#22C55E`, Crimson `#EF4444`, on every workspace and on mobile.
  Obsidian & Gold is now the default theme, with a one-time migration for existing installs. 106 off-palette violet, rose and mint literals in 22 source files now use the palette, chart overlays use platinum `#CBD5E1`, and the near-liquidation colour is Crimson.
- Bot Fleet → THE SYNAPSE (`src/v172core.js`, `src/v172.js`): a 3-column stage (Sensory Input Layer · The Synapse · Cortex & Synaptic Weights) plus a bottom row (Signal Rotation · The Trace · The Pricer), stacked under 820 px.
  It takes over `V171UI.core` with the same API, so the bus wiring, fleet filter and 0-fps-when-hidden behaviour carry over.
- Sensors are real counters:
  - `Feed.tickL` ticks/s
  - Resource Timing cache hits, plus the new `Server-Timing: swr;desc=LIVE|STALE|MISS` header on `serve.py` proxy responses
  - `Worker.postMessage` jobs/s
  - `V170UI.merger` cross-exchange CVD, with a bar-volume fallback when the tape is thin
  - GEX regime and realized volatility
- Impulses: Gold for tick / cache / mutation, Emerald for signal / whale / fill, Crimson for a firewall block. A blocked `Fleet.exec` now emits a `block` bus event.
- The Pricer: 48 seeded GBM paths with p5 / p25 / p50 / p75 / p95 bands. The Trace: ms-stamped and incremental, keeping 40 rows from a 120-entry ring. Record X Clip hides dollar balances automatically and masks $ amounts on the canvas and in the Trace.
- Tests: new `test/v172.test.js` (35); `test/v17pro_e2e.js` 59/59; all 32 unit files pass. Builds: standard and `--harden`, with script and style SHA-256 CSP hashes checked against the inline bundles.

## v17.1 — Two-Row Header, Global Ledger, Real Slippage, Copilot Everywhere, Chart 3D, Neural Core, Stale-Feed Lock — 21 Nov 2026

- UI: the header bars go from four to two rows (64 px total). The ticker and group captions are gone, and 3D, AI Bridge and Quant Lab no longer have duplicate Reach chips.
  Also: AAA contrast tokens, an 11 px minimum font size, subscript sub-penny prices, monogram token avatars, a live context strip on every non-chart workspace, and Esc to close modals.
- Ledger: `window.__EXTERM_LEDGER` (IndexedDB) holds positions, orders, NET BE, partial take-profits and trailing high-water marks, and is checked on every tick in any tab. The bus and ledger logs use ring buffers.
- Fills: price impact from an AMM `x·y=k` model (DEX) or an L2 depth walk (CEX / stocks), applied above 5 bps and shown in the ticket as Est. Price Impact.
- `Shift+Esc` / ⏻ FLATTEN ALL closes every position, cancels every order, stops every bot and clears the co-pilot queue.
- Drawings are anchored to (epoch ms, price).
- Copilot: Quick-Connect (auto-detect Ollama, or paste a Grok / Claude / DeepSeek / OpenAI key). Claude uses the native Messages API (`claude-opus-5-5`).
  The prompt carries the full live context, replies get 1-click action pills, and a deterministic local analyst answers whenever no model is reachable.
- Every analytical tool has a "Search any stock, coin, or paste meme coin CA…" bar. Derivs & Arb works for any symbol: cross-DEX pools, cross-exchange funding / OI, and stock spread + options stats.
- 3D is a toggle on the main chart toolbar (the standalone 3D tab is removed; `showTab('d3')` now opens the chart with 3D on).
- Bot Fleet: the Neural Core replaces the torus and the two columns are balanced. The Bubble Map fills ~85% of the viewport and redraws on resize.
- Data: Jupiter price failover for Solana pools, publicnode moved last in the RPC order, and launcher 429 / Retry-After cooldowns capped at 60 s.
  If every provider fails for more than 5 s, the STALE FEED · Xs pill and DELAYED DATA stamp appear and bots and live execution are locked.
- Tests: `test/v171.test.js` (39) and 15 new desktop + phone checks in `test/v17pro_e2e.js` (54 / 54).

## v17.0 — Edge-Coach, Bot Fleet, Academy, 10-Language Picker, Mobile App & Android APK — 21 Nov 2026

### Licence
- ExTerm v17.0 and later are **proprietary — All Rights Reserved (ExTerm Labs)**: free for personal, non-commercial use; copying, modifying, reverse-engineering, cloning or redistributing source or derivative works requires express written permission. `LICENSE`, `README.md`, `BRAND_GUIDELINES.md`, every source header and a new `package.json` (`"private": true`, `"license": "UNLICENSED"`) carry the new terms.

### Phase 1.1 — `serve.py` 429 storm fix
- **Fixed:** an upstream `HTTP 429` inside `/proxy` crashed the handler with `NameError: _EXTERM_LAST_GOOD` (the same broken block, also referencing an undefined `_exterm_synth_dex_ohlcv` and an out-of-scope `url`, had been pasted into the Ollama bridge, the webhook gateway and `--doctor`; those now behave as before).
- **Single-flight coalescing:** identical concurrent proxy requests (same method, URL, body and credentials) share **one** upstream call.
- **Per-host cooldown:** a 429 sets an exponential cooldown per host (2 s → 300 s, honouring `Retry-After`); network errors back off 1 s → 60 s. A burst of parallel 429s inside one window counts as one strike. During a cooldown no upstream calls are made.
- **Stale fallback:** the last 200 OK of every credential-free GET is kept (512 URLs, LRU) and replayed with `X-ExTerm-Cache: STALE` + `X-ExTerm-Stale-Age`; with no copy the page gets clean JSON `429` + `Retry-After`. POSTs and credentialed responses are never cached or replayed. One single-line notice per host per cooldown window; client disconnects no longer print tracebacks.
- **Keep-alive pool:** proxied HTTPS calls reuse up to 4 idle connections per host (idle > 8 s are discarded); redirects still go through the allow-listed `SafeRedirect` opener.
- **Compact candles:** send `X-ExTerm-Pack: ohlcv` and Binance / Coinbase / Kraken / Bybit / GeckoTerminal candle responses come back as `[[t,o,h,l,c,v], …]` (≈ 65–70 % smaller on real Binance klines).
- **On-chain 1s charts no longer stall** up to 20 s behind a GeckoTerminal rate-limit cool-down: the optional swap seed is fetched with `noWait` (the old 429 crash used to hide this).
- New `test/v17_shield_test.py` (14 checks, no network).

### Phase 0 — environment & legacy tests
- No `Stop` hook in any Claude settings file calls `sh` (nothing to change); the v15p4 "quiet 5 s buckets" assertion was superseded by the v16.4 contract (quiet buckets are never back-filled) and now asserts it. Build-order assertions in the v15.6–v16.6 suites accept the v17.0 modules; offline e2e suites now block outside WebSockets as well as HTTP.

### Phase 1 — speed engine, cross-venue tape, 24/7 daemon
- **`src/v170core.js` (pure, Node-tested, also inside the Web Worker):** monotonic `Epoch`, `toMs` (s / ms / µs / ns / ISO → epoch ms), 512-entry dedup set, Lee-Ready classifier, composite multi-venue `Float64Array` / `Uint32Array` ring (CB · KRK · BIN · BYB · OKX · DEX) with per-venue CVD / lag, venue-mask filter, BUY / SELL / WHALE / BLOCK / SWEEP bits, spot-vs-perp basis, OI-weighted funding, cross-venue spread (bps), combined L2 depth buckets with venue masks, Bybit + OKX adapters, OHLCV pack / unpack, LRU, a CSP-safe formula compiler (no `eval`) with columnar scan + index sort, CSV → packed OHLCV, clipboard CA / ticker detection, 500 ms → 1 s → 2 s backoff, heartbeat colour, provenance text.
- **Web Worker jobs with zero-copy Transferables:** `v170scan`, `v170sort`, `v170csv`, `v170depth`, `v170bt` (packed-candle backtest); results come back as transferred typed arrays (`V170UI.job`, main-thread fallback).
- **`ST.epoch`** bumps on every symbol / market / timeframe switch; `V170UI.guard(promise)` drops late answers.
- **L1 / L2 candle cache:** the last 50 symbol · TF rings in RAM + IndexedDB, painted before the network answers (< 5 ms from L1, measured in the browser test).
- **Cross-venue Live Tape:** for the crypto symbol on screen, keyless public trade streams from Coinbase, Kraken, Binance, Bybit and OKX are merged and deduped; prints from venues other than the primary feed are tagged into the tape. One-line strip: provenance pill (`LIVE · 18ms · AGGREGATED [CB·KRK·BIN]` / gold `RECONNECTING…`), 6 px heartbeat dot, 1-click venue filter (All Aggregated · CB · KRK · BIN · BYB · OKX · DEX), basis %, aggregated funding, spread (bps), CVD. A venue that fails two handshakes without a message (e.g. HTTP 451 geo-block) is parked for 10 min.
- **Discovery formula scanner:** one input row (`RVOL > 3x AND Price > VWAP AND 5m Delta > +$50K`, AND / OR / NOT, parentheses, arithmetic, K/M/B/x/% suffixes) with inline errors and an audio + visual breakout chime when rows newly match.
- **Clipboard sniper:** a copied Solana / EVM contract address or ticker (paste, or on focus when clipboard-read is already granted: never a permission prompt) shows a `Load … on Chart — 1-Click` pill.
- **24/7 daemon — `python serve.py --bot-daemon --headless`** (`exterm_ops.py`): process 1 ingest (one PriceFeed → SQLite WAL `prices`), process 2 paper bots behind a **10-gate risk firewall** (mandatory stop-loss, daily drawdown kill-switch, max entries / day, consecutive-loss pause, macro freeze, zero-overdraft settled-cash cap, slippage / fee abort, live-price deviation abort, stale-signal abort) writing a **Wake-Up digest**, process 3 async dispatcher (Telegram / Discord notices; `HMAC-SHA256`-signed JSON webhooks to loopback / allow-listed LAN bridges only while a verified **5-step arming receipt** exists). The launcher supervises all three (heartbeats, restart with backoff) and edits bot configs through a cross-process lock. `GET /api/daemon` (status + digest), `POST /api/daemon/arm|disarm` (this computer only).
- **Docker:** `Dockerfile` + `docker-compose.yml` (non-root, read-only root FS, `cap_drop: ALL`, UI published on the host's 127.0.0.1 only, restart policy + health check).
- **Phone pairing — `python serve.py --lan`:** listens on the LAN with a per-launch pairing secret; prints a terminal QR code (self-contained encoder, verified by an independent decoder in the tests) and serves `/pair.svg` on the computer only. Hosts are limited to private / Tailscale IPs and `*.ts.net`; a phone without the secret gets 403.
- **Mobile CSS:** the uncommitted second inline `<style>` block was blocked by the strict style CSP (it never applied and logged a CSP error on every load); its safe rules moved into `style.css`, the layout-forcing `display:flex !important` overrides were dropped.
- Tests: `v170.test.js` (52), `v17_ops_test.py` (32), `v17_daemon_e2e.py` (12, real processes), `v170_e2e.js` (15, Chrome).

### 1-click reach, zero clutter
- New one-line **Reach strip** under the navigation (≤ 30 px, horizontally scrollable on narrow screens, hidden on phones in favour of the dock): **Stocks · Crypto · On-Chain · Options · Futures · Screener · Pulse · 3D · Bot Fleet · Quant Lab · AI Bridge · Academy · Live Tape · Whales $25K+ · Tracker · Positions · Briefing**, each one click. Nothing new is drawn over the chart canvas except thin level lines from a cached layer.
- **Fixed:** choosing another market while the first On-Chain visit was still loading trending pools snapped the app back to On-Chain when the load finished (`setMode` now cancels a superseded first visit).

### Phase 2 — Quant Lab Edge-Coach (`src/v170pro.js` maths, `src/v170app.js` UI, top of the Lab tab)
- Round trips from any fill list (FIFO, partial exits, fee split); per-trade **MFE / MAE** with exit capture %; **4 h post-exit Shadow Counterfactuals**; **hour × weekday win-rate heatmap** (UTC).
- **Walk-Forward Overfitting Score (0–100)** from four anchored IS / OOS folds (Sharpe decay, IS-up / OOS-down flips, return decay, OOS dispersion) with a grade (Robust · Moderate · Fragile · Curve-fit).
- **Prop-Firm Challenge simulator** ($50K / $100K / $200K: 8% target, 5% daily loss, 10% max DD, 30 days), seeded Monte Carlo over the strategy's own trade returns.
- **0.5×–3.0× ATR SL / TP R:R heatmap** (6 × 6 expectancy in R + win rate); clicking a cell applies that SL / TP to the chart. **Quarter / Half / Full Kelly** sizer; **0–50 bps slippage re-sim**.
- **OHLCV CSV import** (runs the last strategy, or EMA crossover, on the file), **Pine Script v5 inline linter** (version header, study → indicator, security → request.security, missing `ta.` namespace, `transp=`, `iff()`, `input(type=…)`, `:=` before `=`, unbalanced brackets, indentation), **Obsidian / Gold tear-sheet** export (self-contained HTML, no scripts), **Send Backtest Leaks to AI Coach** (ranked leaks + prompt, also copied), **sanitized `.exterm.json` playbooks** (keys, secrets, wallets, URLs, addresses and `__proto__` are stripped on export and import).

### Phase 3 — canvas, Bot Fleet, Briefing, GEX, DOM, workspaces
- **2-layer canvas:** chart additions render into an offscreen layer that repaints only when its dirty flag is set; cursor-only frames are one `drawImage`. Idle scheduler tick < 0.002 ms; **O(1) spatial-hash hit-testing** shows the level under the cursor.
- **Bot Fleet tab:** No-Bot gate + demo bot; **Paper Sandbox / Attended Co-Pilot (1-click approve queue) / Live Unattended 24/7**; mandatory **5-step arming wizard** (acknowledgement · zero-overdraft settled-cash cap · max slippage 1–100 bps · daily loss kill-switch ≤ cap · typed `ARM LIVE BOT`); every live order passes the cap / slippage / kill-switch guard and is HMAC-SHA256 signed to a `127.0.0.1` / `localhost` URL only. `Float32Array` **Neural Strategy Torus** (rAF, drops to 0 fps when the tab or window is hidden) and a seeded **Self-Improving loop** (hill-climb scored on out-of-sample Sharpe minus overfitting).
- **Morning Briefing:** opens once per new day (and from the ☀ Briefing header pill): previous-day high / low / close, overnight high / low (stocks), floor pivots, movers, FOMC day flag, paper equity, 7-day history, **1-Click Plot All Morning Levels**.
- **Live GEX** flip / call wall / put wall from Deribit option OI for BTC / ETH / SOL (Black-Scholes gamma), a labelled model chain otherwise; lines on the chart (toggle). Collapsible **DOM Spoof Ladder** (walls ≥ 5× the median pulled within 3 s without trading there). **6-TF Confluence** pill (1m · 5m · 15m · 1h · 4h · 1D, from loaded data only).
- **Options:** multi-leg builder (bull call spread / iron condor presets), payoff at expiry, 1σ / 2σ cone, breakevens, aggregate Greeks. **Futures:** RTH / ETH volume profile (POC / VAH / VAL, New York session), tick-risk calculator (ES, MES, NQ, MNQ, YM, RTY, CL, MCL, GC, MGC, ZN, 6E), crypto liquidation clusters (estimate). **On-Chain Lab** (Screener): rug / honeypot constant-product sell simulation with tax and authority flags, block-0 sniper-bundle bubble map, smart-money leaderboard; Rug Shield badges on Discovery rows. **Stocks:** SEC filings strip (10-Q / 10-K / 8-K dates, estimated next earnings, Form 4 count) through the launcher proxy.
- **Pulse tab** (no extra network calls): breadth, leader / laggard, **last-12 CPI / FOMC reaction backtester** (FOMC dates built in; add CPI dates), **Portfolio Beta Shock** (−10% ↔ +10%), **Bull / Bear / Risk debate** from on-screen data.
- **3D tab:** volumetric order blocks + L2 wall fusion + replay scrubber. **2×2 multi-chart sync**, **R:R ruler**, **NET BE** line (fees + slippage), **smart trailing stops** (ATR × 3, swing, break-even at +1R; only ever tighten), **voice commands** (`Shift+V`; tabs, symbols, timeframes; orders are staged, never sent).

### Phase 4 — Academy
- Academy tab: five modules × three missions over the v17.0 tools on a separate $100K paper mission account; missions tick as the tools are used. **Custom Drill Generator** targets the most frequent tag on losing journal entries.

### Phase 5 — languages, polish, mobile, Android
- **First-launch 10-language picker** (EN · ES · ZH · JA · KO · FR · DE · PT · AR-RTL · HI) saved in IndexedDB and restored if localStorage is cleared. It is the v15.2 gate (browser-language pre-select, fuzzy search, 150+ fallback languages) showing only the 10 featured languages until you type; the full list stays one click away on 🌐.
- Obsidian / Gold: tabular numerals everywhere, 34 px primary / 28 px sub-tabs, inline depth bars, two-line Discovery names with Rug Shield badges, **Hide Balances** (`$***,***`).
- **Mobile < 820 px:** 5-tab bottom dock, floating thumb-arc pill (Buy · Sell · Snipe CA · Swap), swipe watchlist, landscape split, left / right-handed, sizing keypad, clipboard CA snipe, 1-tap Phantom / Solflare / Jupiter / Uniswap deep links (ExTerm adds a $0 fee), QR pairing of the layout (watchlist, timeframe, language; no keys or balances), AMOLED `#000000`, PIN (PBKDF2-SHA256) or WebAuthn biometric lock, Share Setup Card, Picture-in-Picture.
- **`ExTerm-v17.0-android.apk`** (minSdk 24, targetSdk 34): WebView on a secure asset origin, external deep links, Picture-in-Picture; built without Gradle by `tools/build_apk.py`; CI: `.github/workflows/build-android-apk.yml`. QR encoder supports versions 1–25 (decoded by OpenCV in verification).

### Phase 6 — verification
- `v170.test.js` 112 checks (the original 52 + 60 for Phases 2–6), new `v17pro_e2e.js` (33 browser checks, desktop + fresh first launch + phone), `tools/capture-screens.js` (14 screenshots at 2×). Every browser suite runs one at a time in its own headless Chrome, closed afterwards.

## v16.6 — 240 Hz Typed-Array Live Transactions Tape for Stocks, Crypto & On-Chain / DEX — 18 Nov 2026

### Default-open tape + bottom telemetry dock (v16.6 refresh)
- The Live Transactions drawer is **open by default** on Markets for Stocks, Crypto and On-Chain / DEX: a 230 px in-flow panel (the chart shrinks above it instead of being covered), tabs and filter chips on one row, collapsible with a gold **▾ Hide Tape / ▴ Live Tape** toggle (remembered only when you hide it).
- The bottom status bar became an Obsidian (`#07080B`) & Bullion Gold (`#F5C84B`) **telemetry dock** on every tab: position / Cash readout on the left with quick-dock chips (Live Tape · Whales ($25K+) · Tracker · Positions · 3D Depth · AI Bridge), live BTC · ETH · SOL · SPY pills and the active symbol's tape flow delta on the right. The v16.3 Micro-Ticket stays docked under the chart.
- README rebuilt as an Obsidian & Gold showcase with a 3D-beveled hero banner, gold divider and six section-header SVGs in `assets/`, and fresh screenshots in `screenshots/`.

### Tape engine (`src/v166core.js`)
- One 2,000-print ring per symbol: `Float64Array` (ts, price, size, total USD) + `Uint32Array` (side bitmask, venue / maker id). O(1) ingest, no per-print allocation; three isolated markets (stocks · crypto · onchain) with their own ring maps and venue tables, up to 32 rings each (least-recent evicted, never the symbol on screen).
- Classification bits at ingest: Buy · Sell · Whale ($25K+) · Block ($100K+) · Sweep (≥ 3 same-side prints ≤ 1 s apart walking the price) · Unusual (> 3× the buffer average) · 1-minute aggregate; Tracked follows a live venue / maker set. Allocation-free bitmask filter (newest first, side chips OR, others AND, min USD) measured well under 1 ms over 2,000 prints.
- Pressure maths (buy / sell $ and %, net whale / block flow, average print), sub-tab aggregations (holders by net, top traders by gross, earliest, DCA = one-sided ≥ 3 prints with ≤ 25% size variation) and the AI Bridge tape export.

### Live Transactions drawer (`src/v166.js`, `src/style.css`)
- **Tape** toolbar button opens a bottom drawer on Markets: pressure strip, session label (LIVE 24/7 · venue / DEX SWAPS · makers / LIVE TAPE / **LAST SESSION TAPE** / SIM TAPE), 8 sub-tabs, 8 filter chips + min USD, and a 22-row pooled virtual list (rows keyed by print sequence, written with `textContent`, re-filtered at most 30×/s from one `requestAnimationFrame` loop that only runs while the drawer is open).
- Hover auto-pause with a gold Paused pill (the snapshot stays frozen while prints keep arriving), manual Pause / Live, click-to-pin gold chart markers, Copy Tape for AI (also lands in the AI Bridge preview), track / untrack any maker or venue.
- Feeds: every `Feed.trade` print (exchange WebSockets incl. the Coinbase / Kraken / Binance failover, DEX swaps with makers, the launcher's 500 ms swap tape) plus stock last-sale volume (1-minute bars) from the launcher's Yahoo proxy.
- Optional **Stock boost**: your own Finnhub token or Alpaca key streams every stock trade (`wss://ws.finnhub.io` or `wss://stream.data.alpaca.markets/v2/iex`, tick-rule side). Keys stay in sessionStorage for the tab only; while the stream is live it replaces the 1-minute prints so volume is never double counted.

### Launcher (`serve.py`)
- Version 16.6.

### Tests
- `test/v166.test.js` (46 checks: ring layout, classification, filter speed + correctness, per-frame cost, market isolation, pressure, sub-tabs, AI export, boost parsers, static wiring, CSP, XSS, privacy) and `test/v166_e2e.js` (34 checks against `serve.py`: Stocks, Crypto and On-Chain / DEX drawers, 8 sub-tabs, every chip, hover pause, pins, Copy Tape for AI, LAST SESSION TAPE, zero page / console errors). Older build-order, briefing and version checks accept v16.6.

## v16.5 — Universal AI Bridge (Grok, ChatGPT, Claude, DeepSeek, Ollama & Custom Bots), AI-Vetted Zero-Custody Copy-Trading & Share Setup Card — 17 Nov 2026

### AI Bridge tab (`src/v165core.js`, `src/v165.js`, `src/style.css`)
- New **AI Bridge** workspace tab next to Grok with the banner *Works With Any AI or Bot: Grok · ChatGPT · Claude · DeepSeek · Local Ollama · Custom Python/Node Bots* and three cards.
- **Copy Live Context for Any AI:** provider pills (Grok · ChatGPT · Claude · DeepSeek · Local Ollama · Custom Bot) that change the packet header and answering style, four quick-prompt presets (Chart Setup Check · On-Chain Rug & Whale Audit · Macro Catalyst & Risk Plan · Post-Session Leak Review), a **Token-Saver (~120 tokens)** / **Full Quant** switch and five one-click packets: Chart + Order-Book (price, 1m / 5m / 1h / 4h trend, EMA 20 / 50, RSI, ATR, AVWAP distance, 10 s / 60 s tape delta, liquidity walls), On-Chain Due Diligence (liquidity, FDV, 5m / 1h / 24h volume, holders, top-10 share, mint / LP status, 4h structure), Multi-Symbol Watchlist Comparison (top 5), Options IV / Whale Liquidations and a privacy-masked Session Post-Mortem.
- **Paste & Verify AI Output:** plain-English or JSON trade ideas (`symbol`, `side`, `entry`, `stop_loss`, `tp`; aliases, code fences, thousands separators and up to three targets) are checked for a directional stop and ATR distance, then drawn as **dashed ghost lines** with R:R and $ axis badges (pinned ▲ / ▼ when off screen); **Stage on ticket** puts a long on the chart draft; optional **Auto-Watch Clipboard**. **AI Ticker / Contract Paste-Box** extracts `$TICKER`s, Solana and EVM addresses and drops anything under $50k liquidity, with an active mint authority or without safety data. **Paste & Harden AI Pine Script v5** (v5 header, `barstate.isconfirmed`, `lookahead_off` on every `request.security`, `$ risk` sizing, mandatory `strategy.exit` stop, `strategy.risk.max_intraday_loss`, webhook JSON; idempotent), **1-Click 17-Test Quant Validation** (rules mapped to a safe spec and run through the real validator) and **Copy Failure Diagnostics for AI**.
- **Live 127.0.0.1 AI & Bot Firewall:** endpoint + bridge key, **Apply AI Live Guardrail Profile** (Mandatory Stop-Loss ON · Min 1.5× ATR · ≥ 3× liquidity depth · 75% confidence · 50% size cut after 2 losses · AI Shadow Slot), an **AI Confidence Threshold** slider, ghost-line or armed-slot routing (Slots 1–6, paper fill tagged `ai-bridge`), a receipts table, **Human vs. AI / Bot Execution Attribution** (Manual · Quant · AI Bridge · Copy) and three switchable **~45-line Python starter templates** (Grok xAI · ChatGPT / Claude / DeepSeek · 100% offline Ollama).

### Launcher (`serve.py`)
- `POST /llm-signal`: loopback callers only, browser origins refused, `X-ExTerm-Bridge` key (persisted owner-only in `~/.exterm/bridge.key`, or `EXTERM_BRIDGE_KEY`) or the session token, 60 proposals a minute, 16 KB JSON. A structural firewall (`llm_check`) normalises the proposal and rejects a missing or wrong-way stop, losing-side targets, bad symbols and out-of-range confidence with **HTTP 422 and a signed error receipt**; accepted proposals and `wallet_vet` verdicts get an HMAC-SHA256 signed receipt and are queued in RAM (300 max).
- `GET /api/llm-signal?since=` and `GET /api/llm-signal/key` (session token only) feed the page; `GET /llm-signal` prints a usage hint without the key; `--no-llm-signal` turns it off; the service worker never caches it. Version 16.5.

### AI-vetted zero-custody copy-trading (Whales tab)
- **AI Wallet & Trade Vetting Gate** (approval ≥ 75% via `/llm-signal`) and **Copy Wallet Profile Packet for AI**; **Multi-Wallet Consensus Trigger** (2+ wallets, same token and direction, 5m / 15m / 1h); personal **$ Risk** sizing with a **min 1.5× ATR** stop and TP1 / TP2 / TP3 at 1R / 2R / 3R (whale size ignored); **Anti-Front-Run & Max Entry Drift Shield** (default 2.5% or 1.0× ATR past the leader fill); **Copy Shadow Mode**; exit modes *Mirror Leader Exit · Independent ExTerm Trailing/TP Exit · Whichever Triggers First*; **per-leader daily loss cap with auto-mute**. Every decision is written to the Signed Receipt Ledger with its attribution.

### Sharing
- **Share Setup Card** on the chart toolbar, in the receipt ledger and in the AI Bridge: an Obsidian & Gold 1200×675 PNG (symbol, timeframe, R:R, strategy / AI source, Entry / SL / TP) built from a whitelisted model, so balances, sizes and personal data never reach the image.
- **Copy Shareable Strategy / Watchlist JSON** labelled `Validated in ExTerm (n/17 Gates Passed)` with the real count.

### Tests
- `test/v165.test.js` (76 checks, including the launcher's `llm_check` / `LlmBridge` in Python and the templates compiled with `py_compile`) and `test/v165_e2e.js` (40 checks at 1440×900, English + Arabic RTL, real HTTP POST round-trips to `/llm-signal`, zero console errors). Older build-order, briefing and version checks accept v16.5.

## v16.4 — Chart Precision, DEX Discovery, Structural Strategies, Copilot & Realistic Backtester — 17 Nov 2026

### Chart precision (`src/data.js`, `src/v164core.js`, `src/v164.js`, `serve.py`)
- **Zero-volume bar re-anchoring** in the core `CandleStore` rollover (`applyTick` and worker `applyAgg`): a forming 1s–15s bar that saw no trade and no price change moves to the new bucket in place, so no flat `Vol 0.00` bar is left behind on crypto, stocks, on-chain, options or futures. Quote-driven bars that moved keep their slot; quiet buckets are never back-filled.
- **Full-depth on-chain candles:** GeckoTerminal OHLCV pages up to `limit=1000` (also in the launcher's background bots); 30m (15m × 2), 12h, 1w (1d × 7) and 1M (1d × 30) are aggregated from the nearest native unit instead of falling back to hourly bars; young tokens fit the viewport edge-to-edge and the previous zoom returns when you leave them.
- **Multi-exchange stream failover:** when the primary crypto trade stream stalls for more than 1.5 s, the selected market switches to the next public stream (Kraken · Coinbase · Binance) and back once the primary resumes; a toolbar pill names the active stream.
- **500 ms DEX swap tape:** `GET /api/swaps?sym=oc:<chain>:<pool>&since=` answers from RAM; one background fetch per pool refreshes from GeckoTerminal at most every 4 s; swaps are de-duplicated by transaction hash on the server and in the page, and are injected only while the regular on-chain trade feed is quiet.
- **⚓ AVWAP** chart-toolbar tool (click a candle, session open, last swing low / high; off-screen label pinned with ▲ / ▼) and a **tape-delta + book micro-imbalance strip** (10 s / 60 s aggressive buy share and $ delta).

### DEX tab Discovery (`src/v164.js`, `src/v164core.js`, `src/style.css`)
- Scanner, Tiles (RVOL + spread badges, sparklines), Bubbles (Market Cap · Volume Surge · Whale Net Flow · Volatility Squeeze, gravity clusters by tier / sector / chain, hover tooltip) and Buy Pressure (5m / 15m / 1h taker share and net $ delta) on one dataset.
- **Strict market-mode isolation:** every row carries its market and is filtered by the top market pill (On-chain → DEX tokens only, Stocks → US equities only, Crypto → crypto pairs only); the classic heat-map views follow the same pill.
- GMGN-style **filter drawer** (chain and DEX pills, min / max liquidity, market cap / FDV, 5m / 1h / 24h volume, token age, holders, buy / sell ratio, strict safety toggles), presets (New Launches · High-Liquidity Breakouts · Smart-Money Accumulation), unified pills (All · Top Movers · Volume Surges · groups), Top Movers rail with Pin, `/` search, ↑ / ↓ / Enter / P keys, `Shift+Click` bracket draft, **Export Filtered Basket → Quant Lab** (≤ 10, mode-pure) and a **3D Orbit** jump.

### Strategies, Copilot and research (`src/v164core.js`, `src/v164.js`, `src/v160.js`, `build.py`)
- **6 structural strategy specs** (pack 5): Opening Range Breakout, Anchored VWAP Pullback, Volatility Squeeze Expansion, Liquidity Sweep and Failed Breakdown Reversal, Regime-Filtered Z-Score Mean Reversion, Funding-Rate and Perp Basis Divergence (a crowded-long proxy, described as such). Registered in the page and the backtest worker, 17-test graded, Pine-exportable, launcher-parity safe.
- **Safe Pine Script v5 template library** (confirmed bars, `lookahead_off`, $ risk sizing, `strategy.exit` stop, `max_intraday_loss`, `127.0.0.1` webhook JSON) with a rule checker.
- **Quant & Execution Copilot** (AI tab, no API key): Analyze Active Chart, plain English → safe strategy spec + Pine v5 + 17-test validation, Pre-Trade Setup & Stop-Loss Auditor (ATR, R:R, correlation), receipt-ledger leak detector, action pills.
- **Strategy Studio Pro** (Lab): drag-and-drop node builder, 17-test validation, backtest, replay trades on the chart, Pine / Python / Node export (standalone bots print signals with a stop on every entry), depth-aware square-root slippage, ≤ 10-symbol portfolio with correlation matrix, Flash Crash / FOMC / Thin Weekend stress, walk-forward rolling out-of-sample decay; Shadow Drift Monitor, Regime-Aware Auto-Switcher (only while flat) and the **Multi-Slot Strategy Router** (`V160UI.slotFor`, default Slot 6).

### Fixes & housekeeping
- The launcher's update check and `upload-to-github.bat` point at `uexxx/ExTerm`.
- Copilot reads the candle store when the Markets chart is hidden.
- Legacy product-name mentions removed from docs and comments; the original browser storage keys stay so nobody loses saved data.

### Tests
- `test/v164.test.js` (73 checks: real `CandleStore` rollover, strategies through the real engine and 17-test validator, exported bots executed in Node and Python, `SwapTape` in Python) and `test/v164_e2e.js` (53 checks, English + Arabic, 1440×900). Older build-order checks accept the v16.4 modules.
## v16.3 — Closed-Loop Live Cockpit, Live-Execution Precision & Active-Tick Candles — 17 Nov 2026

### Live-execution precision (`src/v163core.js`, `src/v163.js`, `src/v157.js`, `src/v160.js`, `src/v161core.js`)
- **Require Stop-Loss on All Live Opening Orders**, ON by default: a long stop must sit below entry and a short stop above it. Closing orders and `CANCEL_ALL_AND_FLATTEN` are never blocked. Turning it off shows a warning.
- **$ Risk → exact quantity** sizer (fees included, floored to the lot step, capped by cash), **R:R + $ P&L badges** while dragging Entry / SL / TP, a one-click **BE** pill, **Auto-BE on TP1** and a TP1 50% / TP2 30% / TP3 20% scale-out.
- Chart: bid/ask spread tunnel on 1s–1m, order-preview ghost lines, Alt + drag magnetic snap to high / low / VWAP, trailing-stop activation and step lines, fill markers with slippage in bps and ticks.
- Ticket: time-in-force **GTC / IOC / Post-Only** (Post-Only refuses a crossing price, IOC cancels the unfilled rest) and hotkeys `Shift+B` / `Shift+S` / `Shift+X`.
- Core risk guards on every live opening order, registered in the v16.0 router: order-book depth `≥ 3×` within 0.5% of mid, **Stale-Quote Freeze** (5 s crypto · 20 s stocks · 90 s on-chain), **Max Trades-Per-Hour**, global 6-slot exposure cap, **Drawdown Throttle** (50% size after 2 losses in a row), correlation guard (`r > 0.85`), thin-hours spread tightening and Auto-Disarm on Idle (`Off (24/7) | 15m | 30m | 60m`). Locked while armed.
- **Active-tick sub-minute bars**: a quiet tick (no price change, no volume) never appends a flat O=H=L=C bar; seeded windows drop flat filler bars and re-chain open = prior close.

### Closed-loop live cockpit (`src/v163core.js`, `src/v163.js`, `src/v160.js`, `src/v162.js`, `src/v151.js`, `src/style.css`)
- **Floating Live Execution HUD** while armed: `LIVE ARMED · Slot # · ping ms · Day P&L vs -$cap` (amber at 50%, red at 80% of the cap), a 44px equity & drawdown sparkline, and a market-close / next-open (stocks) or 8-hourly funding (crypto) countdown pill.
- **Pause New Entries (Keep Exits Active)** (HUD button or cockpit toggle; logged in the ledger) and a **cooldown countdown** inside the disabled Buy button (`Cooldown: 11m 42s`).
- **Focus Chart** (`F`, reuses the rail collapse and declutters the toolbar), docked **Micro-Ticket** strip (drives the normal ticket, so every guard applies) and a **Live Position & Pending Orders Drawer**: `Close 50%`, `Flatten`, `Reverse Position` (opens the opposite leg with a stop on the other side, through a cockpit short book that routes like a manual order), `Close Losing Legs`, `Close Green Legs`, `Flatten All`, cancel pending limits / stops, bot position next to each paper position (`in sync` / `drift`).
- Chart: **Scale-In / Pyramid** ghost line (add N% @ price → blended entry), **Fee & Funding / Borrow** drag line, liquidation line. Ticket: **Chase Limit** with peg-to-best-bid/ask (optionally 1 tick inside; also re-pegs resting limits placed while pegged), a **Liquidation & Margin Buffer** pill (warns under 15%, flags a stop beyond liquidation) and **Copy Trade Setup**.
- Watchlist **Signal Readiness** dots (EMA 20 / 50 cross in the last 3 bars, or within 0.15%), acoustic + visual cues on fills, blocks and triggers with instant mute, and a **privacy-masked trade card** on close (R, %, holding time; no size or account value) saved as a 1200×675 PNG.
- **Two-way bot sync:** a receiver reply `{ ok, ack, fill: { price, qty, ts, order_id } }` is accepted only when `ack` equals the packet's idempotency key; fills update the bot position, a **slippage & fill quality by symbol** table (avg bps, avg ACK ms) and a `fill` ledger row. **Heartbeat latency & packet-success graph** per slot.
- **Local broker starter bridges** (~40 lines of Python each, loopback only, signature + replay checks, secrets from the environment): Interactive Brokers, Alpaca, CCXT, Freqtrade. Copy or download `.py`.
- **Per-slot asset & ticker allowlist**, **Time-in-Trade auto-exit**, **Price Alert → Conditional Trigger** (one-shot, buys carry a stop), **EOD Flat Timer** for equities / futures (5–30 min before the US close), **Encrypted Session Recovery Snapshot** (PBKDF2-SHA256 200k → AES-256-GCM; passphrase held in memory only, auto-save every 60 s once set).
- **Hardware-Style Two-Key Arming** (optional): `Shift + Alt + A` turns key 1, Arm must follow within 10 s. Plain `Alt + A` still opens Auto-Setup.
- **3-Second Live Readiness Self-Check**: pings every enabled slot (3 s timeout) and checks Require Stop-Loss, the daily-loss cap, quote freshness, cooldown and spread; READY / NOT READY with a ledger row.
- **Reset Session Safety Counters**, available only when disarmed in PAPER: zeroes guard stats, the hourly rate window, heartbeat misses, the loss-streak cooldown, the drawdown-throttle window and the daily-loss baseline, with a `reset` ledger row.
- Launch Safety & Critical Updates briefing lists the v16.3 highlights. `body.live-bot-armed` also hides the live-trades tape. The HUD, drawer and card mirror in RTL.
- `V160UI` gains `post` (ACK + fill listeners), `hbL` (heartbeat listeners) and `manual` (extra accounts routed like manual orders).

### Fixes
- First-run tour (`src/v13.js`): a step whose target sits below the fold (the taller v16.3 ticket pushes the Perps panel down) now scrolls it into view, and the tour card is clamped inside the viewport.
- v16.3 inputs and selects in the Execution Bridge use the standard input style.

### Tests
- `test/v163.test.js` (123 checks) and `test/v163_e2e.js` (60 checks, English + Arabic, 1440×900, real signed receiver on 127.0.0.1 that replies with fills). The v16.2 briefing check accepts the v16.3 highlights; the v15.7 cold-switch check expects real (non-filler) 5s / 10s bars. Full regression (`test/run-all.ps1`): every unit, launcher and browser suite passes.

## v16.2 — Universal Timeframes, True-Form Candles, Auto-Flatten & Live-Only Mode — 17 Nov 2026

### Timeframes & candles (`src/core.js`, `src/app_a.js`, `src/data.js`, `src/charts.js`, `src/v162core.js`)
- `1w` and `1M` join the timeframe list on every market (aggregated from daily bars; `1M` uses 30-day buckets). Quick pills: `1s 5s 10s 15s 1m 5m 15m 1h 4h 1d 1w`; the rest sit behind `⋯`.
- Stock and on-chain `1s` / `5s` / `10s` / `15s`: `TFX.seedHist` back-populates the full window from 1-minute OHLCV via `V162.seedSub` (open → extremes → close path per minute, deterministic, bridged multiplicatively so the last close equals the live price, at any decimal precision). Real tick bars replace seeded ones; every bar opens at the prior close. Outside US regular hours the window ends at the last session bar.
- Sub-minute charts keep a minimum y-axis span of 0.20 % of price (`V162.minSpan`).
- `MARKET CLOSED · LAST SESSION` badge next to the feed pill for US equities outside regular hours.

### Safety (`src/v162.js`, `src/v160.js`)
- Launch Safety & Critical Updates briefing on every fresh start (PAPER or armed): zero-custody `127.0.0.1` routing, the 5-Point Live Safety Checklist and release highlights. Continue in Safe Mode (PAPER) / `Esc` keeps PAPER and disarms an armed session; Open Execution Bridge & Safety Settings opens the bridge. Focus-trapped dialog. The daily Morning Brief waits until it is closed.
- Max Daily Loss ($) auto-flatten: checked every second while armed; at or beyond the cap, `CANCEL_ALL_AND_FLATTEN` is broadcast through the existing kill path, all six slots revert to PAPER, a `daily-loss` breaker row is added to the receipt ledger and an alert dialog opens. Portfolio shows a live loss gauge while armed.
- Live-only workspace: `body.live-bot-armed` hides Tick Replay, paper resets, Auto-Evolve, Crisis Time Machine, synthetic stress, walk-forward / Monte Carlo, the 3D Profit Mountain, Backtest Style and Learn drills (with a paused-drills banner) until disarmed.
- `V160UI` now exposes `dayLoss`, `live` and `led` for the breaker.

### Tests
- `test/v162.test.js` (57 checks) and `test/v162_e2e.js` (35 checks, English + Arabic, 1440×900, real signed receiver on 127.0.0.1). Older build-order checks accept the v16.2 modules.

## v16.1 — Chart Click/Drag Trading, Measure Ruler & 8 Bot Security Engines — 16 Nov 2026

### Chart (`src/v161core.js`, `src/v161.js`)
- `chart.priceToY` / `chart.yToPrice` / `chart.idxAtX`: one exact mapping for clicks, line drags, menus and the ruler, on every timeframe (`1s` … `1h`).
- Dragging the draft Entry / Stop-Loss / TP lines keeps the order ticket (limit or stop price, SL %, TP %) in step; live `$` / `%` readouts update during the drag.
- ExTerm Chart Context Menu on right-click (the browser image menu is suppressed on the chart): Place Buy Limit / Stop, Place Sell Stop / Limit, Set Price Alert, Drop Horizontal Level, Anchor VWAP Here, Start Tick Replay From Here, Explain Price Move Here (AI Forensics), Measure Dragger, Reset Chart Scale, Copy Price. Original SVG icons, edge flipping, arrow keys, `Esc` / outside-click close. TP-rung right-clicks still open the step-ladder menu.
- Precision Measure Dragger (`Shift` + drag or the Measure toolbar toggle): a gold (up) or crimson (down) zone with Δ$, %, bars, elapsed time and cumulative volume in tabular figures, drawn on a pointer-transparent top canvas, so the candle layer is not redrawn for it. Measure gestures are captured on the chart host, so `Shift` + drag never pans the chart and never grabs an order line.
- Non-interactive chart overlays are `pointer-events: none`.

### Bot security & fail-safes (`src/v160core.js`, `src/v160.js`, `src/v161core.js`)
- Envelope v2: UUID `idempotency_key`, `expires_at_ms = ts + 3000`, `kdf: session-v2`; signed with an ephemeral session key `HMAC-SHA256(slot secret, "ExTerm-session-v2|" + session)` that rotates on every boot and every arm. `V160.verify` adds `expired` and nonce-cache `replay` rejection; `V160.NonceCache` is a bounded, time-limited rolling cache. The sender never reuses a key, and a reply whose `ack` does not match is a failure.
- Test Signal Payload (Dry-Run) on each of the six slots: a signed `dryrun` packet with `dry_run: true`, the full signed JSON shown, and the receiver acknowledgment checked.
- Dead-Man's Switch: three missed heartbeats, or no successful heartbeat within 3 × 15 s + 10 s (watchdog), auto-disarm to PAPER.
- Signal Firewall: schema validation (finite numbers, symbol pattern, known action, positive size, stop-loss below entry) and the Max Single-Order Notional $ cap on opening orders.
- Execution Shield: opening orders are held while the bid-ask spread (from the live quote or the last order book) is above the configured ceiling.
- Tilt & Drawdown Guard: `N` consecutive losing closes pause live routing for 15m / 1h / 24h from the last loss.
- Flatten All & Disarm (`Ctrl+Shift+K` and a panel button): a signed `CANCEL_ALL_AND_FLATTEN` goes to every armed slot (built with mode `live`), then all six slots lock to PAPER. It replaces the v16.0 `disarm` packet.
- Signed Receipt Ledger: every signal, heartbeat, breaker trip, arm, dry-run and kill event, with timestamp, idempotency_key and HMAC-SHA256 signature; persisted (1,000 rows) with JSON / CSV export (formula-safe).
- Fail-safe settings (notional, spread %, loss streak, cooldown) are sanitised on load, fall back to conservative defaults ($10,000 · 0.5% · 3 · 1h) and are frozen while live.

### Journal
- Discipline Attribution card: closed trades are tagged Followed Plan / Moved Stop Wider / Over-Size Risk / Early Exit against the plan recorded at entry, with net $ for disciplined trades vs. rule violations and per tag.

### Launcher
- `/hook` gateway (`serve.py`, `serve.ps1`) forwards only to `127.0.0.1` / `localhost` (never the launcher's own port), or to a private-LAN `https` host:port listed in `EXTERM_HOOK_ALLOW`. The legacy third-party bot-service allowlist is removed, and the in-app webhook fields now accept local endpoints. Launcher version 16.1.

### Tests
- `test/v161.test.js` (41 checks): idempotency keys, TTL, session-key derivation and rotation, anti-replay cache, firewall, spread breaker, cooldown, ledger CSV / JSON, discipline tags, measure maths, menu flipping, static CSP / privacy checks.
- `test/v161_server_test.py` (6 checks): localhost-only webhook gateway.
- `test/v161_e2e.js` (60 checks, 1440×900, English + Arabic) against a receiver that verifies the session key, TTL and idempotency nonce and echoes `ack`: covers chart hit-testing on 1s–1h, ticket sync while dragging Entry / SL / TP, every context-menu action, edge flipping, Shift + drag, all eight fail-safe engines, Journal attribution, v15.1–v16.0 regressions and zero page errors.
- v15.6 / v15.7 / v16.0 build-order assertions accept the v16.1 modules. The v16.0 e2e expects the per-session seq and the `flatten` packet.
## v16.0 — 6 Local External Bot Bridges & Multi-Gate Live Safety System — 16 Nov 2026

### Bridges (`src/v160core.js`, `src/v160.js`)
- Six original local adapter slots in the Grok tab (Execution Bridge panel) with a status card in Settings: Local Python / Node Script Runner, Standard JSON Webhook Relay, Low-Latency Socket / IPC Bridge (WebSocket), Perp DEX Local Wallet Signer, Equities / Futures Local Gateway, Graduated Shadow-to-Live Mirror (mirrors one promoted Quant Lab / Shadow bot only).
- PAPER / SIMULATION on every fresh install; paper fills are logged as simulated routes and nothing is sent.
- SSRF guard (`V160.checkUrl`): loopback only, or an allow-listed private-LAN `host:port` over https / wss; no credentials in URLs, no other schemes; requests use `redirect: 'error'`, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`.
- HMAC-SHA256 envelopes (`{payload, sig}` text/plain, no CORS preflight) with per-slot 32-byte secret, per-session nonce, timestamp and rising sequence number; `V160.verify` documents the receiver checks (signature, 30 s freshness, replay). Each slot shows its receiver schema and a Python stdlib sample receiver.
- Per-slot heartbeat latency (ms); three missed heartbeats on an armed slot revert to PAPER.

### Live safety
- Live External Execution stays disabled until four gates pass: fresh 127.0.0.1 heartbeat, all three circuit breakers (Max Daily Loss $, Max Risk Per Trade %, Max Concurrent Positions), non-advisory disclosure, exact phrase `ARM LIVE BOT`. Only healthy slots go live; configuration is frozen while live.
- Circuit breakers check every opening order (daily loss, open positions, risk % of equity from the stop distance, or full notional without a stop); closing orders always pass.
- Saved state is sanitised on load: anything inconsistent (no disclosure, no caps, missing secret, non-local URL) loads as PAPER.
- Boot / reload with a live bot armed opens the Live External Bot Connected briefing (slot, endpoint, live heartbeat, caps, non-advisory reminder); signals are held until Acknowledge & Continue Live or Disconnect & Revert to Paper.
- LIVE BOT ARMED top-bar pill; `Ctrl+Shift+K` kill-switch (captured before the Ctrl+K palette) reverts all six slots to PAPER and sends each receiver a signed `disarm`.

### Build
- CSP `connect-src` adds `ws://127.0.0.1:*` (plain http / ws stay loopback-only); `default-src 'none'` and the SHA-256 script / style pins are unchanged.

### Tests
- `test/v160.test.js` (42 checks): slots, SSRF guard, RFC 4231 HMAC vector, tamper / stale / replay rejection, the four gates, arm / kill, state sanitising, circuit breakers, static CSP / privacy / brand checks.
- `test/v160_e2e.js` (36 checks, 1440×900, English + Arabic) against a real HMAC-verifying receiver on 127.0.0.1: gate-by-gate unlock, signed live signals, circuit-breaker block, reload briefing with both actions, Ctrl+Shift+K, chart context menu + measure ruler, v15.1–v15.7 regressions, zero page errors / CSP violations.
- v15.6 / v15.7 build-order assertions updated for the v16.0 modules.

## v15.7 — Sub-Second True-Form Candles & 3D Functional Analytics — 16 Nov 2026

### Candles (`src/v157core.js`, `src/v157.js`)
- New `10s` timeframe (`NT.TF`, timeframe buttons).
- Every live trade is folded into a per-market `Float64Array` ring of 900 one-second OHLCV slots (15 minutes, no per-tick allocation; late ticks for a closed second are dropped). A market whose ticker updates arrived before its first trade restarts its ring on exchange time.
- A new 1s / 5s / 10s candle store is seeded synchronously from the ring (`getStore` wrapper); the existing history load still merges behind it. Rollup keeps open = prior close and fills quiet buckets with flat bars.
- On 1s / 5s / 10s candle bodies are at least 4px wide with a 2px gap (`V157.body`, visible bar count capped at plot width ÷ 6) and at least 2.5px tall, rounded to whole pixels. Other timeframes keep the previous geometry.

### 3D views (`src/v157.js`, pure canvas, no WebGL, no external code)
- Order-Book Liquidity Terrain and Options IV & Gamma Surface in Flow (mounted beside the desk body so its 1 s re-render never resets them), Correlation & Regime Orbit in World, Quant Lab Profit Mountain in Lab step 2, Whale & Liquidation Cluster Orbit in Whales.
- Drag or arrow keys rotate, Home / Reset Angle restores the view; orbit views auto-rotate after 4 s idle.
- One rAF loop draws only visible, changed views; hidden tabs, off-screen panels and background tabs draw nothing (IntersectionObserver + `document.hidden`).
- Modelled inputs are labelled in each caption (book depth without a live book, expiries beyond the loaded chain, whale positions without expanded traders).

### Tests
- `test/v157.test.js` (32 checks): ring, rollup vs direct aggregation, wrap-around, < 2 ms rollup, candle geometry, projection, IV/gamma surface, plateau score, correlation, static CSP / privacy checks.
- `test/v157_e2e.js` (35 checks, 1440×900, English + Arabic): cold 1s / 5s / 10s switch under 10 ms from RAM, candle bodies ≥ 4px × 2.5px with gaps, O(1) indicator patching, all five 3D views render / rotate / reset, zero frames while hidden, v15.1–v15.6 regressions, zero page errors or CSP violations.

### Docs
- `SECURITY-AUDIT.md`: chain-specific wording replaced with neutral terms.

## v15.6 — Visual Minimalism & 240Hz Engine Speed — 16 Nov 2026

This release also ships the v15.5 screen restructures (`src/v155s.js`) listed under v15.5 below.

### Visual minimalism (`src/v156.js`, `src/style.css` v15.6 layer, all under `body.v156`)
- Tonal surface elevation replaces nested 1px borders: `#0B0E14` canvas → `#111620` panels → `#181F2E` active cards, with 20px gaps between the Markets columns. Themes with their own palette (Cyber, Gold Rush, Arctic, Synthwave, Aurora, Ocean) derive the same three steps from their colours.
- A strict 3-size type scale: 18px bold primary figures, 13px active labels, 11px muted metadata (browser-tested across Markets and the nav).
- One-word top tabs in English (Markets · Flow · DEX · Whales · Lab · Grok · Journal · Learn, plus Bots, Portfolio, Social, Workspace, Challenges, Copilot, World, Settings, Help); the full name stays in the tooltip, and the other 31 languages keep their translated labels.
- 4px scrollbars, transparent until the scroll area is hovered.
- Chart-first ambient dimming: hovering the price chart fades the watchlist and order ticket to 78% opacity; hovering a panel restores 100%.
- The chart toolbar stays on one row in every language: the indicator-chip strip scrolls sideways instead of wrapping (Arabic at 1440 px used to wrap Replay onto a second row).
- Settings panels no longer replay their entrance animation every time the 4-tab organiser re-parents them.

### Rows
- 44px sparklines: the Watchlist's own candle sparkline moves into a 44px column and replaces the % column; DEX table rows get one beside a shorthand price.
- Shorthand figures (`$1.43M`, `+48.2%`, `$0.0₅48`) with the exact value in the `title` tooltip, in the DEX table and the Perp Leaderboard.
- One badge per row (Alpha pill on the leaderboard, safety grade in the DEX table; the score moves into the grade's tooltip).
- Hover-only row actions on the leaderboard and the Whales / DEX / Social tables (visible on keyboard focus and on touch screens).

### One inspector rail
- DEX Token Audit, Whale Trader Detail and the new 0DTE strike Greeks share one right-hand rail (same width, surface and slide-in) and replace each other.
- Perp Leaderboard: a whole-row click (or Enter on a focused row) opens the trader; while it is open the leaderboard docks beside the rail, so the filter strip is never covered.
- 0DTE gamma chart: clicking a strike bar opens Delta, Gamma, Theta / day, Vega / vol point, IV and open interest for that strike's call and put (`V156.greeks`).
- The page-level rail closes when you switch tabs, so it never covers another screen.

### Engine (`src/v156core.js`)
- O(1) latest-bar chart indicators: the feed's per-poll `set()` keeps the indicator cache, a 24-point history check catches symbol / timeframe switches and backfills, and only the forming bar (plus the bar it just closed) is recomputed for EMA 20/50, SMA 200, Bollinger 20·2, RSI 14 and MACD 12/26/9. Equal to a full recompute (relative error < 1e-9, unit- and browser-tested). Optional overlays and picker indicators refresh on each new bar and at most 4×/s while a bar forms.
- Pro Desk walk-forward + 1,000-run Monte Carlo run in the backtest Web Worker (new `quant` message; the worker bundle now includes `v15p5core.js`). Without workers, a chunked Monte Carlo yields every 100 runs and returns identical numbers.
- With fewer than 2 out-of-sample folds, walk-forward now says it needs more history instead of showing an empty table.
- Windowed backtest trade log: every trade is scrollable (previously the newest 300), with only the visible rows in the DOM.

### Tests
- `test/v156.test.js` (24 checks) and `test/v156_e2e.js` (33 checks, English LTR + Arabic RTL at 1440×900).
- `test/_reveal.js`: older suites reveal the Settings tab holding a control before acting on it (Settings has been 4 tabs since v15.5 and is built on first open).
- `test/v15p5_e2e.js`: the overlay check shows the 300 bars the volume profile covers, so it no longer depends on where the simulated POC falls.

## v15.5 — Zero-Clutter Visual Polish & Bot $ Profit — 15 Nov 2026

### Calmer screens (`src/v155.js`, `src/style.css` v15.5 layer)
- No more box-inside-a-box: nested panels, stat tiles and KPI rows drop their outlines for single 1px hairlines and more breathing room; the Obsidian & Gold theme uses `#0B0E14` surfaces.
- One gold button per screen: `#F5B841` is reserved for the primary action (Run backtest, Start Drill…); every other button is a quiet ghost pill until hovered. On the Backtester, the other "primary" buttons become gold outlines. Buy / Sell keep their green / red so the two sides can never be confused.
- Tabular figures everywhere (`font-variant-numeric: tabular-nums`) so prices, P&L and leaderboards never jitter; timestamps, fees and IDs are dimmed to 55% slate.
- Loud banners become a quiet top-corner pill with a 6px amber dot (click to expand). The chart gets a status corner with 6px glowing dots, **Live Feed · Auto-BE Armed · Shadow Bot Ready**, that expand on click.
- The header fits on one row at 1280 px and wider with no horizontal page scroll: the symbol box, a **Search features, tickers, tools… Ctrl+K** pill, the quote, quiet status dots, equity, **Simple | Pro**, **↺ Reset Clean View**, language and a **⋯ More** menu (Pro Tools, theme, workstation, side panel, demo, brief, trader tools).
- The nav drops emoji noise and groups every tab under four small captions: **Trade · Intelligence · Quant & Bots · Academy & Settings**. A uniform **? How It Works** pill opens Learn ExTerm on a lesson for the screen you are on.

### Markets
- The chart toolbar is one row: timeframe pills `1s | 1m | 15m | 1h` (+ `⋯` for the rest), ƒx Indicators with their chips, **Overlays ▾**, **AI Lens ▾** and Replay. Chart type and drawing tools move to a slim rail beside the chart, and the multi-timeframe strip moves into the status corner.
- **Overlays ▾** is a single dropdown with toggle switches and one-line descriptions: MTF Ghost Candles, Session Kill-Zones / ORB, Consensus Heatmap, Macro Pins, Delta Absorption, 0DTE Gamma Flip & Charm, Gap-Fill Odds, Safety Score and Holder Cluster X-Ray. **AI Lens ▾** holds Explain Why Price Moved and the NL Pattern Hunter.
- Smart context defaults: switching asset class highlights the tools that matter (0DTE Gamma Flip & Gap-Fill on US stocks, Safety Score & Holder X-Ray on on-chain DEX) with a gold "Suggested" tag and a 6px dot on Overlays. Nothing is switched on for you.
- **Favorite 4**: star up to four tools into a compact quick bar beside the order ticket for one-click daily use.
- **Zen Chart Focus**: `F` (which still fits the zoom) or slim `«` / `»` chevrons collapse the watchlist and/or the order ticket so the chart runs edge to edge. Mirrored in right-to-left languages.
- Order ticket: Auto-Breakeven / trailing step-ladder rules (TP1–TP3) and the Paper / Webhook Bridge (https only) live in one collapsed **Smart Order Rules ▸** accordion; sizing by risk gets a compact inline **Risk: 1.0%** slider.

### Backtester & Quant Lab: Bot Net Profit hero card (`src/v155core.js`)
- A bold **Net Bot Profit (+$X,XXX.XX / +XX.XX%)** card above every backtest's results: Starting Capital → Ending Balance, Win rate, Gross Profit, Gross Loss, Fees & Slippage Deducted, Avg Win ($), Avg Loss ($) and Expectancy ($/trade). Slippage is costed per fill by direction (long and short).
- Live what-ifs: change Starting Capital and every dollar figure and the equity curve rescale instantly (exact, because position size is a % of equity). Drag Position Size and the run is re-simulated (debounced).
- **What Changed?**: re-run with new parameters or Kill-Switch filters and the card shows a ghosted previous-run curve plus the exact dollar delta (`+$1,240.00 vs. previous run`). The Backtester's equity chart draws the previous run too.
- The trade log keeps dollar P&L on every closing row.
- Quant Lab Pro becomes a 4-step wizard: **1. Pick or Build Strategy → 2. Run Stress Tests → 3. Set Capital & Risk Sizing → 4. Review Bot Profit & Deploy**. Every institutional tool sits inside its step, with a 1-click **Run Starter Backtest** on empty states (Quant Lab and Backtester).

### Navigation & workspaces
- `Ctrl+K` now indexes every tab, overlay and AI Lens tool, the eight Quant Lab sections, both leaderboards, all Learn ExTerm lessons, 137 indicators, every strategy and the workspace commands. Search is typo-tolerant, multi-word, folds accents and matches translated labels; picking a result jumps there with a gold spotlight pulse.
- **Simple | Pro** (saved): Simple shows only the chart, watchlist, a clean order ticket, Learn ExTerm and Settings; Pro (default) shows every tab in its four groups.
- **↺ Reset Clean View** closes every drawer and popover, switches overlays off, leaves Zen and returns to the default Markets layout in one click.
- Journal: a 4-metric summary strip (trades, win rate, net P&L, profit factor) with **Replay My Worst Loss**.

### Screen restructures (`src/v155s.js`)
Existing controls are wrapped or moved rather than rebuilt, so their ids, handlers and data feeds are unchanged.
- **Order Flow (Pro Desk → DOM & Footprint)**: a clean 2-column split. The left column has a compact **Tape Velocity** bar (trades per second vs the 30 s baseline, imbalance and aggressive-sweep tag) above the DOM ladder. The right column is a tabbed card: **CVD & Absorption** (CVD and footprint), **Anchored VWAP & VPVR** (POC, value area and AVWAP ±1σ / ±2σ with a volume profile) and **0DTE Gamma Flip & Charm** (gamma flip, call and put walls, net GEX, per-strike call / put gamma bars, charm window and pin strike).
- **On-chain DEX pools**: a new **☰ Table** view (the default for new installs) with 4 columns: Token / Pair, Price & 24h %, Safety Score and Signal. A row click slides out an **Inspect Token** drawer with the Dev-Wallet Cluster X-Ray, LP Lock Details from the safety scan, the Gap-Fill Scanner and Lead-Lag Divergences. Tiles, Radar and Bubbles are unchanged.
- **Perp Leaderboard**: 4 columns (Rank & Wallet, ExTerm Alpha Score, ROI % / Net PnL $, Open Positions), and a **Style** filter in the single filter strip next to timeframe, sort, Anti-Rug and chart heatmap. A trader's details open in a slide-out **Trader Detail & Mirror** drawer with Plot on Chart, Backtest Style, Shadow Mirror, Track Wallet, Exit Alerts and Liquidation Magnet. One drawer is open at a time; × or Esc closes it. The Wallet Tracker's Smart-Money table is trimmed to its key columns.
- **Grok tab**: a 3-tab intelligence rail beside the console: **Grok Bot** (plain-English starter chips, active-rule cards and a human-readable Drawdown Cool-Off pill you can switch on or off), **3-Agent Copilot** (starter chips for the desk plus the Copilot Bridge) and **Macro Shield** (regime in plain words plus the Global Intel panel).
- **Settings**: 4 tabs: **General & Language**, **Chart & Hotkeys** (now with a keyboard-shortcuts card), **Execution & Webhooks** and **Security & Vault**. Panels that other modules add later are sorted into the right tab automatically.
- Drawers sit above the corner banner, have no click-blocking backdrop, and stay pinned to the window even while the 3D tilt effect is active. Live-refreshing panels no longer replay their entry animation every second.
- Fixed: the CVD chart legend said "undefined".

### Smoothness
- Palette search, sliders and hero what-ifs are debounced (16–60 ms); the new status and badge polling pauses while the window is hidden. The chart was already redrawn on demand behind an FPS governor, so it needed no change.

### Platform
- 68 new UI strings translated into all 32 named languages; RTL mirroring via CSS logical properties.
- Launcher version 15.5.

### Tests
- `test/v155s_e2e.js` (40 headless-Chrome checks of the five restructured screens: layout at 1440×900 and 1280×720 in English and Arabic, drawers above the banner, existing handlers still working, v15.1–v15.5 regressions, zero page errors). Tests that change Settings fields open the right tab first.
- `test/v155.test.js` (25 unit checks: hero maths on a hand-checked fixture and a real backtest, capital linearity versus a real re-run, What Changed?, Favorite-4, search, groups, i18n coverage, static CSP / privacy checks) and `test/v155_e2e.js` (41 headless-Chrome checks in English and Arabic RTL at 1440×900 and 1280×720: no page scroll or overlapping header controls, single-row toolbar, Ctrl+K, Simple | Pro, Zen, Overlays, Favorite 4, Smart Order Rules, hero $ / % accuracy, What Changed?, Quant Lab wizard, Reset Clean View, strict CSP, zero page errors). Existing suites that clicked header buttons now open ⋯ More first.

## v15.4 — ExTerm Unified Master Edition — 14 Nov 2026

### Learn ExTerm: Interactive Academy (`src/learn_academy.js`, logic in `src/v154core.js`)
- One translated **🎓 Learn ExTerm** button in the top functions bar, right beside Settings, opens the Obsidian & Gold hero **Learn Our Terminal — Interactive ExTerm Academy**. `LEARN_MOUNT_TARGET = 'topbar' | 'settings'` moves it into Settings → Documentation & Academy by changing one constant.
- 35 lessons across 9 categories: Charting & Visual Execution, Order Flow & 0DTE Derivatives, Scanners & On-Chain DEX, Institutional Quant Lab (Auto-Evolve, Crisis Time Machine, Slippage Fragility, Kelly / ATR Sizing, Visual Trade Inspector, Grok Shadow Bot), Grok Bots & 3-Agent Copilot, World Macro Shield, Prop-Firm Gauntlets & Trade Journal, On-Chain Perp & Smart-Money Leaderboards, and Security & External Execution Bridges. Each card has What It Does, Step-by-Step Workflow, Pro Tip / Risk Guardrail, Keyboard Shortcut and **Try It Live →**, which navigates to the exact tab, Lab section or drawer and pulses a gold spotlight ring.
- "How do I…" fuzzy search (stop words ignored; prefix, substring and subsequence matching), a 5-Minute Quick-Start track and a live `X / Y Modules Completed` mastery bar saved with your local state.
- Goal pills (Crypto Perps, US Stocks & 0DTE, On-Chain DEX, No-Code Quant Bots) generate an ordered playlist of lessons and drills that fits in 15 minutes.
- **Start Drill**: seeded sandbox scenarios (volatile breakout or thin DEX pool, tagged as simulated) take over the chart. The badge is awarded only after ExTerm verifies the live action: dragging a TP rung, anchoring VWAP, sizing by % risk or opening the holder X-ray.
- **Explain This Metric**: subtle `?` buttons and Alt+hover popovers on 0DTE Gamma Flip, Fragility Break-Point, ExTerm Alpha Score, CVD Divergence and Dealer Charm / Vanna, each with Open Full Lesson →.

### On-Chain Perp & Smart-Money Leaderboards (`serve.py`, `src/leaderboards.js`)
- Launcher: `/api/hl/leaderboard` and `/api/hl/trader` read public, permissionless Hyperliquid mainnet data (`stats-data.hyperliquid.xyz/Mainnet/leaderboard`, `api.hyperliquid.xyz/info` with `clearinghouseState`, `userFills` and `frontendOpenOrders` only). Both sit behind the session token, use 30-second RAM caching, back off exponentially per upstream host (serving the last good copy as `stale`) and schema-validate every answer down to whitelisted fields. No order endpoint is reachable. `--offline` serves a seeded sample flagged `sample`.
- **ExTerm Alpha Score (0–100)**: risk-adjusted ROI 35%, drawdown control 25%, consistency across 24h / 7d / 30d / All 25%, liquid non-churning size 15%. The formula is identical in `serve.py` and the page (shared parity fixtures).
- Crypto → Social gains `Feed | Perp Leaderboard`: ranked traders over 24h / 7d / 30d / All, sortable by Alpha, PnL or ROI. Expandable live positions (asset, side, leverage, entry, unrealized PnL, liquidation), **Chart Setup** (entry and liquidation lines on the chart), **Shadow Mirror** (position deltas logged as Grok dry-run fills, zero custody), **+ Track Wallet** and **Backtest Style** (cadence, hold time, leverage and favoured pair → a Quant Lab strategy with time-stop / cooldown filters, then the 17-test validation gate).
- On-chain → Wallet Tracker gains a collapsed **Smart-Money Wallet Leaderboard** (public top-25 plus saved wallets by win rate, realised PnL and Alpha Score). **CONFLUENCE** alerts and **TOP TRADER** chart pins fire when 2+ top-25 wallets open the same pair and side within 15 minutes.
- Position delta radar (`-40% Size Trimmed`, `SL Tightened`, `Full Exit`), Tilted Whale and Liquidation Magnet (≤ 2.5%, plotted as a sweep target) detectors, style tags (Scalper, Swing, Mean-Reversion, News Sniper) next to the World Macro Shield regime, a toggleable Consensus Heatmap strip on the price axis, and an Anti-Rug / Copy-Trap filter (dust win-rate padding, circular wash volume, bundled same-millisecond fills).

### 15 workstation upgrades (`src/v154_core_upgrades.js`)
- One 🧰 **Pro Tools** drawer with six collapsed sections that render on open; every overlay is off until you switch it on.
- Charts & Execution: multi-timeframe ghost candles; Auto-Breakeven & trailing step-ladder (right-click a TP rung, enforced on the paper position and sent as a `move_sl` signal through the allow-listed `/hook` gateway); opening-range bands and Asia / London / NY kill-zone boxes.
- Order Flow & 0DTE: tape-velocity & aggressive-sweep speedometer; dealer charm & vanna intraday drift curve with pin / squeeze windows; absorption footprints.
- Scanners & DEX: pre-market / overnight gap-fill probability (gap %, RVOL, 90-day fill rate); holder-cluster X-ray bubble graph (labelled *model* when funding tracing is unavailable); correlation, beta and lead-lag decoupling alerts.
- Grok & 3-Agent Copilot: Alt+click "Why did price just move?" forensics with a hand-off to the Copilot; a plain-English pattern & liquidity hunter that draws matching zones; a bot drawdown cool-off & volatility throttle that wraps every dry-run shadow fill.
- Macro & Journal: FOMC / CPI / NFP reaction overlay over the last 12 releases (US-DST-aware times); Tilt & Revenge-Trade guard banner; Replay My Worst Loss in bar replay, 30 s before entry.

### Platform
- CSP: the inline stylesheet is now pinned by SHA-256 too (`style-src-elem 'self' 'sha256-…'`, generated by `build.py` for both normal and `--harden` builds). The script hash, `default-src 'none'` and the no-inline-handlers rule are unchanged.
- 28 new UI strings translated into all 32 named languages; RTL mirroring via CSS logical properties.
- Launcher version 15.4.

### Tests
- `test/v154.test.js` (74 unit checks incl. hostile input, i18n coverage and static CSP / content checks), `test/v154_server_test.py` (34 launcher checks: parity, schema validation, allow-list, cache, backoff, offline sample, HTTP) and `test/v154_e2e.js` (60 headless-Chrome checks in English and Arabic RTL), all wired into `test/run-all.ps1` and `test/run-all.sh`.

### Docs
- Fresh 1440×900 headless-Chrome screenshots: hero chart (1h ghost candles on 5m bars, NY kill-zone, dealer charm panel), Learn ExTerm academy, search and sandbox drill, Perp Leaderboard and consensus heatmap (offline sample), Quant Lab after Backtest Style, Pro Tools drawer, and the first-launch language gate.

## v15.3 — ExTerm — 14 Nov 2026

### Institutional Quant Lab: 🧬 Quant Lab Pro (`src/v153core.js`, `src/v153.js`)
- Lab tab gains one 🧬 **Quant Lab Pro** pill. The panel shows a strategy picker (every built-in strategy plus your No-Code specs), one backtest and a clickable equity curve; the eight tools below sit in collapsed accordions that render only when opened.
- **Auto-Evolve**: genetic mutation and crossover of parameters and robustness filters (trend EMA, ATR stop, cooldown, time stop) over several generations in the background Web Worker. Survivors are ranked by out-of-sample Sharpe + Calmar on the newest 50% of history; mutations that lose money in either walk-forward window, or grade D/F in the 17-test Validation Lab, are rejected and counted. Seeded and deterministic.
- **Fragility Break-Point meter**: spread widening scaled by each trade's ATR regime, square-root market impact for your order size versus bar dollar volume, and partial fills above a bar-participation cap. Reports the exact friction multiplier (and spread in bps) where the strategy flips unprofitable.
- **Crisis Time Machine**: one-click calibrated replays of the 2020 Liquidity Flush, 2022 Crypto Deleveraging and FOMC Rate-Shock windows (depth, duration and volatility rebuilt from the market's own returns, so it works offline), plus PnL and drawdown attribution across Bull Trend, Bear Trend, Low-Vol Chop and High-Vol Panic.
- **Feature Kill-Switch**: every trade's entry is scored on session / UTC hour, RVOL, ATR percentile, RSI and VWAP distance; the top 3 drivers separating winners from losers come with one-click filters that recalculate the equity curve instantly.
- **Dynamic Sizing & Prop-Firm Odds**: the same trade list under Fixed Fractional (1% risk), Half-Kelly, ATR volatility-targeting and Equity-Curve Trading (half size below the 20-trade equity MA), with 2,000-run Monte Carlo pass probabilities for $50k / $100k evaluations (profit target, daily loss limit, trailing drawdown).
- **Synthetic Paths**: 200–2,000 stationary block-bootstrap paths that keep fat tails and volatility clustering but reshuffle the order of history, with optional Student-t adversarial noise, a market-physics check (volatility, excess kurtosis, clustering) and a verdict on whether the edge survives.
- **Equity-Curve Inspector**: click any point, the deepest drawdown dip or a peak on the equity curve to open that trade on its candles with entry / exit pins, MFE / MAE, the indicator snapshot at the signal bar and a jump to the same candle on the chart.
- **Promote to Grok Shadow Bot**: validated strategies (grade A–C) are packaged with the exact strategy ID, evolved parameters, filters and capped risk limits, then tick in the Grok tab's dry-run shadow mode on every new closed bar. Hypothetical fills only; balances are never touched. Packages are whitelisted and re-validated on load.

### Platform
- Nine new UI strings translated into all 32 named languages (i18n key coverage test included).
- Launcher version 15.3.

### Tests
- `test/v153.test.js` (46 unit checks incl. hostile input) and `test/v153_e2e.js` (33 headless-Chrome checks covering all eight tools, the shadow-bot pipeline, XSS, i18n, strict CSP, no inline handlers and phone width), both wired into `test/run-all.ps1` and `test/run-all.sh`.

### Docs
- Fresh 1440×900 headless-Chrome screenshots: hero chart, Quant Lab Pro (Auto-Evolve, stress tools, trade inspector), DEX mode (simulated demo pools), Grok tab with a promoted shadow bot, and World tab (demo headlines).

## v15.2 — ExTerm — 14 Nov 2026

### First-launch language gate + i18n engine
- New `src/i18n.js`: the first screen on a fresh install is an Obsidian & Gold **Choose Your Language** modal (fuzzy search with typo tolerance, flag + native-name cards, browser language pre-selected). 32 languages translate the app shell (nav, header, gate, workstation); every other ISO-639-1 locale is selectable with English text. Arabic, Hebrew, Persian and Urdu set `dir="rtl"`. The choice is saved with your settings; the 🌐 pill and `Ctrl+K` switch it live (`data-i18n` attributes + `I18N.t(key)`). The first-60-seconds walkthrough now waits for the gate.

### 44 workstation upgrades behind progressive disclosure (`src/v152core.js`, `src/v152.js`)
- Default screen: only the 🌐 pill, a 🧭 Workstation button and the bar-timer ring are new. Everything else is in 30 collapsed drawer sections (rendered on open), `Ctrl+K`, `H` (HUD clean mode) and opt-in overlays.
- Charting: bar-timer ring, sync groups A/B/C (crosshair, timeframe, symbol) over BroadcastChannel, draggable TP1–TP3 ladder with break-even after TP1, FVG / order-block / engulfing / sweep labels (off by default), Ctrl-hold magnet snap, future FOMC / CPI / earnings / custom markers, HUD clean mode with a Candle X watermark, higher-timeframe PiP on sub-minute charts.
- Order flow & options: iceberg / spoof wall detector, CVD divergence, click-to-anchor VWAP with ±1σ / ±2σ bands, Asia / London / NY session profiles, zero-gamma + gamma flip + call / put walls, unusual options filter with watchlist badges, multi-leg payoff builder with breakevens and theta curve.
- Markets: market-swap memory (timeframe, indicators, risk %), formula scanner (recursive-descent parser, no `eval`) saved as tabs, DEX safety strip, smart-money leaderboard + 2-wallet / 5-minute confluence alerts, bubble heat map net-inflow mode, watchlist sparklines + relative strength + plan notes, DEX fee / slippage presets.
- Quant: no-code composer → Pine Script v5 / JSON, portfolio backtester, sensitivity heatmap with plateau verdict, Fix Weak Gate for the 17-test lab, Apex / Topstep / FTMO / custom prop rulebooks, replay speed keys 1 / 2 / 5 / 0, Blind Drill, MFE / MAE + auto-tags, 4-way strategy battle.
- Grok / copilot / World: plain-English rule compiler, chart-range copilot query, devil's advocate A–F grade, World impact tags with trade-impact switch, Discord / Telegram cards with a chart snapshot, daemon health strip, pre-market brief + EOD recap, dry-run shadow mode.
- Platform: ECDSA P-256 signed `.exterm` share codes with signer fingerprints and whitelisted import, sub-minute memory governor, theme token editor, `Ctrl+K` calculator, cache manager, in-app build-integrity check.

### Launcher
- `GET /api/health` (uptime, RAM cache hit rate, bot heartbeats) and `GET /api/integrity` (exterm.html + serve.py vs `SHA256SUMS.txt`, relative names only), both behind the session token.
- `/api/notify` accepts an optional PNG chart snapshot (magic bytes checked, 400 KB cap) and sends it as a Telegram photo / Discord embed image through the same host allow-list.

### Docs
- Fresh 1440×900 headless-Chrome screenshots: first-launch language modal, hero chart (TP ladder, anchored VWAP, event markers), DEX mode (simulated demo pools), Grok tab and World tab (demo headlines).

### Tests
- `test/v152.test.js` (77 unit checks incl. hostile input), `test/v152_server_test.py` (13), `test/v152_e2e.js` (44 headless-Chrome checks: gate, RTL, persistence, drawer, overlays, HUD, palette, share codes, integrity, replay, CSP).

## v15.1 — ExTerm — 13 Nov 2026

### Candle X brand
- New **Candle X** mark everywhere: a brushed-gold ring with 8 candlesticks in an X (white, gold, champagne, silver quadrants) around a gold diamond, paired with the **EX**(gold) **TERM**(silver) wordmark and the *CRYPTO · STOCKS · DEX* caption. Inline SVG in the header, a data-URI favicon, the vault unlock badge, and canvas-drawn on the flex card, challenge card, Share Setup and Daily Recap PNGs (watermark **@exterm.labs**). All inline, so the strict `default-src 'none'` CSP holds.

### Sub-minute candles
- 1s / 5s / 15s charts scale strictly to the candles on screen (no Bollinger, Keltner or forecast padding), and every candle body is at least 3 px. Crypto bars already take every Binance `@trade`, Coinbase `matches` and Kraken `trade` print, so highs and lows move inside each second; a test now proves it. Stock and DEX bars use every launcher quote (one every ~2 s, the upstream rate), so a second with no new quote stays a flat bar. ExTerm does not invent wicks that never traded.
- Chart colours now follow the active theme and market mode (tokens are read from `<body>`, where themes set them).

### Cross-feature bridges
- **⚙ Auto-Setup** on Market Scanner rows, Launch Radar rows and bubble heat-map nodes (Shift+click), plus Alt+A and Ctrl+K: opens the chart, turns on Auto-Fibs and PDH / PDL, places preview Entry / SL / TP lines sized to your risk %, and shows the 3-agent Copilot risk summary.
- **MACRO / BOT pins** on the candle timeline: World Monitor CRITICAL headlines and bot entries / exits with their autopsy reason, with escaped hover tooltips.
- **Whale and smart-money markers** on 1s–30s candles from large prints (crypto and DEX) and tracked on-chain wallets, plus glowing watchlist badges, mutable WebAudio chimes and opt-in Discord / Telegram pushes through the launcher.
- **Strategy → prop challenge runner**: any backtestable strategy inside the $50K / $100K Prop-Firm rules or a Black Swan event. **Regime lock** (opt-in): idle in-tab bots switch to the Market Regime Detector's pick; a bot with an open position is never touched.

### Workspaces, themes and trader tools
- One-click **workspace presets** in the nav (Alt+1…4): Scalper, On-chain Trench, Quant Lab, Macro War Room.
- New flagship **Obsidian & Gold** theme. Every new panel, pill, badge, modal and canvas overlay uses the semantic theme tokens; tests check contrast in every theme.
- **% risk sizing pill** on the Entry / SL bracket with **Apply Size**; **killzone countdown** (Asia, London, NY Open, Power Hour in New York time); **benchmark ghost line** (BTC, SPY and other markets; Alt+G); **Share Setup PNG** and **Daily Recap PNG**; **? cheat sheet** listing every shortcut; **cross-asset correlation matrix** (BTC, SPY, NVDA, DXY via UUP, GOLD via GLD and more); **Copy / Import Setup JSON** (strictly validated).
- Pine Script buttons now read **Export Pine Script v5** and **Import Pine Script v5 compatible**. No third-party platform names or affiliation claims remain in the app.

## v15 — ExTerm, phase 5 — 13 Nov 2026

### 🌐 World tab
- A dedicated **World** button in the main navigation (next to Grok) opens the full **World Monitor** feed: global breaking news and macro headlines with severity counts, severity and text filters, the live **Macro Shield** level, and a jump to the Grok tab for the shield's bot controls. It reads the launcher's existing intel cache, so no new network calls; every headline is escaped and links are limited to http(s).

### 🏛 Pro Desk: a new tab with nine institutional panels
- **DOM ladder + order flow:** a depth-of-market ladder for crypto pairs. Click a bid to buy and an ask to sell; the resting side of the market places a **limit**, through the market arms a **stop**, and working orders are tagged on their rows. Orders can go to the main account or any sub-wallet. Next to it: **CVD** (cumulative volume delta from the tick rule on live trades) and **footprint** bars (bid × ask per price level for the last 4 minutes, POC and 3:1 diagonal imbalances).
- **Options:** the Yahoo options chain with expiry picker, **max pain**, **dealer GEX** by strike (call wall, put wall, gamma flip) and **paper options** (buy calls / puts at the ask, mark-to-market P&L, isolated options cash). When Yahoo refuses the request (it often wants a cookie crumb) a Black-Scholes model chain is shown and clearly labelled MODEL.
- **Ratio & grid:** synthetic **ratio charts** for any two markets (ETH/BTC, NVDA/AMD, BTC/GOLD via GLD), a 4-chart grid with a shared crosshair, and **pop-out windows** for a second monitor that follow the main window's symbol, timeframe and crosshair over a validated `BroadcastChannel`.
- **Risk & wallets:** an opt-in **cross-bot correlation guard** blocks new entries (manual, bots, sub-wallets; never backtests) that are too correlated with what you already hold, with a live correlation matrix and a block log. **Isolated paper sub-wallets** are carved out of main paper cash. A **market regime** read is shown for the open chart.
- **Tape & profiler:** a **Time & Sales whale tape** (prints above your $ threshold, with aggressor side), a **smart-money wallet profiler** (FIFO round trips, win rate, realised P&L, holding time, trading style, best tokens) and a 1080×1080 **PNG flex card** watermarked **@exterm.labs**.
- **Chart intel:** a **multi-timeframe trend matrix** (15m / 1h / 4h / 1d). Opt-in overlays on the Markets chart: **auto-Fibonacci**, **PDH / PDL / PDC**, **volume profile** (VPVR with POC and value area), **FOMC (2026) and Form 4 markers**, **extended-hours shading** for stocks and an MTF HUD.
- **Quant lab:** **walk-forward optimisation** (4 folds, in-sample parameter pick, out-of-sample score, efficiency and a robust/fragile verdict), **Monte Carlo** (1,000 seeded reshuffles of the backtest's trades: return percentiles, drawdown, probability of loss) and a **Pine Script v5 importer**. The importer translates `ta.*` indicators, crossovers, comparisons, `strategy.entry` / `close` and % stops into ExTerm's safe no-code format; it never runs the script, lists anything it skipped, and saves the result as a regular custom strategy.
- **Derivatives & arbitrage:** a **multi-exchange arbitrage scanner** (Coinbase, Kraken, Binance; net of 10 bps taker fees per side, with a USDT-basis caveat), a **perpetual funding / open-interest** table and an estimated **liquidation heat map** (5×–100× bands weighted by recent volume).
- **Replay & backup:** **offline replay packs** save a chart's candles in this browser (IndexedDB) for later Bar Replay with no internet, and **encrypted `.exterm` backups** of everything ExTerm stores (AES-256-GCM; key from your passphrase via PBKDF2-SHA256, 600,000 rounds). A restore decrypts first, shows what it found, and replaces data only after you confirm.
- **Ctrl+K** lists every Pro Desk command.

### Fixes
- An encrypted restore can no longer be overwritten by the page's own save-on-close or by the launcher's disk mirror.

## v15 — ExTerm, phase 4 — 13 Nov 2026

### Crisp 1s / 5s / 15s candles
- Every sub-minute bar now **opens at the prior bar's close**, whether it was built from REST trades, live Coinbase / Kraken / Binance WebSocket trades, the launcher's stock tick buffer or simulated data, so high-liquidity charts (BTC, ETH, NVDA, SPY) no longer show artificial micro-gaps. 1m and above keep the real first-trade open, like TradingView.
- Candle bodies are pixel-snapped, centred on the wick and never thinner than 2 px (3 px when zoomed in), so flat ticks draw as clean bars instead of scattered dashes.

### 🫧 Dense bubble heat maps with buy-pressure windows
- Crypto and stock heat maps gain a **Bubbles** view next to Tiles; the on-chain Launch Radar bubbles move to the same engine. A pre-rendered sprite cache and a grid collision pass keep **1× / 2× / 3× density** (up to 180 bubbles) smooth on an uncapped animation loop that runs at your display's refresh rate (60–240 Hz, with a live fps readout).
- **Buy-pressure windows 1m · 5m · 15m · 1h · 4h · 24h** on every asset: the tick rule on live trades, then up/down bar volume, then (marked ≈) a price-change proxy. DEX pools read GeckoTerminal / DexScreener buy and sell counts (now including 15m and 6h); 1m and 4h say when they use the nearest window.

### 🚀 Launch Radar overhaul
- The list groups tokens into live **age brackets**: New Launches <1h, 1h–6h Runners, 6h–24h Established and 24h+ Trending. Each row has a **buy/sell pressure bar** for the selected window and a **⚡ Grok** button that sends a ready setup (side, entry, SL / TP, pressure and bracket) to the Grok tab's Copilot Bridge without leaving the radar.

### 📋 Live market scanner + unified watchlist sidebar
- The 📋 header button opens a sidebar with all three watchlists (crypto, stocks, on-chain) in one list with **sub-second sparklines**, plus a **Scanner** tab: top 24h gainers, **RVOL > 3×** volume spikes and **strategy signal matches** on the newest bar.

### Half-screen, tablet and phone layouts
- New layout classes: the sidebar docks on full screens, overlays at half-screen width, becomes a drawer on tablets and a swipe-to-close **bottom sheet** on phones; touch screens get 40–44 px tap targets.

### Fixes
- The 🎨 header button opens the theme popover from the first click (it could briefly cycle themes instead right after start-up).
- Sidebar, bubble and window settings persist across reloads (the state loader now knows the new sections).
- Test tooling: `test/run-all.ps1` runs every suite on Windows (PowerShell, Python, Node); Chrome is taken from `CHROME_PATH`. Several flaky or time-dependent browser tests were fixed: the insider-tracker test waits for live SEC data instead of a fixed 2.5 s, the stop-line drag tests keep the stop inside the visible price range, and the v13 suite skips its fake-Ollama checks (and says so) when a real Ollama owns port 11434.

## v15 — ExTerm, phase 3 — 13 Nov 2026

### 1-second and 5-second charts on every market
- **1s** and **5s** sit next to 15s on crypto, stocks and on-chain DEX charts (stocks no longer stop at 1m). Bars are built from real trades: Coinbase recent trades merged with every WebSocket trade the tab has already seen (kept in RAM, so switching to 1s draws at once), the pool's swaps for DEX tokens, and for stocks the launcher's new in-memory tick buffer (one quote every 2 s for the last hour, `GET /api/ticks`). Without any history a stock chart seeds from the last quote and grows a bar per second. Indicators, the chart **+** menu, backtests and in-tab bots all accept 1s / 5s (24/7 launcher bots stay on 1m+).

### ⚡ Grok tab: Grok Bot & Workflow Engine (separate from the AI Copilot)
- Grok via **xAI** or **OpenRouter** (key kept in the AES-256 vault) calls a fixed tool set: backtests, the **17-test Validation Lab**, parameter / risk tuning (walk-forward), regime detection and switching, **Generate Auto-Workflow** (data → regime → strategy → validation → risk → macro shield → bot → alerts pipeline), **journal autopsies**, macro intel and 24/7 bot control. Without a key the **local quant engine** runs the same tools, so every panel works out of the box. Anything that changes bots waits for your **Allow** click.
- **Copilot Bridge** panel: setups move between the Copilot and Grok as data; the two UIs stay separate.

### 🌐 Global Intel & Macro Shield (World Monitor)
- The launcher polls World Monitor's key-free public news digest (`api.worldmonitor.app`, `list-feed-digest?public=1`) every 3 minutes into RAM. Headlines get **CRITICAL**, **HIGH** or **MACRO** badges in the Grok tab and in a compact strip under Lab → News sentiment. A fresh CRITICAL warns the Copilot, can push to your phone, and (opt-in) **pauses new bot entries for an hour** and/or **tightens bot stops to 1%**. Stops are never loosened.

### 🧠 3-agent AI Quant Copilot
- `desk BTC 1h`: a Technical / Order-Flow Analyst, an On-Chain / Insider / Macro Intelligence agent and a Chief Risk Officer (1% risk sizing, vetoes on CRITICAL news, half size on serious behavioral leaks) with action cards: **Plot Levels on Chart**, **Run 17-Test Backtest**, **Place Paper Order with SL/TP**, **Send Setup to Grok Tab**.
- `show my leaks`: the **Behavioral Leak & Mistake Detector** checks your last 10 closed journal trades for revenge entries, missing stops, size spikes, letting losers run, cutting winners, overtrading, emotional tags and losing streaks.

### 📱 Mobile alerts
- Discord / Telegram channels are entered in the Grok tab, kept in the vault, and synced to the launcher after every unlock. Discord messages are now rich embeds (red CRITICAL, violet bot trades, amber price alerts) with Markdown escaped and pings disabled.

### 40 new strategies with Pine Script v5 export
- 10 each for **Crypto Spot/Perps**, **US Equities/Stocks**, **On-Chain/DEX** and **Multi-Asset Quant/Scalping**. All are validated no-code specs: they backtest, run the Validation Lab, run as 24/7 launcher bots (parity-tested) and export to TradingView **Pine Script v5** from the Grok tab's strategy library.

## v15 — ExTerm, phase 2 — 13 Nov 2026

### Click-to-trade on every chart (stocks, crypto, DEX)
- A **+** button follows the cursor along the right price axis. Click it for a buy or sell **limit/stop** order, a **price alert** or a **horizontal level** at that exact price (keyboard: arrows + Enter, Esc closes).
- A buy opens a **draft bracket**: draggable **Entry**, **Stop-Loss** and **Take-Profit** lines drawn on the chart canvas, with shaded risk/reward zones, live dollar P&L, % move and reward-to-risk, plus an editable size. **Place** sends it as a paper limit (below the price) or stop (above) with the stop and target attached. Pending orders and open positions show their lines too; a position's stop and target stay draggable.
- **Breakeven** and **Partial TP 50%** in the bracket box. **Ctrl+Z / Ctrl+Y** undo and redo line moves and Breakeven. When none are left, Ctrl+Z still undoes drawings.

### Realistic paper execution
- Ticket toggle **Realistic fills**: market, stop and stop-loss fills pay half the real bid-ask spread plus the depth impact of the order size (walking the latest order book), the AMM pool fee plus constant-product slippage on DEX tokens (from pool liquidity), or a modeled spread on stocks. Limit and take-profit fills keep their price. The ticket shows the expected fill, and each trade's reason records the cost in basis points. It only affects your paper account, never bots or backtests.

### Backtests
- **Trade arrows overlay** on the backtest price chart: an entry and exit arrow per round trip joined by a dashed line, green for wins and red for losses, with the % result. Hover an arrow for prices, times, P&L and the strategy's reasons. Toggle above the chart.

### Challenges Hub
- The replay challenge (daily, blind, pick a market) is unchanged. New modes: **Prop-Firm $50K / $100K Evaluation** (+8% target, 4% daily loss limit, 8% max trailing drawdown), **Black Swan Survival** (2020 COVID, 2022 FTX, 2008 financial crisis, modeled on each event's approximate key closes with simulated candles in between), **10-Min Scalping Sprint**, **Zero-Indicator Naked Price Action** and **Trench Survival** (a simulated token with fees, slippage and rugs).
- Every round tracks max drawdown (at candle lows) and win rate and earns a **discipline grade from A+ to F**. **📸 Flex Card** saves a shareable 1080×1080 image.

### Getting started
- **First-60-seconds walkthrough** (five steps, each with *Show me*) replaces the old tour on a first run. **▶ Demo** in the header is a 1-click live demo preset. **☀ Morning Brief** shows movers, your paper account and a command overview, on your first visit each day (switch it off from the brief).
- **Settings → 📘 Field Manual**: a searchable how-to with *Try this feature* deep-links, plus **Check for Updates & System Doctor**.
- **`python serve.py --doctor`** (add `--offline` to skip network checks) checks Python, the app file and its SHA-256 against `SHA256SUMS.txt`, the data folder, the port, Chrome, local AI, the data sources and the update check, and exits 1 if anything failed. The page gets the same checks from the token-gated `GET /api/doctor`.

### Tests
- New suites: `test/v15p2.test.js` (unit), `test/v15p2_server_test.py` (doctor) and `test/v15p2_e2e.js` (browser, including CSP and XSS checks).

## v15 — ExTerm, phase 1 — 13 Nov 2026

### New name: ExTerm
- New name across the app, launcher, build (`dist/exterm.html`, `dist/exterm.min.html`) and launchers (`start-exterm.bat / .command / .sh`). The session header is now `X-ExTerm`.
- On first start the launcher moves the pre-v15 data folder to `~/.exterm` (never overwrites an existing `~/.exterm`), so alerts, background bots and saved state carry over. `EXTERM_DATA` replaces `EXTERM_DATA` (the old variable still works).
- Kept on purpose so nothing is lost: the original browser storage keys, the journal and backup databases in the browser, and the GitHub repository used by the update check.

### Live data
- **Launcher price feed**: a multithreaded RAM cache polls DexScreener (30 pools per call) and Yahoo Finance (`spark?symbols=…`) every 2 seconds. The page reads it with one token-gated `GET /api/feed` instead of many direct calls. Symbols used by background bots and price alerts stay watched with the browser closed, and alerts read the cached price first. `--no-feed` turns it off.
- **WebSockets**: keepalive pings (Kraken, on-chain RPC `logsSubscribe`), a watchdog that reconnects a subscribed socket that goes quiet for 30 s (Coinbase, Kraken, Binance), jittered backoff and an instant reconnect when the network returns. New **Binance** source (spot USDT pairs; Settings → Source; not in Auto because Binance refuses US visitors).
- **Deep history**: charts load 300 candles fast, then backfill to 5,000 once in the background (exchanges that paginate). Live trades are folded into one bar update per symbol per second in a Web Worker, so bursts don't stall the page.

### Charts
- Static/dynamic layers: moving the cursor redraws only the crosshair and legend over a cached frame instead of the whole chart.
- Adaptive FPS governor: charts follow the display's refresh (60-240 Hz) and step down toward 30 fps when a draw no longer fits the frame budget, then climb back.
- Header telemetry pill: live chart fps and exchange-to-screen socket latency (`240 FPS · 12ms WS`).

### Security
- CSP now starts from `default-src 'none'` (every allowed source is listed explicitly) and keeps the SHA-256-pinned script.

## v14 — 9 Nov 2026

### Saving and reliability
- **Saved to your computer** (v13.1): the launcher mirrors everything the page saves (settings, watchlists, bots, paper accounts, drawings, workspaces, the trade journal) to `~/.exterm/state.json` and restores it on open, so a new launcher port, another browser or cleared site data no longer looks like a fresh install. The newest copy wins; the journal on disk is a long-term log (up to 20,000 trades, chart snapshots stay in the browser); one dated backup per day (14 kept); "Reset everything" resets the disk copy too. API keys are never written. Settings → Data status shows when it last saved and offers the **full journal log as CSV**. `--no-state` turns it off.
- **Rate limits handled** (v13.1): GeckoTerminal requests are paced (~20/min, slower after a limit), cached and de-duplicated; a 429 starts a shared cool-down (all tabs) and returns "free limit reached, pausing Ns" instead of the raw API text. Lists keep their last real data instead of switching to simulated, new pairs fall back to DexScreener, the Launch Radar backs off and says when it resumes, and Data status shows the pause. DexScreener calls get the same pacing (50/min on list endpoints, 240/min elsewhere).
- **Update check**: the launcher asks GitHub for the latest release every 6 hours and the page shows a banner with a link to what's new. Nothing is downloaded or installed. `--no-update-check` turns it off.

### New features
- **Welcome back** card: time away, biggest movers on your watchlist, paper-equity change and new trades in your journal.
- **P&L calendar** in the journal: green / red days, monthly total, best day; click a day to filter the journal to it.
- **Journal trades on the chart**: press **J** to show your buys and sells as markers, with each exit's P&L.
- **Multi-timeframe trend strip** above the chart: 15m · 1h · 4h · 1d read from EMA 20/50, its slope and RSI on closed candles (crypto and stocks).
- **Strategy compare** under every backtest: two more strategies on the same coin, timeframe, window and settings, with overlaid equity curves and a stats table.
- **Risk of ruin** under every backtest: chance of a 50% drawdown within 100 trades, from 2,000 seeded reshuffles of the strategy's own trades, plus typical and bad-case drawdowns.
- **Data quality grade** under every backtest: gaps, duplicates, out-of-order bars, impossible prices, frozen feeds and missing volume, graded A–F.
- **Keyboard shortcuts** on the Markets tab: 1–9 timeframes, B / S ticket side (focuses the amount), R replay, J journal markers, F fit chart, ? for the list. Bar replay keeps its own B / S keys.

### Fixes
- Portfolio trade CSV now neutralises spreadsheet formulas (security finding 27); journal CSVs keep negative numbers as numbers.
- Phones: the top bar scrolls inside itself, so pages no longer scroll sideways.
- Unknown launcher API routes return 404 instead of "background alerts are off".
- README screenshot of background bots retaken (the old one showed network errors from the build machine).

### Security
- Re-audit of the new code: 2 confirmed low findings fixed (CSV formulas, reset resurrected from disk), 6 rejected with tests. See SECURITY-AUDIT.md (34 findings in total).

## v13 — 9 Nov 2026

### On-chain
- **Launch Radar** on the on-chain heat map: a live list of brand-new pairs (two pages of GeckoTerminal new pools) with an age ring, market cap, liquidity, 1h volume, 5m change, 5-minute buy/sell bar, socials, automatic safety grade (newest tokens are scanned in the background, one every 4 s) and a momentum score. Sort by newest, momentum, volume or buy pressure; filter by liquidity and "has socials". New pairs pulse when they first appear.
- **Bubble map** view: x = age, y = 5-minute buy pressure, size = 1h volume, colour = 1h change. Hover for stats, click to open the chart.
- **Token card** (Markets, on-chain mode): website and socials (DexScreener pair info + GeckoTerminal token info; only `https` links, odd handles are rejected rather than repaired), description (escaped), holders and top-10 share, buy/sell pressure for 5m · 1h · 24h, buyers vs sellers, pool stats (price, market cap, FDV, liquidity and its share of market cap, volume, age), an automatic safety grade with its top three issues, and one-tap paper Buy $25 / $100 / $250 and Sell ½ / all.
- **Launch forensics**: creator, snipers (first 3 blocks), bundled buys (3+ wallets in the launch block) and the share of supply they hold, from a token's first 25 transactions. "Track the earliest buyers" adds them to the wallet tracker.

### Crypto derivatives and paper futures
- **Perps panel**: funding (per 8 h and yearly), open interest and its recent change, long/short account ratio, last-hour liquidations (longs vs shorts) and a plain-English reading. Sources: Hyperliquid, then OKX, then Bybit; OKX adds liquidations.
- **Paper futures**: long or short, 1–50× leverage, isolated margin, liquidation price shown before you open, optional stop / target, hourly funding from the live rate, close half or all, flip by ordering the other side. Liquidations lose exactly the margin. Trades go to the journal.

### Strategies, backtests and bots
- **15 new strategies** in four new categories:
  - Crypto: trend + volatility sizing, Asia-range breakout, multi-timeframe trend pullback, Turtle pyramid, self-weighting ensemble.
  - Meme coins: momentum burst, first-dip buy, VWAP reclaim, breakout + profit ladder, trend with rug guard.
  - Short selling: trend breakdown, overbought fade (downtrend), failed breakout (liquidity grab).
  - Stocks: opening-range breakout (DST-aware New York session), turn-of-the-month.
  Every one is tested for look-ahead (removing future candles never changes past trades).
- **Short selling** in the backtester, validation lab and bots (a spot short account: profit when price falls, stop above, target below, trailing stop from the lowest low).
- **Recent windows**: backtest the last hour, 24 hours, 2 days or 7 days. Indicators warm up on 300 earlier candles, which never trade. The estimate warns when a window has too few candles for the timeframe.
- **No-code builder**: rules can read a **higher timeframe** (×2 to ×24, last completed bar only) and strategies can be **short**. Pine export uses `request.security(…[1], lookahead_on)` and `strategy.short`. Two new templates.
- **Results by market regime** under every backtest (up-trend / down-trend / choppy from ADX + EMA slope) with a verdict.
- **Basket test**: one strategy on up to 12 markets with the same settings; median return, markets profitable, markets beating buy & hold, an equal-weight basket, and a Robust / Mixed / Fragile grade.
- **Background bots**: paper bots that keep running in the launcher after the tab closes (no-code strategies; the launcher's Python interpreter is checked bit-for-bit against the page's). Up to 10 bots, daily loss limit, Telegram / Discord messages, pause / close / delete, and "while you were away" trades synced into the journal once.
- In-tab bots keep checking signals in background tabs (worker heartbeat instead of throttled timers).

### Wallet tracker
- **Score v2**: recency-weighted (14-day half-life) and shrunk toward 50% until there are enough trades; profit factor and trading style.
- **Copy-backtest**: replays a wallet's last 12 tokens as if copied N seconds late with fees, using 1-minute candles when available (estimated otherwise, and marked).
- **Linked wallets**: same first funder (read from each wallet's oldest transaction) or buying the same token within 3 s, twice or more. Linked wallets count once in clusters.
- **Weighted smart-money clusters** with an automatic safety check, and messages for tracked-wallet buys / clusters through the launcher (minimum size and grade).
- New wallets load their history automatically; **Discover → Active on trending tokens** finds live wallets from DEX trade feeds (no key needed).

### Social
- Spam / bot filter (copy-paste by 3+ accounts, shill words, cashtag and emoji spam, 10+ posts an hour), hidden by default and excluded from trending.
- Spike detection against each ticker's own last 24 hours (z-score), spike alerts, optional Telegram / Discord.
- Optional sentiment from your local AI (through the launcher's existing OpenAI-compatible Ollama route).
- Social volume can be drawn under the price chart.

### Charts and app
- Drawing tools: parallel channel, zone, long / short position boxes with R:R, ruler, text notes; undo / redo (Ctrl+Z / Ctrl+Y, ↶ button).
- Time zone setting for charts, clocks and timestamps.
- Safe storage: compaction + a visible warning when saving fails; daily automatic backups (last 7) with restore and download.
- Data status panel and a ⏸ stale-data badge; a first-run "get live data" screen; a 7-step tour; one API keys page; Copilot now sees your journal habits, paper perps, wallet grades, background bots and derivatives.
- Fixed: periodic refreshes reset armed "Sure?" buttons, so Portfolio → Close all could take several clicks.
- Installable app (PWA) when served by the launcher; a lighter mobile layout; 3D tilt no longer applies to cards with buttons.

### Security
- Fixed: exported backups contained the wallet-tracker key, RPC key and URL, X token and SEC contact (only the AI key was stripped). Every secret field is now removed, and imports are sanitised.
- Fixed: the wallet leaderboard's fallback could throw an unhandled error when a bad wallet-tracker key was set.
- Fixed: Telegram / Discord messages could contain clickable links chosen by token creators (Markdown masked links, auto-linked URLs and domains). Links are now broken with a zero-width space, Discord Markdown is escaped and link previews are off.
- Fixed: a malformed social handle could be "repaired" into a different real-looking link; invalid handles are now dropped.
- New launcher endpoints (`/api/bots`, `/api/notify`) use the same session token, Host / Origin checks, JSON-object-only bodies, size limits and a rate limit; bots are re-validated server-side; `bots.json` is owner-only. See [SECURITY-AUDIT.md](SECURITY-AUDIT.md).

## v12 — 8 Nov 2026
Token safety scanner, no-code strategy builder + community library, multi-chart workspaces, order flow, trade journal with AI review, replay challenges, local AI through the launcher, background alerts (Telegram / Discord), redesigned UI with 7 colour themes.
