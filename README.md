<div align="center">
  <img src="assets/exterm-readme-hero.svg" alt="ExTerm Workstation — 240Hz Multi-Asset Quantitative Trading Terminal" width="100%" />
</div>

<div align="center">

# ExTerm v17.0

### The $0, local-first trading workstation for crypto, stocks, on-chain DEX tokens, options and futures, with a Quant Lab that coaches you, a Bot Fleet you arm deliberately, and a native Android app.

**Your money never leaves your broker, exchange or wallet.** ExTerm holds no funds and no keys: it paper-trades by default,
and live signals go only to a bot you run yourself on `127.0.0.1`, HMAC-signed and locked behind a 5-step arming wizard.

<img src="docs/screenshots/01-markets-terminal.png" alt="ExTerm Markets terminal at 1440×900 (2× Retina): BTC candles with the plotted morning levels (previous day high, low and close, pivot, R1, S1), the GEX flip, call wall and put wall lines, the one-line Reach strip with the R:R, 2×2 and smart-trail tools under the navigation, the 6-timeframe confluence pill in the header and the Live Tape" width="100%">

**[Launch](#-30-second-local-launch)** · **[What's new](#-whats-new-in-v170)** · **[Screenshots](#-v170-tour)** · **[Android](#-android-app)** · **[Verify](#-how-to-verify-official-builds)** · **[Build & test](#-build--test)** · **[Security](#-security)** · **[License](#-license)**

<p>
  <a href="https://github.com/uexxx/ExTerm/releases/latest"><img src="https://img.shields.io/badge/download-v17.0-F5C84B?style=for-the-badge" alt="Download v17.0"></a>
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

## 🎯 What's new in v17.0

Every workspace is **one click away** on the new one-line **Reach strip** under the navigation:
`Stocks · Crypto · On-Chain · Options · Futures · Screener · Pulse · 3D · Bot Fleet · Quant Lab · AI Bridge · Academy · Live Tape · Whales $25K+ · Tracker · Positions · Briefing`.
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
- **Native Android app**: [`ExTerm-v17.0-android.apk`](https://github.com/uexxx/ExTerm/releases/latest).

**🛡 Launcher (Phases 0–1)**: a 429 storm shield (single-flight requests, per-host cool-down that honours `Retry-After`, stale
fallback), a cross-venue crypto tape (Coinbase · Kraken · Binance · Bybit · OKX) with basis, funding, spread and CVD, instant
chart switches from a RAM + IndexedDB candle cache, a Discovery formula scanner, a clipboard sniper and a supervised 24/7 daemon.

Full notes: [`CHANGELOG.md`](CHANGELOG.md).

---

## 🖼 v17.0 tour

All screenshots: 1440 × 900 at 2× (Retina), offline launcher, captured with `node tools/capture-screens.js`.

<img src="docs/screenshots/02-quant-lab-edge-coach.png" alt="Quant Lab Edge-Coach: KPI row (net return, max drawdown, Sharpe, MFE capture, overfitting score, prop pass rate), the per-trade MFE / MAE and 4-hour shadow table and the hour-by-weekday win-rate heatmap" width="100%">

**Quant Lab Edge-Coach.** MFE / MAE and 4 h shadow outcomes per trade, the hour × weekday heatmap, and the walk-forward overfitting score.

<img src="docs/screenshots/03-rr-heatmap-prop-firm.png" alt="The 6 by 6 ATR stop-loss by take-profit expectancy heatmap with the best cell outlined in gold, the prop-firm challenge simulator with account-size buttons and outcome bar, the Kelly sizer and the slippage re-simulation slider" width="100%">

**R:R heatmap, prop-firm simulator, Kelly and slippage.** Click a heatmap cell to put its SL / TP on the chart.

<img src="docs/screenshots/04-bot-fleet-torus.png" alt="Bot Fleet tab: the three mode cards (Paper Sandbox, Attended Co-Pilot, Live Unattended 24/7), the co-pilot approval queue, the fleet table, the self-improving loop result and the gold neural strategy torus" width="100%">

**Bot Fleet.** Three modes, a co-pilot approval queue, the self-improving loop and the Neural Strategy Torus.

<img src="docs/screenshots/05-arming-wizard.png" alt="The mandatory five-step arming wizard on step 2: settled cash and the zero-overdraft bot cash cap" width="100%">

**Mandatory 5-step arming wizard.** Live Unattended mode cannot start without it.

<img src="docs/screenshots/06-morning-briefing.png" alt="The Morning Briefing modal: symbol levels table, the 1-Click Plot All Morning Levels button, movers, today's events and the 7-day history" width="100%">

**Morning Briefing.** Opens once each new day; one click plots every level.

<img src="docs/screenshots/07-options-gex-multileg.png" alt="Options tab: GEX flip, call wall and put wall with the per-strike gamma bars, and the multi-leg builder with an iron condor, its payoff curve, 1 and 2 sigma cone and Greeks" width="100%">

**Options.** GEX walls and a multi-leg builder with payoff cone and Greeks.

<img src="docs/screenshots/08-futures-volume-profile.png" alt="Futures tab: RTH volume profile with point of control and value area, the tick risk calculator and estimated crypto liquidation clusters" width="100%">

**Futures.** RTH / ETH volume profile, tick risk and liquidation clusters.

<img src="docs/screenshots/09-pulse-event-backtester.png" alt="Pulse tab: market breadth, the last-12 FOMC reaction table with 1-hour, 4-hour and 1-day moves, the portfolio beta shock slider and the bull, bear and risk debate" width="100%">

**Pulse.** Event reaction backtests, beta shock and the Bull / Bear / Risk debate, from data already on screen.

<img src="docs/screenshots/10-3d-order-blocks.png" alt="3D tab: isometric candles with volumetric bullish and bearish order blocks, order-book walls and the replay scrubber" width="100%">

**3D order blocks.** Volumetric blocks, L2 walls and a replay scrubber.

<img src="docs/screenshots/11-academy.png" alt="Academy tab: progress bar, five module cards with mission checklists and the custom drill generator" width="100%">

**Academy.** Five modules of missions and a drill built from your own journal.

<img src="docs/screenshots/12-language-picker.png" alt="The first-launch language picker with ten language cards: English, Español, 简体中文, 日本語, 한국어, Français, Deutsch, Português, العربية (RTL) and हिन्दी" width="100%">

**First-launch language picker.** Ten featured languages (Arabic right-to-left), a search box for 150+ more, saved in IndexedDB.

<img src="docs/screenshots/13-onchain-lab.png" alt="On-Chain Lab in the Screener: the rug and honeypot simulator with sell-impact table and risk verdict, the block-0 sniper bundle bubble map and the smart-money leaderboard" width="100%">

**On-Chain Lab.** Rug / honeypot simulation, sniper bundles and smart-money ranking.

<p align="center"><img src="docs/screenshots/14-mobile-app.png" alt="ExTerm on a phone (390 by 844 at 2×): the chart with plotted levels, the open thumb-arc quick-action menu (Buy, Sell, Snipe CA, Swap) and the five-tab bottom dock" width="360"></p>

**Mobile app.** Bottom dock, thumb-arc quick actions and the full chart, below 820 px and in the Android app.

---

## 📱 Android app

Download **`ExTerm-v17.0-android.apk`** from the [latest release](https://github.com/uexxx/ExTerm/releases/latest)
(Android 7.0+, about 1 MB). It runs the same single-file app from the APK's assets on a secure origin, so storage and WebCrypto
work offline. Wallet and DEX links open in your installed apps, and leaving the app keeps the chart in Picture-in-Picture.
The APK's SHA-256 is listed in the release `SHA256SUMS.txt`.

Build it yourself (JDK 17 + Android SDK `platforms;android-34` and `build-tools;34.0.0`, no Gradle):

```bash
python3 build.py --harden
python3 tools/build_apk.py          # → dist/ExTerm-v17.0-android.apk
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
