<div align="center">
  <img src="assets/exterm-readme-hero.svg" alt="ExTerm Workstation — 240Hz Multi-Asset Quantitative Trading Terminal" width="100%" />
</div>

<div align="center">

# ExTerm v18.2

### The $0, local-first trading workstation for crypto, stocks, on-chain DEX tokens, options and futures, with a Quant Lab that coaches you, a Bot Fleet you arm deliberately, and a native Android app.

**Your money never leaves your broker, exchange or wallet.** ExTerm holds no funds and no keys: it paper-trades by default,
and live signals go only to a bot you run yourself on `127.0.0.1`, HMAC-signed and locked behind a 5-step arming wizard.

<img src="docs/screenshots/01-hero-chart-gex-dom.png" alt="ExTerm Markets terminal at 1440×900 (2× Retina): BTC candles with the plotted morning levels (previous day high, low and close, pivot, R1, S1), the GEX flip, call wall and put wall lines, the one-line Reach strip with the R:R, 2×2 and smart-trail tools under the navigation, the 6-timeframe confluence pill in the header and the Live Tape" width="100%">

**[Launch](#-30-second-local-launch)** · **[What's new](#-whats-new-in-v182)** · **[Screenshots](#-v182-tour)** · **[Android](#-android-app)** · **[Verify](#-how-to-verify-official-builds)** · **[Build & test](#-build--test)** · **[Security](#-security)** · **[License](#-license)**

<p>
  <a href="https://github.com/uexxx/ExTerm/releases/latest"><img src="https://img.shields.io/badge/download-v18.2-F5C84B?style=for-the-badge" alt="Download v18.2"></a>
  <a href="https://github.com/uexxx/ExTerm/releases/latest"><img src="https://img.shields.io/badge/Android-APK-2fd08a?style=for-the-badge" alt="Android APK"></a>
  <img src="https://img.shields.io/badge/price-%240-2fd08a?style=for-the-badge" alt="$0">
  <img src="https://img.shields.io/badge/indicators-137-F5C84B?style=for-the-badge" alt="137 indicators">
  <img src="https://img.shields.io/badge/backtestable%20strategies-134-CBD5E1?style=for-the-badge" alt="134 backtestable strategies">
  <img src="https://img.shields.io/badge/custody-zero-2fd08a?style=for-the-badge" alt="zero custody">
  <img src="https://img.shields.io/badge/license-proprietary-07080B?style=for-the-badge" alt="Proprietary license">
</p>
<p>
  <a href="https://www.instagram.com/exterm.labs"><img src="https://img.shields.io/badge/Instagram-@exterm.labs-E4405F?style=for-the-badge&logo=instagram&logoColor=white" alt="Instagram @exterm.labs"></a>
  <a href="https://x.com/ExTermLabs"><img src="https://img.shields.io/badge/X%20(Twitter)-@ExTermLabs-000000?style=for-the-badge&logo=x&logoColor=white" alt="X / Twitter @ExTermLabs"></a>
</p>

</div>

---

## ⚡ 30-Second Local Launch

ExTerm is one HTML file plus a small standard-library launcher. No account, no install step, no build step, no subscription.

**Windows**: unzip to e.g. `C:\ExTerm`, then double-click **`start-exterm.bat`**
(it falls back to the built-in PowerShell server, `serve.ps1`, if Python isn't installed).

**macOS / Linux**

```bash
cd ~/ExTerm
./start-exterm.sh        # macOS: double-click start-exterm.command
# or directly:
python3 serve.py         # http://localhost:8765, opens Chrome
```

**24/7 on a home PC or small VPS:** `python3 serve.py --bot-daemon --headless`, or `docker compose up -d`
(UI on the host's `127.0.0.1:8765` only). **Phone on the same Wi-Fi:** `python3 serve.py --lan` prints a pairing QR code.

Useful flags: `python3 serve.py 9000` (other port) · `--no-browser` · `--doctor` (health check, add `--offline` to skip network checks).

> Opening `exterm.html` directly also works for crypto, but browsers block some stock and on-chain sources. The launcher
> proxies only an allow-list of public market-data hosts, on `localhost`, behind a fresh per-launch token.

---

## 🎯 What's new in v18.2

A 26-lane cockpit with one strip, a Portfolio & Risk Console that never mixes paper and real money, and a build that fails if
any visible control is dead, throws, or keeps the main thread busy for 10 ms or more.

- **One 44 px strip.** The floating blur(12px) rail keeps its 5 tabs and gains, on the same strip: the **◎ active target** (symbol ·
  timeframe, click to open it on the chart) with a **★ star** (Lane 25 watchlist), **◫ Portfolio**, **Z** Zen, **R** refresh, the
  **26-lane mesh pulse dot** and the PIN-gated **PAPER | LIVE** pill. Below 820 px the rail keeps its 5 tabs at full width and the
  cockpit buttons sit in the dock's More sheet.
- **Hotkeys:** `1`–`5` tabs · `Z` Zen (hides the header, watchlist, ticket and toolbars; the chart takes the space) · `R` force refresh
  · `P` Portfolio & Risk Console · `Shift+Esc` FLATTEN ALL · `Ctrl+K` (now with Lane 25 search: `nvid` → NVDA, `bitcoin` → BTC-USD).
- **Portfolio & Risk Console (Lane 26).** PAPER and LIVE are separate books: the LIVE book only shows fills your bot ACKed, and a
  position tagged for the other book is refused by the page and by Lane 26 ("mixed balances refused"). Four tabular-nums KPIs
  (Net Liquidation Value · Available Buying Power · Total Open $ Risk to Stop · Day Realized + Unrealized PnL), per-venue cash and
  exposure, correlated VaR (ρ 0.6 inside a sector, 0.3 across) and the 25 % sector cap. Each open position has **Close 50 %** ·
  **Close 100 %** · **Stop → BE** (refused unless the position is in profit) · **Chart**. **FLATTEN ALL** / `Shift+Esc`, Closed Trades with
  a SHA-256 chain next to the Lane 19 ledger, and CSV / JSON export (spreadsheet-formula guarded). The old portfolio stays one click
  away behind **Full journal ▸**.
- **Lanes 20–26** (each its own process; on ≤ 8 GB machines, or with `EXTERM_COMPACT=1`, Lanes 20–26 run as threads of one process):
  - **20 · US session router:** pre / regular / post / closed (DST-aware), extended-hours equities as LIMIT + DAY, a 30-minute
    pre-CPI / FOMC throttle, the 50 % TP1 scale-out plan (then stop → break-even) and a SHA-256 idempotency key that blocks a
    retried order for 10 minutes.
  - **21 · Auto-Evolution:** closed paper trades are attributed to **Stocks EVO** or **Crypto/DEX EVO** (isolated books). Every 10
    outcomes a book takes one bounded step (minScore, ATR stop, TP2, risk %), drift-locked to ≤ 10 % of each range per generation
    and inside the Lane 18 bounds (risk ≤ 2 %). **↶ Rollback** restores the previous generation. `grok_exterm_bridge.py` reads
    the current parameters (`GET /evo`) and passes them to Grok with every `/signal`.
  - **22 · Outlier guard:** a 3-source rolling median (this feed, Lanes 9 / 10, live ticks) with a > 4σ robust (MAD) test. A wick
    another source confirms is kept; on a single feed only a true flash spike (> 4σ and > 3× the largest neighbouring wick) is
    clipped. Lanes 9 / 10 guard every candle set; the chart marks repaired bars with a Crimson ring.
  - **23 · Serial-rugger blacklist:** a deployer with two rugged pools is blacklisted, and the Lane 18 firewall blocks its pools.
  - **24 · Warm-boot snapshot:** cockpit state (Zen, stars, book, filter) restored on the next launch or a paired phone.
  - **25 · Search, aliasing & watchlist** · **26 · Portfolio VaR, sector cap & PnL aggregator.**
  - `GET /api/mesh`: all 22 lanes (5–26), self-heal (a dead lane process is respawned) and LIVE readiness (PIN set, firewall, ledger).
- **Atomic timeframe switches.** Every switch bumps a generation token (`tfSeq`); the ◎ target pill and the chart HUD show the new
  timeframe in the same frame, and an answer for an older token can no longer paint.
- **Chart HUD in a worker.** The Shift+Drag ruler (Δ price · % · bars · time), the outlier rings and the SYMBOL · TF watermark are
  drawn on an OffscreenCanvas in a Web Worker. A **Live →** pill appears when you pan away and snaps back to the last bar.
- **Hover pre-warm.** Resting ≥ 80 ms on an Alpha Recs card loads its candles, so *Open on 1s–1M Chart* puts them on the chart in the
  same click. **Stocks / 0DTE** is never empty: outside the session Lane 11 adds next-session plans from daily bars.
- **Frame-0 commits.** Rail tabs, the market switch, the Reach strip, tab changes made by a click, the Live Bot queue's Approve and
  the CSV / JSON downloads now acknowledge inside the click and do their heavy work on the next frame. That work still runs; it no
  longer blocks the click.
- **Measured** (offline test launcher, headless Chrome, desktop 1440 × 900): the crawl clicked 232 visible controls across the 5 tabs
  and the console, all alive, no errors, main-thread time per click p50 0.3 ms, p95 2.7 ms, max 5.3 ms; timeframe switch ≈ 2 ms;
  Lanes 20 / 25 / 26 compute in < 5 ms (Lane 26 ≈ 0.1 ms). Not measured here: 240 Hz rendering on a real 240 Hz panel, and memory
  use in compact mode.
- **Tests:** new `test/v182.test.js` (70) and `test/v182_flows.js` inside `v17pro_e2e` (the crawl at 1440 × 900 and 390 × 844, plus
  atomic 5m → 1h, the guard, the HUD worker + ruler, Zen, R, 1–5, the mesh, Lanes 25 / 26, the console, Stocks / 0DTE, hover
  pre-warm and EVO).

## 🎯 What's new in v18.1

Every chart now opens with candles straight away, whatever you click and however the symbol is spelled.

- **One symbol normalizer for every handoff** (`src/v181core.js` in the page, `norm_sym` in `serve.py` Lanes 9 / 10; the two
  are checked against each other by the tests):
  - `oc:eth:0x…`, `oc:sol:…`, `oc:base:…`, `oc:arb:…` and other chain spellings (ethereum, bnb, matic, avalanche, op), and
    DexScreener / GeckoTerminal URLs, all become the page's `oc:<network>:<pool>` form.
  - Raw `0x…` and Base58 contract addresses are resolved by Lane 9 (`/api/lane9/resolve`, DexScreener) to their most liquid
    pool. An `oc:` symbol that names a token instead of a pool is resolved the same way on the server.
  - `BTCUSDT`, `ETH/USDT`, `SOL_USDC`, `BTC-PERP` and `btc` become `BTC-USD`-style pairs; `NVDA`, `$nvda`, `BRK.B` and `^GSPC`
    stay tickers.
  - Clicks from **24/7 Bot Radar**, **24/7 Alpha Recs**, **◆ Picks**, the **Tracker**, the watchlist and **Ctrl+K** all go through it.
- **Instant hydration.** The candle loader answers from a Lane 9 / 10 page cache first and refreshes in the background. A
  store that has cached bars is filled synchronously, before the chart's next frame. If the provider is slow (> 60 ms), empty
  or failing, Lanes 9 / 10 answer instead, and the provider's late answer is merged in.
- **No more "sub-minute bars start with the next tick".** 1s / 5s / 15s bars are synthesized from 1m OHLCV, walking each
  minute o → l → h → c (or o → h → l → c), so the pieces re-aggregate to exactly that minute's OHLCV. The forming bar is
  bridged to the live spot. Real tick and trade bars replace them as they arrive, and a brand-new contract with no history
  still opens on a flat bar at its quote. Synthetic bars are marked `syn`.
- **Cross-lane pre-warming.** Symbols surfaced by the Bot Radar, Alpha Recs, Picks and the Tracker are pre-warmed in Lanes 9 / 10
  and in the page cache (`POST /api/lane9/prewarm`). On the server, Lanes 11–13 scanner candidates are pre-warmed into Lanes
  9 / 10 without the page. Pre-warmed keys refresh slowly, inside an upstream budget (≤ 3 Coinbase / Yahoo and ≤ 1 GeckoTerminal
  fetch per pass, GeckoTerminal at most every 6 s), and expire after 15 minutes unused.
- **24/7 Bot Radar → chart:** double-click a bot (or press Enter on the locked one) to open its coin. No panel is added; the
  canvas stays full-bleed. **Ctrl+K** offers *Open on chart* for a typed or pasted contract, DEX URL, `oc:` symbol or pair.
- **Fix:** the launcher's DEX watchlist price feed had been broken since v17.9 (a scanner tuple shadowed the chain map, so
  every `oc:` symbol raised a TypeError); DEX prices flow again.
- **Measured** (offline test launcher, desktop 1440 × 900): warm hydration p50 0 ms, max 1.3 ms; cold hydration p50 ≈ 115 ms;
  Alpha Recs clicks on pre-warmed symbols < 250 ms; Lane 9 / 10 warm answers < 25 ms, a never-seen key's first bars < 250 ms.
  A symbol nobody surfaced still waits for its upstream on a live launcher.
- **Tests:** new `test/v181.test.js` (25) and 10 v18.1 browser checks in `v17pro_e2e` (real clicks from Alpha Recs, Bot Radar,
  Tracker and Ctrl+K across 1s · 1m · 1h · 1d · 1M, desktop 1440 × 900 + phone 390 × 844, shared with `test/v181_flows.js`).

## 🎯 What's new in v18.0

- **5 tabs on the floating rail.** A new first tab, **24/7 Alpha Recs**. Bot Radar, Terminal Brain, Optional Live Bot and
  Co-Pilot / Paper are unchanged, and Bot Radar / Terminal Brain still have no HTML panels under their canvases.
- **24/7 Alpha Recs** reads the Lanes 11–16 recommendation engine (< 10 ms warm):
  - **Filters:** All · Stocks / 0DTE · Crypto / Perps · On-Chain DEX. **Tiers:** S-TIER · A+ · A · B+ · WATCHLIST (A+ is a
    peer-reviewed A that scores ≥ 86 and was not vetoed by the Monte Carlo).
  - Every setup shows its **Passed / Pending / Failed** criteria. Partial matches stay in the feed, so it never sits empty.
  - **Why:** the engines that fired, with their numbers: GEX / Zero-Gamma, Form 4 insider clusters (Lane 6), 30-day top-PnL
    wallets (Lane 5), Stoikov P_micro skew, funding, basis and Rug Shield v2. An engine with no data says Pending.
  - The 6-bot votes, the Lane 15 Monte Carlo (P(TP), expectancy, CVaR, slippage, verdict) and Lane 16's multi-timeframe
    alignment plus your journal's win rate on similar setups.
  - **Entry / Stop / TP1 / TP2 / R:R / Safe Size.** The size risks 1 % of equity at a 1-ATR stop, is capped at 25 % of equity
    and is halved when the Monte Carlo slippage is above 1 %.
  - **One click:** **Copy Setup** (text + `exterm-alpha/1` JSON) · **Open on 1s–1M Chart** (Entry / Stop / TP lines pre-drawn)
    · **Paper Mirror** (a paper limit at Entry that fills only after the L2 size queued ahead of it has traded) · **Send to
    Live Bot** (the Lane 18 Risk Firewall checks it first; then it goes to your Co-Pilot approval queue, or through the
    existing armed HMAC path in LIVE).
- **Fighter-jet 2D depth pill on the chart.** Seven passes you can toggle, redrawn from the live candles on every chart paint:
  volume-delta cores, L2 liquidity shelves, absorption / exhaustion glows, AVWAP ±1σ / ±2σ, GEX strike lines (call wall, put
  wall, zero-gamma flip), a 1σ expected-move cone, and 5m / 15m ghost candles behind 1s–15s charts. Measured p95 ≤ 1.2 ms
  per frame.
- **Cockpit:**
  - A crosshair magnifier on `requestAnimationFrame`, so it updates at your display's refresh rate: bid / ask imbalance,
    absorption rate, P_micro and a millisecond countdown to the candle close. The book figures need an order book (crypto).
  - Drag-handle R:R lines, 3-point pattern alerts, and **Ctrl+V** anywhere to load a pasted contract address.
  - **Shift+P** smart pyramid (adds only into a winner and lifts the stop to break-even) and **Shift+F** atomic flip.
  - v18 commands in **Ctrl+K** (opens in < 10 ms), and a one-thumb action arc on phones.
- **`python build.py --harden`** now also scans the bundle and the launchers for credential-shaped strings and stops on a hit.
- **Tests:** new `test/v180.test.js` (35) and 20 v18.0 browser checks in `v17pro_e2e` (desktop 1440 × 900 + phone 390 × 844,
  shared with `test/v180_flows.js`).
- **Also in this release:** v17.9 and v17.8 below. Neither was released on its own.

## 🎯 What's new in v17.9

- **One 19-lane mesh.** Lanes 1–4 (v17.5) plus 15 fast lanes, each its own OS process, pre-warmed 24/7 and answered from RAM.
  `GET /api/fast` shows every lane's pid and latency.
- **Lanes 9 · 10 — 1s–1M candles.** Crypto + DEX (Coinbase, GeckoTerminal) and US equities (Yahoo) bars, stitched to the live
  tick. Every chart timeframe pill asks them first (< 20 ms warm); the existing loader still answers whenever a lane has no
  real data.
- **Lanes 11–16 — the 24/7 recommendation engine** in a new **◆ Picks** drawer:
  - **Scanners:** equities and 0DTE gamma (flip, walls, max pain, ORB + AVWAP, PIN, RMT residuals); crypto perps squeezes
    (funding, basis, micro-price skew, cross-exchange impulses); on-chain Rug Shield v2.
  - **Then:** transfer entropy + BOCPD + a 6-bot peer review → a 1,000-path fat-tailed Monte Carlo with liquidity stress →
    multi-timeframe confluence + your journal's win rates.
  - **Output:** S-TIER / A / B+ / Watchlist with Passed / Pending / Failed badges (< 10 ms warm, never empty).
- **Lanes 17–19 — execution** (< 5 ms per call through the lane process):
  - **17:** a smart order router with RAM-only shadow brackets and POV-paced IOC slices. It writes plans only; ExTerm still
    holds no keys.
  - **18:** a pre-trade risk firewall: honeypot / freeze veto, ≤ 2 % slippage cap, ATR + Kelly sizing, VaR heat cap, 3-loss
    cooldown, dead-feed lock, pre-FOMC / CPI pause, and **PIN-protected PAPER → LIVE arming**.
  - **19:** fill accuracy in bps, a < 500 ms toxic-flow scratch, a 3-stage profit-lock ratchet, and a **SHA-256 hash-chained
    audit ledger**.
- **24/7 Optional Live Bot strip:** tabular-nums execution / firewall telemetry, a PIN-gated **PAPER | LIVE** switch (the Arm
  wizard stays locked until LIVE is unlocked) and **FLATTEN ALL** (Shift+Esc).
- **`grok_exterm_bridge.py`:** a token-authenticated local bridge on 127.0.0.1 that sends Grok's trade ideas through Lane 18.
  It answers in PAPER mode only and never places orders.
- **Also in this release:** everything below under v17.8, which was not released separately.
- **Tests:** new `test/v179.test.js` (40) and 8 new v17.9 checks in `v17pro_e2e` (desktop 1440 × 900 + phone 390 × 844).

## 🎯 What's new in v17.8

- **4 new dedicated server lanes in `serve.py` (Lanes 5–8).** Each one is its own OS worker process with a 16-thread fetch pool and
  a 50 ms LRU micro-cache. Each pre-warms 24/7 before you open the page. Requests read a RAM snapshot and never wait on an upstream.
  Measured warm answers on the server are well under 2 ms. From the page, the budget is < 30 ms (Lanes 5–6) and < 25 ms (Lanes 7–8).
  - **Lane 5 · Crypto / Perps / On-Chain PnL:** a 50+ wallet On-Chain PnL leaderboard for **24h | 7d | 30d**. It shows realized
    PnL, win rate, **Smart Score** (win rate % × ln(closed trades)), top tokens and the full copyable address, all computed from each
    wallet's Hyperliquid fills. Plus the Hyperliquid 30d perp leaders and **live whale-buy notifications** (opening buys ≥ $50K).
  - **Lane 6 · Stocks / SEC Form 4 / 13F:** the newest SEC Form 4 filings, parsed into insider **buys and sales**, plus
    **CEO / CFO / Director clusters**, the latest 13F-HR filers and **live insider-buy notifications** (≥ $100K). Lane 6 stays
    under SEC fair-access limits. Congressional trades have no free, key-less source, so ExTerm says so instead of faking them.
  - **Lane 7 · Crypto + DEX transactions tape:** Coinbase prints and GeckoTerminal swaps. Rows carry USD size, WHALE / MEV tags
    and wallet badges (WHALE · BOT · NEW).
  - **Lane 8 · US stocks tape:** 1-minute time-and-sales, block prints (≥ 3× average and ≥ $1M), an options unusual-volume list
    and a modelled L2 book (clearly flagged).
  - When an upstream rate-limits, Lanes 7–8 serve stand-in rows **tagged SYNTH**, so the tape never sits empty and synthetic rows
    can never be mistaken for real prints.
- **Social & Trackers are back** in Co-Pilot / Paper (**◎ Tracker** drawer). They follow the symbol's market: stock insiders and
  13F, or on-chain smart money and whale buys. Every row has 1-click **Load ticker** or **Pin to 24/7 Bot Radar**.
- **Full-range L2 liquidity ladder** on the live chart. Resting bid / ask shelves cover the entire visible price axis, below and
  above price, and re-size and bevel-light on every tick. Real book levels are used when the venue streams them, extended by a
  labelled depth model across the rest of the axis.
- **Zero-copy tick pipeline:** typed `Float64Array` ring buffers (`SharedArrayBuffer` when the page is cross-origin isolated),
  `DataView` binary frames, 240 Hz (4.16 ms) coalescing, O(1) EMA / ATR / VWAP, `desynchronized` 2D contexts, cached font metrics
  and `OffscreenCanvas` glow sprites.
- **24/7 Bot Radar predator HUD:** a spring-inertia Gold magnetic crosshair, a 3-arc orbital lock (**`[` / `]`** cycle the top 5
  Inner Ring executors, **S** toggles a sonar ping) and a volume-clock sweep. Also: a Crimson VPIN halo above 0.75, 5–30 s velocity
  cones, 60 s ghost trails, iceberg reload rings, spoof-cancellation flashes, Slot 0–2 cabal tethers, sandwich double-rings, and Gold
  bridge filaments for cross-chain moves above $250K. A **Mirror Flow / Fade Trap** pill sits on the locked bot. Hover **Net Bot
  Pressure** for the last 10 anomalies.
- **Self-healing Terminal Brain:**
  - BOCPD + HMM regime cadence, Gold shockwaves on zero-gamma flips, and transfer-entropy lead-lag filaments.
  - Click a node to solo its ring (feed · proc · bot · lane). **Space + drag** scrubs a 60 s flight recorder; **E** exports it
    (< 50 KB).
  - A zero-GC `Float32Array` particle pool, hedged < 50 ms lane failover, and a **Crimson execution lock** that blocks orders when
    no market data has arrived for > 5 s.
- **Below-chart Live Transactions tape, repaired:**
  - Every market now streams rows: crypto, stocks and on-chain / DEX.
  - On phones the control strip and filter chips wrap instead of clipping, so Pause / Live, Whales, Blocks, Buys, Sells and Min $
    are all on screen and tappable.
  - Stock 1-minute aggregates are no longer counted as whale prints.
  - Click a row's Venue / Maker for a 1-click inspector (flow, Track, Copy, Pin).
  - The tape is restyled to the two-signal Gold / Crimson palette with tabular numerals.
- **Tests:** new `test/v178.test.js` (35) and 12 new v17.8 checks in `v17pro_e2e` (desktop 1440 × 900 + phone 390 × 844).

## 🎯 What's new in v17.7

- **Strictly 4 tabs, zero clutter.** One floating translucent rail (blur 12 px, tabular-nums mono) that fades when you stop moving:
  **24/7 Bot Radar** · **Terminal Brain** · **24/7 Optional Live Bot** · **Co-Pilot / Paper**. Every older workspace still exists
  inside one of them; the legacy nav bar, stacked cards, mode pickers and title headers are gone.
- **24/7 Bot Radar: full-bleed 100vw × 100vh.** Every live print is fingerprinted into bot archetypes on 3 proximity rings:
  passive scanners (outer, tiny dim dots), staging / limit walls (middle, vector tails), executors, MEV, snipers and whales
  (inner, sharp pulse rings). There are fading motion trails and Gold buy / Crimson sell colours. Callouts appear only on
  anomalies, and telemetry only on hover or click target lock. Three corner numbers (Active Bots · Bot Volume Share % · Net
  Bot Pressure) and All / Executors / MEV/Whales pills. With no live trade stream it says **SIMULATED FLOW**.
- **Terminal Brain: full-bleed 100vw × 100vh.** Every worker lane, feed, process and squad bot is one live node. Their telemetry
  drives node velocity, pulse intensity, line tension and colour, with zero panels below. Both canvases measure p95 ≈ 0.7 ms
  per frame (budget 1.2 ms) and drop to 0 fps when hidden.
- **24/7 Optional Live Bot.** A clean execution view: one Co-Pilot switch, one Arm button (the 5-step wizard), the approval queue.
- **Tactile 2D depth chart.** The detached 3D chart mode is deleted. Its layers now draw as 13 depth-shaded 2D passes on the live
  1s–1m chart, repainted on every tick: parallax depth grid, volumetric gradient, extruded bevel candles, glow halos, OB slabs,
  VPVR / POC shelf and whale beacons by default, plus CVD, GEX, liquidity, FVG, AVWAP and R:R.
- **Tests:** new `test/v177.test.js` (30) and 14 new v17.7 checks in `v17pro_e2e` (desktop 1440 × 900 + phone 390 × 844).

## 🎯 What's new in v17.6

- **THE SYNAPSE → 4D singularity.** The Working Bots wireframe core is replaced by one off-thread canvas that layers:
  - a tesseract rotating in the XW / YW / ZW planes, with a counter-rotating inner tesseract;
  - four (p, q) torus knots on nested Clifford tori in S³ (Hopf fibration S³ → S²), stereographically projected;
  - a Keplerian Bullion Gold / amber accretion vortex around a photon-ringed event horizon;
  - L-system dendrites and plasma bolts reaching out to the **6 orbiting holographic squad nodes** (HUNTER-α … HEDGER-ARB), each showing its live status and fire count.
  - You can drag to orbit and use the wheel to zoom. It draws at up to the display refresh rate in the 3D Spatial worker, and drops to 0 fps when hidden.
- **3 wide panels instead of 8 small ones:**
  1. Strange attractor + Merton probability cone (P10–P90, Hurst H, Lyapunov λ₁, +EV, Kelly f*).
  2. Eigen-risk sonar + worker mesh (W1–W8 avg / p99 ms bars and the lane table).
  3. Squad execution stream + KPIs. Win rate, profit factor, per-trade Sharpe and the equity sparkline come **only from bots that are actually running**. DEMO events are labelled and never counted.
- **New top-level Alpha Radar tab.** It has its own 3D quantum-constellation dome: a wave-interference torus, 4 market quadrants, a sweeping volumetric beam, grade-elevated orbs, transfer-entropy arcs and a targeting reticle.
  - Every live stock, coin, perp and on-chain pool is graded by the applicable ExTerm engines plus a **6-bot consensus debate**.
  - Each card is a 6-box dossier (Trigger · Safe Max $ at ≤ 2 % impact · GEX / Funding / Rug-Shield · Regime Edge · Entry / Stop · TP1 / TP2 & R:R) with a plain-English summary.
  - One-click handoffs: Chart + 3D · 3D Shock Test · Load R:R Ruler · Deploy Bot Rule (queued behind the Co-Pilot firewall).
  - Sub-tabs with counters, S / A+ / A / B+ grade pills, Pause / Resume, and Pin / Lookup for any ticker or CA.
  - Grades are deliberately pulled toward neutral until a symbol has 60 live samples, so a new symbol never looks better than its data.
- **DEX Bubble Map fixed.**
  - It now shows **28–40 pools per chain**, merged from GeckoTerminal trending (2 pages), DexScreener boosted pairs and new pairs, never mixing real pools with simulated ones.
  - The **5m · 1h · 6h · 24h** pills and a **Refresh** button sit on the map. Each window re-labels every %, recolours and resizes each bubble from that pool's own price change, and gives the springs a kick.
  - Bubbles are no longer cut off by the 470 px Discovery scroller.
- **On-Chain Token Desk** (On-Chain tab):
  - chain pills (All Chains · Solana · Base · Ethereum · Arbitrum);
  - a CA resolver with DexScreener + GeckoTerminal hydration;
  - **Rug Shield v2**: Sybil entropy, slot-0 bundle share, LP lock, smart-money retention half-life. Each check says *n/a* when it can't be measured instead of guessing;
  - an **MEV priority-fee sandwich predictor + TWAP slicer**;
  - handoffs: Load on Main Chart · 3D Shock Lab · Copy CA.
- **Clipping fixes:**
  - the EDGE quant strip no longer clips glyph tops;
  - the chart toolbar wraps instead of sliding under the order ticket;
  - on phones the Trade sheet was anchored to `main` (whose `perspective` made it the containing block), which pushed the ticket's Buy / Sell row and symbol above the screen. It now sits above the dock.
- **Tests:** new `test/v176.test.js` (26). `v17pro_e2e` now runs 96 checks (+16 for v17.6: singularity pixels, drag / zoom, Alpha Radar, dome RGBA variance + frame budget, handoffs, quant strip / toolbar / ticket clipping, ≥ 25 bubbles inside the canvas, timeframe switching, bubble click → chart, On-Chain desk, every tab error-free on desktop 1440 × 900 and phone 390 × 844).

## 🎯 What's new in v17.5

**Multi-Worker Sovereign 3D & Quant Frontier: 8 browser worker lanes plus 4 Python process lanes, search inside every tool, a truthful Working Bots squad, a 3-layer default 3D chart and 30+ quant engines. The pre-v17.0 Obsidian `#07080B` / `#0D1117` and Bullion Gold `#F5C84B` palette is locked by tests.**

- **8 dedicated Web Workers** (`src/v175work.js`, one blob, allow-listed ops per lane, `Float64Array` arguments transferred zero-copy):
  Feed / L2 · 3D Spatial / Shock Physics · On-Chain / Bellman-Ford · Options GEX / IV · Screener / Causality · Quant Lab / CPCV · Bot Squad / Ledger · Copilot RAG / Flight Recorder.
  - Per-lane state (BUSY / IDLE / HIBERNATE), jobs, queue depth and avg / p99 ms appear in THE SYNAPSE.
  - The Working Bots canvases render in the 3D Spatial worker through `OffscreenCanvas`. The main thread only posts a small state snapshot per frame.
  - **Measured:** with the full Synapse visible, v17.5's main-thread frame work is p95 ≈ 0.2 ms (headless Chrome, 1440 × 900). The e2e gate is ≤ 1.2 ms. Hidden or off-screen canvases drop to 0 fps.
- **4 isolated Python lanes in `serve.py`:** Market / WS Ingest · On-Chain DEX / DAG Forensics · Heavy Quant / GEX / Shock Math · Copilot / Bot Execution.
  - Each lane is its own lazily started `ProcessPoolExecutor`, exposed at `GET /api/lanes` and `POST /api/lanes/run`. Both are token-gated; jobs are allow-listed and work-capped.
  - **Measured:** the ingest lane answers in < 250 ms while the quant lane runs an 800k-step Monte Carlo.
  - `EXTERM_LANES=thread` runs the same lanes as dedicated threads; `--no-lanes` turns the endpoints off.
- **"Search any stock, coin, or paste meme coin CA…" in every tool**, with **Use Active Chart Symbol**: all 19 tool tabs (the chart has a compact one-line row) and the Morning Briefing.
- **Working Bots squad.** HUNTER-α · SNIPER-EXEC · SCALPER-EXIT · RISK-GUARD · MUTATOR-EVO · HEDGER-ARB, bound 1:1 to real bus events.
  - The squad shows **STANDBY** until a bot runs. **Explore Live Demo** shows clearly labelled DEMO events, which feed only the squad, never the global bus.
  - The demo stops itself the moment a real bot starts. Zero demo signals are shown while real bots run, and the tests check this.
  - On top sits a 4D core: Clifford torus rotating in 4D, Hopf fibration, Kerr ring with frame-dragging spirals, and L-system lightning on every fire.
  - 8 panels below it:
    - 3D Lorenz–Rössler attractor with Hurst H, Lorenz λ₁ and permutation entropy.
    - 100-path Merton jump-diffusion cone: P10–P90, hover crosshair, ±EV, t-gated Kelly f*, 95 % VaR / CVaR.
    - Sweeping eigen-risk sonar with a −3σ gauge.
    - Sub-ms firing matrix.
    - Events/s + p99 latency histogram.
    - Squad KPIs.
    - Worker mesh (8 + 4 lanes).
    - 30 edge engines.
- **Main-chart 3D: at most 3 layers by default** (OB Prisms + VPVR / POC + Whale Beacons). A **3D Layers** drawer holds 9 more: L2 Terrain, CVD Pillars, GEX Towers, Liq Pools, FVG Tunnels, AVWAP Canyon, 3D R:R Hologram, 6-TF Strata and 4D Replay Scrub. Presets live in IndexedDB.
- **Optional 2D | 3D pills** (fast 2D stays the default) on 10 tools:
  - On-Chain cabal DAG + CLMM volcano
  - Options IV & GEX surface + spot-shift
  - Futures DOM waterfall
  - Screener alpha cube
  - Pulse whale globe
  - Derivs arb hyper-graph
  - Quant Lab Sharpe surface + DNA helix
  - Copilot Bull / Bear / Risk tetrahedron
  - Portfolio equity / drawdown canyon
  - Ctrl+K carousel
- **3D Order-Book Shock & Scenario Flight Simulator (Quant Lab):** 156 deterministic scenarios (6 categories × 26).
  - Sliders for Order Size $, Book Depth %, Vol Multiplier and Spoof Pull %.
  - Runs on the live L2 book when it matches the price, otherwise on a model book.
  - **Stress-Test My Open Positions & Active Bots** for any searched ticker or CA.
- **30+ engines computed in the lanes for the active symbol:**
  - Easley–O'Hara PIN (grid MLE), Almgren–Chriss, FFT cycle + Haar wavelet, adaptive Kalman, spoof half-life, order-type selector, IOC shadow bracket, draw-to-bot compiler.
  - Sybil wash entropy, MEV sandwich, smart-money board, Breeden–Litzenberger RND, gamma–vanna–charm, max-pain pin risk, Hawkes DOM, latency impulse.
  - Marchenko–Pastur RMT, transfer entropy, Clayton / Gumbel copulas, BOCPD, vol cone, Bellman–Ford arb, genetic alpha with deflated Sharpe + CPCV, inverse stress, Thompson bandit, shadow twin, IF-THEN automator, Bayesian 3-agent co-pilot + journal RAG, MFE / MAE.
  - Where an input isn't available (e.g. no live option chain), the readout says so, for example "model chain".
- **WebAudio Sonar · Voice HUD (Shift+V) · 60 s Flight Recorder (Shift+R, JSON download).** On the chart tab, Shift+V keeps the v17.0 voice commands.
- **Tests.**
  - New `test/v175.test.js` (118 checks). It covers closed-form accuracy: Black–Scholes 10.4506, Breeden–Litzenberger mass 1 / forward mean, Lorenz λ₁ ≈ 0.906, Merton median, C(6,2) CPCV, and more.
  - New `test/v175_lanes_test.py` (20).
  - `v17pro_e2e` now runs 80 checks (+15 for v17.5, desktop + phone).

## 🎯 What's new in v17.3

**The pre-v17.0 gold is back exactly, the bubble maps never freeze, and THE SYNAPSE gets two high-velocity, additive-light engines.**

- **Exact pre-v17.0 Obsidian & Gold.** I measured the v16.6 build (`961e97d`) in a browser and restored its palette value for value:
  - obsidian `#0B0E14` body, `#0F131B` / `#141924` panels
  - brushed gold `#D4AF37` with `#F5B841` / `#E5C158` highlights and the gold → silver `#CBD5E1` active pill
  - warm ivory text `#f6f3ea` / `#a59d8a`
  - `#2fd08a` / `#ff5a5f` gains and losses

  The v17.1 slate overrides and the v17.2 strict token block are gone, the 18 pre-v17 modules carry their v16.6 colours again, and v17-era chrome uses the same warm tones.
- **Live bubble maps (Desktop + Mobile).** The On-Chain map (Age × Buy Pressure), the Market / Discovery map and the heat bubbles share one physics engine:
  - **Layout:** 25–40+ tokens (up to 86 on the Market map) filling ~85 % of a ResizeObserver-sized canvas. Market bubbles keep their momentum through every price refresh instead of being rebuilt.
  - **Motion:** (Age, Buy-Pressure) spring attractors with orbital and buoyancy currents, elastic collisions, wall containment, hover repel and drag-fling.
  - **Lighting:** glossy emerald / crimson spheres with ticker + live %, additive `lighter` halos, specular highlights and gold / emerald / crimson shockwave rings on every update.
  - **Flat-line fix:** when the feed has no buy/sell counts, buy pressure is estimated from the 1h change (flagged as an estimate).
  - **Hidden:** 0 fps whenever the map is not visible.
- **THE SYNAPSE: Visual Engine Switcher.** Choose **Synapse Cortex** | **Singularity Burst** | **Auto-Morph** (cross-fades every 12 s), wired to `window.__EXTERM_BUS` for All Terminal Activity and Working Bots.
  - **Synapse Cortex:** a fast-pulsing gold core, ~970 procedural fractal dendrite segments lit by travelling waves, comet packets relaying across all six nodes, and spore cascades.
  - **Singularity Burst:** a pitch-black event horizon with thousands of radial filaments, coronal plasma tendrils, shockwave flashes and callouts (TICK BATCH · WHALE SWEEP · GEX SHIFT · 3D OB WALL · FIREWALL PASS / BLOCK).
- **Telemetry matrix.** `// RUN LOG · // ACCESS LEDGER · // BLAST RADIUS · // ACTION HEAT · // THROUGHPUT · // BOT STATUS`, plus Signal Rotation and The Pricer. Record X Clip still hides dollar balances.
- **Tests.** New `test/v173.test.js` (34 checks). `v17pro_e2e` now runs 65 checks, adding multi-frame bubble velocity and brightness, and Cortex / Singularity RGBA brightness and variance.

## 🎯 What's new in v17.2

**Obsidian & Bullion Gold everywhere, and the Bot Fleet becomes THE SYNAPSE: a live neural cockpit of every background process in the terminal.**

- **Strict Obsidian & Bullion Gold theme.** Obsidian `#07080B` background, `#0D1117` panels, `#161B22` card headers, Bullion Gold `#F5C84B` accents, Emerald `#22C55E` gains and Crimson `#EF4444` alerts, on every workspace and every phone screen.
  Obsidian & Gold is now the default theme, and existing installs move to it once (the theme picker still works). 106 off-palette violet, rose and mint literals across 22 source files now use the palette, and chart overlays such as EMA50 use platinum `#CBD5E1` so they stay distinct from gold.
- **THE SYNAPSE (Bot Fleet).** A full-width cockpit: a 3-column stage plus a 3-card bottom row on desktop, stacked cards under 820 px.
  - **Sensory Input Layer:** live sparklines and meters fed by real processes:
    - WS ticks/s (`Feed.tickL`)
    - L1/L2 SWR cache hit rate (Resource Timing plus a new `Server-Timing: swr` header from `serve.py`)
    - Worker Math jobs/s (`Worker.postMessage`)
    - Cross-Exchange CVD (`V170UI.merger`)
    - GEX regime and volatility
  - **The Synapse:** six glowing node cards (TAPE/CVD · GEX/DOM · 3D OB · SCREENER · AI BRIDGE · FIREWALL) around a rotating geodesic ExTerm core. Dendrite curves fire impulses for every background event: Gold for tick, cache or mutation, Emerald for signal, whale or fill, Crimson for a firewall block.
  - **Cortex & Synaptic Weights:** active symbol price, mini curve, and animated CVD · GEX · 3D OB · Momentum · Risk Budget weight bars.
  - **Signal Rotation:** a phase-space momentum attractor redrawn at display rate.
  - **The Trace:** a millisecond-stamped stream of WS bursts, cache hits, GEX recalcs, screener scans and firewall gates.
  - **The Pricer:** a Monte Carlo fan of 48 GBM paths (σ from live closes), coloured Gold, Emerald or Crimson, with p5–p95 bands.
  - **Controls:** an All Terminal Activity / Bot Fleet Only filter and **Record X Clip**, which hides dollar balances automatically during the recording. The Synapse runs at 0 fps when hidden.
- **Tests.** New `test/v172.test.js` (35 checks). `test/v17pro_e2e.js` now runs 59 checks, including theme tokens, Synapse pixel variance, background pulse firing, a Crimson firewall impulse, and the mobile stacked layout.

## 🎯 What's new in v17.1

**Desktop, phone (< 820 px) and the Android APK get the same build.**

- **Two header rows instead of four.** The scrolling ticker repeated the bottom strip and the group captions repeated the tabs, so both are gone. You now get one workspace bar and one Reach / filter bar, 64 px together, which gives 52 px back to the chart.
  AI Bridge and Quant Lab are now only in the nav, and 3D has moved onto the chart toolbar.
- **Contrast meets WCAG AAA.** Colours are `#07080B` base → `#0D1117` cards → `#161B22` headers, with `#F8FAFC` / `#F5C84B` primary text (≥ 7:1) and `#94A3B8` secondary labels. Nothing is smaller than 11 px.
  Sub-penny prices use subscript notation (`$0.0₅2115`), and a token with no logo gets a monogram avatar instead of a blank square.
- **Live context strip.** Every workspace except the chart shows the active symbol, its price and change, your open positions, their unrealised P&L, and NET BE. **Esc** closes the top modal or drawer.
- **Global ledger: `window.__EXTERM_LEDGER`.** Positions, resting orders, NET BE, partial take-profits and trailing-stop high-water marks are kept in one ledger, saved to IndexedDB and checked on every tick, whatever tab is open.
  Logs use fixed-size ring buffers, so memory doesn't grow in a 24/7 session.
- **Real price impact.** Every paper or bot fill is priced off an AMM `x·y=k` pool model (DEX tokens) or by walking L2 depth (crypto, stocks, futures). The ticket shows **Est. Price Impact %** as you type.
- **⏻ FLATTEN ALL (`Shift+Esc`).** One button, always visible (it floats on phones), closes every position, cancels every order, stops every bot and empties the co-pilot queue.
- **Drawings stay put.** They are stored as (epoch ms, price), so they keep their place when you switch timeframe or venue.
- **Copilot always answers.** Free-form prompts go to local Ollama (`127.0.0.1:11434`, $0) or to your own Grok, Claude, DeepSeek or OpenAI key, with the live context attached: candles, CVD, GEX, order blocks, Rug Shield, ledger and journal.
  A **Quick-Connect** card can auto-detect Ollama or take a pasted key. If no model is reachable, a deterministic local analyst replies instead of an error.
  Replies come with 1-click pills: **Plot Levels · Load in R:R Ruler · Run in Quant Lab · Queue Bot Rule Behind Firewall**.
- **Search inside every tool.** Derivs & Arb, Options, Futures, Quant Lab, Pulse, Bot Fleet, AI Bridge, Copilot, Grok and the Screener all have a **"Search any stock, coin, or paste meme coin CA…"** bar plus **Use Active Chart Symbol**.
  You switch symbol without leaving the tool.
- **Flow → Derivs & Arb works for any symbol:**
  - meme coins: cross-DEX pool arbitrage with $1K / $10K slippage per pool
  - crypto and perps: cross-exchange quotes, funding, open interest and liquidation clusters
  - US stocks: lit spread, put/call OI, IV rank, max pain, GEX walls and IV skew
- **3D on the main chart.** A **3D** pill on the toolbar works for every symbol and contract address on desktop and phone. It shows volume prisms on a calibrated floor grid, Bullion Gold order-block wireframes and L2 particle walls.
  Top / Side / Isometric camera presets, drag to rotate, double-click to reset. It follows Replay, and the canvas resizes with the chart through `ResizeObserver` at the screen's pixel ratio.
- **Bot Fleet Neural Core.** A geodesic core listens to `window.__EXTERM_BUS`: six orbiting subsystem nodes, Bezier light trails, gold / emerald / crimson shockwaves, a live telemetry ticker and a Monte Carlo cone.
  It has an **All Terminal Activity / Bot Fleet Only** filter, **Auto-Cycle Evolution** (on by default) and **Record X Clip**. It runs at the display's refresh rate (120 / 240 Hz) and drops to 0 fps when the tab is hidden.
- **Bubble Map fills ~85% of the viewport.** Labels show full tickers and live % change, and the map redraws when the window is resized.
- **Zero-stale-price lock.**
  - Failover order: DexScreener → Jupiter (Solana pools) → Coinbase / Kraken / Binance.
  - The rate-limited `solana-rpc.publicnode.com` is tried last, and launcher cooldowns are capped at 60 s.
  - If every live provider fails for more than 5 s, a crimson **STALE FEED · Xs** pill and a **DELAYED DATA** stamp appear, and Bot Fleet and live execution are locked until fresh ticks resume.

## 🎯 What's new in v17.0

Every workspace is **one click away** on the new one-line **Reach strip** under the navigation:
`Stocks · Crypto · On-Chain · Options · Futures · Screener · Pulse · Bot Fleet · Academy · Live Tape · Whales $25K+ · Tracker · Positions · Briefing` (v17.1: 3D is on the chart toolbar; Quant Lab and AI Bridge are in the nav).
Nothing new is painted over the 240 Hz / 120 Hz chart canvas: chart additions are thin lines drawn from a cached offscreen layer.

**ƒ Quant Lab Edge-Coach** (top of the Lab tab)
- Per-trade **MFE / MAE** with exit capture %, and **4 h post-exit Shadow Counterfactuals** ("exited early" / "good exit").
- **Hour × weekday win-rate heatmap** (UTC), a **0–100 Walk-Forward Overfitting Score** from anchored in-sample vs out-of-sample folds.
- **Prop-Firm Challenge simulator** for **$50K / $100K / $200K** (8% target, 5% daily, 10% max DD, 30 days; seeded Monte Carlo).
- **0.5×–3.0× ATR SL / TP R:R heatmap**: click any cell to **apply it to the chart**. **Quarter / Half / Full Kelly** sizer, **0–50 bps slippage re-sim**.
- **OHLCV CSV import**, a **Pine Script v5 inline linter**, an **Obsidian / Gold tear-sheet export**, **Send Backtest Leaks to AI Coach**,
  and **sanitized `.exterm.json` playbooks** (keys, secrets, wallets, URLs and addresses are stripped on export and import).

**⚙ Workstation (Phase 3)**
- **2-layer canvas**: an offscreen static layer repaints only when its dirty flag is set (idle tick < 0.002 ms), with **O(1) spatial-hash hit-testing** for chart labels.
- **Bot Fleet tab**: No-Bot gate + demo bot, **Paper Sandbox / Attended Co-Pilot (1-click approve) / Live Unattended 24/7**, a mandatory
  **5-step arming wizard** (risk acknowledgement · zero-overdraft settled-cash cap · max slippage bps · daily loss kill-switch · type `ARM LIVE BOT`),
  a `Float32Array` **Neural Strategy Torus** that drops to **0 fps** the moment the tab is hidden, and a seeded **Self-Improving loop**.
- **New-day Morning Briefing**: levels, movers, events, 7-day history and **1-Click Plot All Morning Levels**; reopen it from the **☀ Briefing** pill.
- **Live GEX flip / call wall / put wall** (Deribit OI for BTC / ETH / SOL, a labelled model chain otherwise), a collapsible **DOM Spoof Ladder**, a **6-TF Confluence** pill.
- **Options**: multi-leg builder, payoff at expiry with 1σ / 2σ cone, live Greeks. **Futures**: RTH / ETH volume profile (POC / VAH / VAL), tick-risk calculator, crypto liquidation clusters (estimate).
- **On-Chain Lab** in the Screener: rug / honeypot AMM simulator, block-0 sniper-bundle bubble map, smart-money leaderboard.
- **Pulse tab** (0 extra network calls): breadth, **last-12 CPI / FOMC reaction backtester**, **Portfolio Beta Shock slider (−10% ↔ +10%)**, **Bull / Bear / Risk debate**, SEC filings strip for stocks.
- **3D tab**: volumetric order blocks + L2 wall fusion + replay scrubber. Plus **2×2 multi-chart sync**, **R:R ruler**, **NET BE line**, **smart trailing stops** and **voice commands** (`Shift+V`; orders are only ever staged, never sent).

**🎓 Academy (Phase 4)**: five modules of interactive missions on the $100K paper account, covering every v17.0 tool, plus a
**Custom Drill Generator** that targets the mistake tag on most of your losing journal trades.

**📱 Polish & mobile (Phase 5)**
- **First-launch 10-language picker** (EN · ES · ZH · JA · KO · FR · DE · PT · AR-RTL · HI), saved in IndexedDB.
- Obsidian `#07080B` & Bullion Gold `#F5C84B` refinements: tabular numerals, inline depth bars, Rug Shield badges on DEX rows,
  34 px primary / 28 px sub-tabs, and **Hide Balances** (`$***,***` everywhere a balance shows).
- **Mobile app below 820 px**: 5-tab bottom dock, floating thumb-arc pill, swipe watchlist (← remove, → pin), landscape split,
  left / right-handed layout, sizing keypad, clipboard CA snipe, 1-tap **Phantom / Solflare / Jupiter / Uniswap** deep links
  (**ExTerm adds a $0 fee**; network and DEX fees still apply), QR pairing of your layout, AMOLED `#000000`, PIN or biometric lock,
  Share Setup Card and Picture-in-Picture.
- **Native Android app**: [`ExTerm-v18.2-android.apk`](https://github.com/uexxx/ExTerm/releases/latest).

**🛡 Launcher (Phases 0–1)**: a 429 storm shield (single-flight requests, per-host cool-down that honours `Retry-After`, stale
fallback), a cross-venue crypto tape (Coinbase · Kraken · Binance · Bybit · OKX) with basis, funding, spread and CVD, instant
chart switches from a RAM + IndexedDB candle cache, a Discovery formula scanner, a clipboard sniper and a supervised 24/7 daemon.

Full notes: [`CHANGELOG.md`](CHANGELOG.md).

---

## 🖼 v18.2 tour

<img src="docs/screenshots/43-portfolio-risk-console.png" alt="The Portfolio & Risk Console: PAPER | LIVE book switch, Lane 26 timing, four KPIs (Net Liquidation Value, Available Buying Power, Total Open $ Risk to Stop, Day Realized + Unrealized PnL), per-venue cash, VaR and sector cap line, open positions with Close 50 % / Close 100 % / Stop → BE / Chart, FLATTEN ALL, CSV / JSON export, Closed Trades & SHA-256 audit and the Stocks EVO / Crypto-DEX EVO lines with Rollback" width="100%">

**Portfolio & Risk Console (v18.2 · Lane 26).** PAPER and LIVE are never mixed; every position can be halved, closed, moved to break-even or charted in one click.

<img src="docs/screenshots/44-cockpit-strip-ruler.png" alt="The Co-Pilot / Paper chart with the v18.2 strip (5 tabs, active target with star, Portfolio, Zen, Refresh, the gold mesh pulse dot and PAPER | LIVE) and a Shift+Drag ruler measuring a move in price, percent, bars and time" width="100%">

**One strip, one ruler (v18.2).** The active target, star, Zen, refresh, mesh dot and PAPER | LIVE share the rail with the 5 tabs; Shift+Drag measures a move, drawn off the main thread.

<p align="center"><img src="docs/screenshots/45-mobile-portfolio.png" alt="Phone 390 × 844: the Portfolio & Risk Console with its four KPIs in two columns and the positions stacked with their one-click actions" width="32%"></p>

## 🖼 v18.1 tour

<img src="docs/screenshots/41-instant-chart-contract-1s.png" alt="The Co-Pilot / Paper chart on the 1s timeframe for an oc:eth contract opened from Ctrl+K: a full pane of candles on the first frame, built from Lane 9 1m OHLCV and bridged to the live quote" width="100%">

**Instant universal hydration (v18.1).** A contract opened on the 1s chart has a full pane of candles on the first frame.

<p align="center"><img src="docs/screenshots/42-mobile-instant-chart-1s.png" alt="Phone 390 × 844: an oc:sol pool opened on the 1s chart with candles on the first frame" width="32%"></p>

## 🖼 v18.0 tour

<img src="docs/screenshots/37-alpha-recs-feed.png" alt="The 24/7 Alpha Recs tab: asset-class filter pills, S-TIER / A+ / A / B+ / WATCHLIST counts, the Paper Mirror line and border-free setup cards with tier, side, setup, Passed / Pending badges, the Why engine chips, 6-bot votes, Monte Carlo odds, confluence and journal, Entry / Stop / TP1 / TP2 / R:R / Safe Size and the four one-click actions" width="100%">

**24/7 Alpha Recs (v18.0 · Lanes 11–16).** Every setup explains why it is there and can be copied, charted, paper-mirrored or handed to the Live Bot in one click.

<img src="docs/screenshots/38-depth-chart-plan-magnifier.png" alt="The Co-Pilot / Paper chart with a loaded Alpha setup: Entry, Stop, TP1 and TP2 lines with drag handles and the R:R label, the open 2D depth pill with its seven layer chips, AVWAP bands, volume-delta cores and the crosshair magnifier showing price, imbalance, absorption, P_micro and the candle-close countdown" width="100%">

**Fighter-jet 2D depth chart (v18.0).** Seven live passes, drag-handle R:R lines and the crosshair magnifier.

<p align="center"><img src="docs/screenshots/39-mobile-alpha-recs.png" alt="Phone 390 × 844: the 24/7 Alpha Recs feed with the 5-tab rail" width="32%"> <img src="docs/screenshots/40-mobile-thumb-arc.png" alt="Phone 390 × 844: the one-thumb action arc open on Co-Pilot / Paper with Buy, Sell, Snipe CA, Swap, Flip, Pyramid, Cmd and Alpha" width="32%"></p>

---

## 🖼 v17.9 tour

<img src="docs/screenshots/35-picks-recommendation-engine.png" alt="The ◆ Picks drawer: Lane 16 recommendations with S-TIER / A / B+ / WATCHLIST tier pills and scores, the setup, side, 6-bot consensus, Monte Carlo P(TP), expectancy and slippage, multi-timeframe alignment and six Passed / Pending / Failed criteria badges per pick" width="100%">

**◆ Picks (v17.9 · Lanes 11–16).** Scanners → 6-bot consensus → 1,000-path Monte Carlo → confluence; every pick shows which criteria passed and which are pending.

<img src="docs/screenshots/36-live-bot-execution-strip.png" alt="The 24/7 Optional Live Bot tab with the execution strip: mode, route, firewall, fill bps, ledger, brackets and feed cells in tabular numerals, the PAPER | LIVE switch, the PIN field, Set PIN and FLATTEN ALL" width="100%">

**Live Bot execution strip (v17.9 · Lanes 17–19).** PAPER by default; LIVE needs your PIN before the Arm wizard opens.

---

## 🖼 v17.8 tour

<img src="docs/screenshots/31-l2-ladder-live-tape.png" alt="The Co-Pilot / Paper chart with full-range L2 liquidity shelves (gold bids below price, crimson asks above, across the whole price axis) and the Live Transactions tape below it streaming crypto prints with buy / sell types, USD totals, venues and signal tags" width="100%">

**Full-range L2 ladder + Live Transactions tape (v17.8).** Shelves below and above price on every tick; the tape is fed by Lane 7 / Lane 8 whenever its own stream starves.

<img src="docs/screenshots/32-tracker-onchain-pnl-leaderboard.png" alt="The Tracker drawer in crypto context: the 30-day On-Chain PnL leaderboard with full wallet addresses, realized PnL, win rate, Smart Score and top tokens, with Copy and Load buttons" width="100%">

**On-Chain PnL leaderboard (v17.8 · Lane 5).** 50+ wallets · 24h | 7d | 30d · Smart Score = win rate × ln(sample size).

<img src="docs/screenshots/33-tracker-sec-form4-insiders.png" alt="The Tracker drawer in stocks context: SEC Form 4 insider buys and sales with insider name, role, value and date, and Load / Pin buttons" width="100%">

**SEC Form 4 insiders (v17.8 · Lane 6).** Insider buys and sales, CEO / CFO / Director clusters, 13F filers and buy alerts.

<p align="center"><img src="docs/screenshots/34-mobile-live-tape.png" alt="The Live Transactions tape on a 390 px phone with every control on screen: Pause, filter chips, Min $ and live rows" width="32%"></p>

---

## 🖼 v17.7 tour

<img src="docs/screenshots/15-bot-radar-full-bleed.png" alt="The full-bleed 24/7 Bot Radar at 1440×900 (2× Retina): three proximity rings on an obsidian canvas with dim scanner dots on the outer ring, staging bots with vector tails on the middle ring, gold and crimson executor, MEV and whale shapes with pulse rings on the inner ring, a locked target with its telemetry card, three corner micro-HUD numbers, the All / Executors / MEV/Whales pills and the floating 4-tab rail" width="100%">

**24/7 Bot Radar (v17.7).** Full-bleed. 3 proximity rings, 3 corner numbers, 3 filters; telemetry only when you hover or lock a target.

<img src="docs/screenshots/10-terminal-brain-full-bleed.png" alt="The full-bleed Terminal Brain: the ExTerm core in the centre wired to the 8 worker lanes, the quote, tape and on-chain feeds, Bot Fleet, firewall, ledger, Co-Pilot queue, Alpha scan and Bot Radar, and the 6 squad bots, with gold particles travelling along taut or slack edges, a crimson firewall edge and shockwave rings" width="100%">

**Terminal Brain (v17.7).** Every background process as a live node; telemetry drives velocity, pulse, line tension and colour.

<img src="docs/screenshots/09-tactile-2d-depth-1s-chart.png" alt="The Co-Pilot / Paper chart on 1-second candles with the tactile 2D depth layers: extruded bevel candles with volume-ranked shadows, a volumetric gold gradient under price, a parallax depth grid, order-block slabs, the VPVR / POC shelf, CVD pillars, liquidity pools, an AVWAP canyon and a glow halo on the last price" width="100%">

**Tactile 2D depth on the live 1s chart (v17.7).** The detached 3D mode is gone; its layers draw on the live chart.

<img src="docs/screenshots/19-depth-layers-drawer.png" alt="The Depth drawer on the chart toolbar with 13 depth passes: Parallax Depth Grid, Volumetric Gradient, Extruded Bevel Candles, Glow Halos, OB Slabs, VPVR / POC Shelf, Whale Beacons, CVD Pillars, GEX Bands, Liq Pools, FVG Tunnels, AVWAP Canyon and R:R Hologram" width="100%">

**Depth drawer (v17.7).** 13 passes; 7 on by default; saved per device.

<img src="docs/screenshots/17-live-bot-clean-view.png" alt="The 24/7 Optional Live Bot tab: the Co-Pilot approvals switch, the Arm 24/7 Live Bot button and status, the Co-Pilot approval queue with a pending demo order, the fleet table and the local bot URL, with nothing else stacked" width="100%">

**24/7 Optional Live Bot (v17.7).** One switch, one Arm button, the approval queue.

<img src="docs/screenshots/28-bot-radar-mev-whales-filter.png" alt="The Bot Radar with the MEV/Whales filter on: only inner-ring MEV and whale bots remain, with anomaly callouts" width="100%">

<p align="center"><img src="docs/screenshots/29-mobile-bot-radar.png" alt="The 24/7 Bot Radar full-bleed on a 390 px phone with the 4-tab rail at the bottom" width="32%"> <img src="docs/screenshots/30-mobile-terminal-brain.png" alt="The Terminal Brain full-bleed on a 390 px phone" width="32%"></p>

---

## 🖼 v17.6 tour

<img src="docs/screenshots/21-alpha-radar-quantum-dome.png" alt="The v17.6 Alpha Radar tab: market sub-tabs with counters, grade pills, Pause and the Pin / Lookup bar above a 3D quantum-constellation dome with four market quadrants, a sweeping gold beam and graded opportunity orbs, next to 6-box dossier cards with six bot votes and one-click handoffs" width="100%">

**Alpha Radar (v17.6).** Every live market graded by the engines plus a 6-bot consensus, on its own 3D dome.

<img src="docs/screenshots/22-dex-bubble-map-1h.png" alt="The v17.6 DEX bubble map on the 1h window: 28 to 40 on-chain pools as glossy emerald and crimson bubbles, every one fully inside the canvas, with 5m, 1h, 6h and 24h pills and a Refresh button" width="100%">

<img src="docs/screenshots/23-dex-bubble-map-24h.png" alt="The same DEX bubble map switched to the 24h window: every percentage label, colour and radius has changed" width="100%">

**DEX Bubble Map (v17.6).** 28–40 merged pools; each timeframe re-labels, recolours and resizes every bubble.

<img src="docs/screenshots/25-onchain-token-desk.png" alt="The v17.6 On-Chain Token Desk: chain pills, a search or paste-CA resolver, the pool list, pool stats, Rug Shield v2 checks, the MEV sandwich predictor and TWAP slicer, and Load on Main Chart, 3D Shock Lab and Copy CA buttons" width="100%">

**On-Chain Token Desk (v17.6).** Rug Shield v2, MEV + TWAP and one-click handoffs for any pool or CA.

<img src="docs/screenshots/24-main-chart-quant-strip.png" alt="The main chart after the v17.6 clipping fixes: the EDGE quant strip with unclipped text, and the chart toolbar wrapping clear of the order ticket" width="100%">

<p align="center"><img src="docs/screenshots/26-mobile-alpha-radar.png" alt="Alpha Radar on a 390 px phone" width="32%"> <img src="docs/screenshots/27-mobile-dex-bubble-map.png" alt="DEX bubble map on a 390 px phone" width="32%"></p>


All screenshots: 1440 × 900 at 2× (Retina), offline launcher, captured with `node tools/capture-screens.js`.

<img src="docs/screenshots/02-quant-lab-edge-coach.png" alt="Quant Lab Edge-Coach: KPI row (net return, max drawdown, Sharpe, MFE capture, overfitting score, prop pass rate), the per-trade MFE / MAE and 4-hour shadow table and the hour-by-weekday win-rate heatmap" width="100%">

**Quant Lab Edge-Coach.** MFE / MAE and 4 h shadow outcomes per trade, the hour × weekday heatmap, and the walk-forward overfitting score.

<img src="docs/screenshots/03-rr-heatmap-prop-firm.png" alt="The 6 by 6 ATR stop-loss by take-profit expectancy heatmap with the best cell outlined in gold, the prop-firm challenge simulator with account-size buttons and outcome bar, the Kelly sizer and the slippage re-simulation slider" width="100%">

**R:R heatmap, prop-firm simulator, Kelly and slippage.** Click a heatmap cell to put its SL / TP on the chart.

<img src="docs/screenshots/04-pulse-event-backtester.png" alt="Pulse tab: market breadth, the last-12 FOMC reaction table with 1-hour, 4-hour and 1-day moves, the portfolio beta shock slider and the bull, bear and risk debate" width="100%">

**Pulse.** Event reaction backtests, beta shock and the Bull / Bear / Risk debate, from data already on screen.

<img src="docs/screenshots/05-arming-wizard.png" alt="The mandatory five-step arming wizard on step 2: settled cash and the zero-overdraft bot cash cap" width="100%">

**Mandatory 5-step arming wizard.** Live Unattended mode cannot start without it.

<img src="docs/screenshots/06-morning-briefing.png" alt="The Morning Briefing modal: symbol levels table, the 1-Click Plot All Morning Levels button, movers, today's events and the 7-day history" width="100%">

**Morning Briefing.** Opens once each new day; one click plots every level.

<img src="docs/screenshots/07-options-gex-multileg.png" alt="Options tab: GEX flip, call wall and put wall with the per-strike gamma bars, and the multi-leg builder with an iron condor, its payoff curve, 1 and 2 sigma cone and Greeks" width="100%">

**Options.** GEX walls and a multi-leg builder with payoff cone and Greeks.

<img src="docs/screenshots/08-futures-volume-profile.png" alt="Futures tab: RTH volume profile with point of control and value area, the tick risk calculator and estimated crypto liquidation clusters" width="100%">

**Futures.** RTH / ETH volume profile, tick risk and liquidation clusters.

<img src="docs/screenshots/18-shock-lab-flight-simulator.png" alt="The v17.5 Shock Lab in Quant Lab: category and scenario pickers (156 scenarios), Order Size, Book Depth, Vol Multiplier and Spoof Pull sliders, the 3D order book before and after the shock, and the fill, slippage and impact readout" width="100%">

**3D Order-Book Shock Lab (v17.5).** 156 scenarios, four sliders, and a stress test of your open positions and running bots.

<img src="docs/screenshots/20-options-3d-iv-surface.png" alt="The Options tab with the v17.5 2D | 3D pill set to 3D: an IV smile surface with GEX towers and a spot-shift marker" width="100%">

**Optional 2D | 3D (v17.5).** Every tool stays fast 2D until you flip its pill.

<img src="docs/screenshots/16-live-bubble-map.png" alt="The live Market bubble map: dozens of glossy emerald and crimson spheres with ticker and live percentage change, additive glow halos and shockwave rings, filling about 85 percent of the canvas" width="100%">

**Live bubble maps (v17.3).** Lively physics, glossy spheres and a shockwave on every update. They never freeze into a line.

<img src="docs/screenshots/11-academy.png" alt="Academy tab: progress bar, five module cards with mission checklists and the custom drill generator" width="100%">

**Academy.** Five modules of missions and a drill built from your own journal.

<img src="docs/screenshots/12-language-picker.png" alt="The first-launch language picker with ten language cards: English, Español, 简体中文, 日本語, 한국어, Français, Deutsch, Português, العربية (RTL) and हिन्दी" width="100%">

**First-launch language picker.** Ten featured languages (Arabic right-to-left), a search box for 150+ more, saved in IndexedDB.

<img src="docs/screenshots/13-onchain-lab.png" alt="On-Chain Lab in the Screener: the rug and honeypot simulator with sell-impact table and risk verdict, the block-0 sniper bundle bubble map and the smart-money leaderboard" width="100%">

**On-Chain Lab.** Rug / honeypot simulation, sniper bundles and smart-money ranking.

<p align="center"><img src="docs/screenshots/14-mobile-touch-cockpit.png" alt="ExTerm on a phone (390 by 844 at 2×): the chart with plotted levels, the open thumb-arc quick-action menu (Buy, Sell, Snipe CA, Swap) and the five-tab bottom dock" width="360"></p>

**Mobile app.** Bottom dock, thumb-arc quick actions and the full chart, below 820 px and in the Android app.

---

## 📱 Android app

Download **`ExTerm-v18.2-android.apk`** from the [latest release](https://github.com/uexxx/ExTerm/releases/latest)
(Android 7.0+, about 1 MB). It runs the same single-file app from the APK's assets on a secure origin, so storage and WebCrypto
work offline. Wallet and DEX links open in your installed apps, and leaving the app keeps the chart in Picture-in-Picture.
The APK's SHA-256 is listed in the release `SHA256SUMS.txt`.

Build it yourself (JDK 17 + Android SDK `platforms;android-34` and `build-tools;34.0.0`, no Gradle):

```bash
python3 build.py --harden
python3 tools/build_apk.py          # → dist/ExTerm-v18.2-android.apk
```

CI builds the same APK on every tag: [`.github/workflows/build-android-apk.yml`](.github/workflows/build-android-apk.yml).

---

## 🛡 Security

- **Strict Content-Security-Policy**: `default-src 'none'`, and the single bundled script is pinned by its **SHA-256 hash**
  at build time. Injected `<script>`, inline event handlers and `eval` are blocked; the source contains none.
- **Escaped rendering**: all remote data is HTML-escaped; links must be absolute `http(s)`.
- **Launcher lock-down** (`serve.py`, `serve.ps1`): localhost only, fresh session token every launch, exact Origin + port check,
  Host allow-list against DNS rebinding, rate limiting, proxy allow-list with redirect re-validation and response size caps.
- **Bot Fleet**: live signals are HMAC-SHA256 signed and posted only to `http://127.0.0.1` / `localhost`; every order passes the
  settled-cash cap, max-slippage and daily-loss checks. Playbook files are sanitized both ways.
- Audit report: [`SECURITY-AUDIT.md`](SECURITY-AUDIT.md) · reporting policy: [`SECURITY.md`](SECURITY.md).

---

## ✅ How to verify official builds

Official releases are published only at **<https://github.com/uexxx/ExTerm/releases>**. Each ships a `SHA256SUMS.txt`
with relative file names. Inside the app, **Settings → Verify build integrity** does the same check through the launcher.
To rule out tampering, compare `SHA256SUMS.txt` itself with the one on the release page.

```bash
# macOS / Linux, from the ExTerm folder
sha256sum -c SHA256SUMS.txt          # macOS: shasum -a 256 -c SHA256SUMS.txt
```

```powershell
# Windows PowerShell, from the ExTerm folder
Get-Content SHA256SUMS.txt | ForEach-Object {
  $h, $f = $_ -split '\s+', 2
  if ((Get-FileHash $f -Algorithm SHA256).Hash -eq $h) { "OK   $f" } else { "FAIL $f" }
}
```

---

## 🔧 Build & test

```bash
python3 build.py             # dist/exterm.html (readable) + exterm.html
python3 build.py --harden    # dist/exterm.min.html (minified with esbuild)
node test/v170.test.js       # v17.0 unit suite
node test/v171.test.js       # v17.1 unit suite (ledger, AMM/L2 impact, stale guard, Copilot routing)
node test/v172.test.js       # v17.2 unit suite (Synapse maths, Monte Carlo fan, phase space, weights, wiring)
node test/v173.test.js       # v17.3 unit suite (bubble physics, fractal dendrites, particles, matrix, v16.6 palette restore)
node test/v182.test.js       # v18.2 suite (70: Lanes 20–26 maths + live HTTP, guard / search / portfolio / EVO JS-Python parity, mesh, wiring, CSP)
node test/v182_flows.js      # v18.2 browser flows alone (UI-speed crawl of every visible control, console, hotkeys, HUD worker; desktop + phone)
node test/v181.test.js       # v18.1 instant hydration suite (normalizer, 1s/5s/15s synthesis, Lanes 9/10 resolve / prewarm / latency, JS-Python parity)
node test/v181_flows.js      # v18.1 browser flows alone (Alpha Recs / Bot Radar / Tracker / Ctrl+K -> chart, 1s-1M, desktop + phone)
node test/v180.test.js       # v18.0 Alpha Recs + 2D depth chart suite (core maths, live Lanes 11–16 feed < 10 ms, firewall gate, palette / CSP / version)
node test/v179.test.js       # v17.9 19-lane mesh suite (Lanes 9–19 maths + live launcher latency budgets, PIN gate, SHA-256 ledger, Grok bridge)
node test/v178.test.js       # v17.8 unit + live-lane suite (Lanes 5–8 < 30 / 25 ms, leaderboards, Form 4, L2 ladder, Radar physics, Brain BOCPD + replay, frame budget)
node test/v177.test.js       # v17.7 unit suite (4-tab map, bot fingerprints + rings + HUD, depth layers, Terminal Brain, real renderers, palette)
node test/v176.test.js       # v17.6 unit suite (4D maths, 5 off-thread renderers, Alpha Radar grading, Rug Shield v2, TWAP, palette lock)
node test/v175.test.js       # v17.5 unit suite (worker kernel, squad truthfulness, 3D layers, 156 scenarios, 30+ engines vs closed forms, palette lock)
python3 test/v175_lanes_test.py  # v17.5 serve.py lanes (process isolation, allow-list, caps, HTTP)
node test/v17pro_e2e.js      # v17.0–v18.2 browser end-to-end (desktop 1440/1280 + phone 390)
```

`build.py` inlines `src/*.js` and `src/style.css` into one file and stamps the CSP with the bundle's SHA-256 hash.
All suites: `powershell -ExecutionPolicy Bypass -File test\run-all.ps1` (unit, launcher and browser end-to-end; each browser
suite opens and closes its own headless Chrome, one at a time; needs Node 18+, Playwright and Chrome).

---

## 📜 License

**Proprietary — All Rights Reserved.** ExTerm v17.0 and later are governed by **[`LICENSE`](LICENSE)**.

> Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying,
> reverse-engineering, cloning, or redistributing source or derivative works without express written permission from
> ExTerm Labs is strictly prohibited.

The ExTerm name and logo are **not** licensed; see the brand policy below.

## 🏷 Brand & Logo Policy

The names **ExTerm**, **ExTerm.labs**, **@exterm.labs** and the **Candle X** candlestick-and-diamond mark are reserved and
are not covered by the license. No modified or redistributed version may be published without written permission.
Details: **[`BRAND_GUIDELINES.md`](BRAND_GUIDELINES.md)**.

## 📣 Follow ExTerm Labs

- **Instagram:** [@exterm.labs](https://www.instagram.com/exterm.labs): demos, new features and release drops
- **X (Twitter):** [@ExTermLabs](https://x.com/ExTermLabs): updates and changelogs

Official accounts are only the ones above and <https://github.com/uexxx/ExTerm>.

---

<sub>ExTerm is an educational paper-trading tool, not financial advice. Market data comes from third-party public APIs and may
be delayed or wrong. Model outputs (GEX model chain, liquidation clusters, prop simulations) are estimates. Past backtest results
do not predict future returns.</sub>
