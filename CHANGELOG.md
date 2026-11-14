# Changelog

ExTerm (formerly NovaTerm) is paper trading only in every version: nothing signs or sends a real order.

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

### NovaTerm is now ExTerm
- New name across the app, launcher, build (`dist/exterm.html`, `dist/exterm.min.html`) and launchers (`start-exterm.bat / .command / .sh`). The session header is now `X-ExTerm`.
- On first start the launcher moves `~/.novaterm` to `~/.exterm` (never overwrites an existing `~/.exterm`), so alerts, background bots and saved state carry over. `EXTERM_DATA` replaces `NOVATERM_DATA` (the old variable still works).
- Kept on purpose so nothing is lost: browser storage keys (`novaterm.v1`, …), the journal and backup databases in the browser, and the GitHub repository used by the update check.

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
- **Saved to your computer** (v13.1): the launcher mirrors everything the page saves (settings, watchlists, bots, paper accounts, drawings, workspaces, the trade journal) to `~/.novaterm/state.json` and restores it on open, so a new launcher port, another browser or cleared site data no longer looks like a fresh install. The newest copy wins; the journal on disk is a long-term log (up to 20,000 trades, chart snapshots stay in the browser); one dated backup per day (14 kept); "Reset everything" resets the disk copy too. API keys are never written. Settings → Data status shows when it last saved and offers the **full journal log as CSV**. `--no-state` turns it off.
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
