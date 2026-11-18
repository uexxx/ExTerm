<div align="center">

<img src="assets/exterm-readme-hero.svg" alt="ExTerm Labs: an all-gold 8-candlestick X emblem beside a 3D-beveled gold EXTERM and white LABS title on obsidian, with a terminal telemetry bar and five gold spec pills: 240Hz Float64 Canvas, 127.0.0.1 Zero Custody, 10 Risk Fail-Safes, SHA-256 Strict CSP, $0 Forever" width="100%">

<p>
  <a href="https://github.com/uexxx/ExTerm/releases/tag/v16.6"><img src="https://img.shields.io/badge/RELEASE-v16.6%20HARDENED-F5C84B?style=for-the-badge&labelColor=07080B" alt="Release v16.6 hardened"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/AGPL--3.0-%240%20FOREVER-F5C84B?style=for-the-badge&labelColor=07080B" alt="AGPL-3.0, $0 forever"></a>
  <img src="https://img.shields.io/badge/127.0.0.1-ZERO%20CUSTODY-F5C84B?style=for-the-badge&labelColor=07080B" alt="127.0.0.1 zero custody">
  <img src="https://img.shields.io/badge/240HZ-FLOAT64%20CANVAS-F5C84B?style=for-the-badge&labelColor=07080B" alt="240 Hz Float64 canvas">
</p>

### The $0, local-first trading terminal for **Stocks · Crypto · On-Chain / DEX**, built to work with any AI or bot.

**Your money never leaves your broker, exchange or wallet.** ExTerm holds no funds and no keys. It paper-trades by default;
live signals go only to a bot **you** run on `127.0.0.1`, HMAC-signed, checked by ten risk engines and locked behind four gates.

**[Launch](#launch)** · **[Subsystems](#subsystems)** · **[Cost](#cost)** · **[Firewall](#firewall)** · **[Gallery](#gallery)** · **[History](#history)** · **[License](#license)**

</div>

<img src="assets/exterm-gold-divider.svg" alt="" width="100%">

```text
╔════════════════════════════════════════════════════════════════════════════════╗
║ EXTERM TERMINAL // SYSTEM MANIFEST                              v16.6 HARDENED ║
╠════════════════════════════════════════════════════════════════════════════════╣
║  BUILD              single-file exterm.html · stdlib launcher · no install     ║
║  MARKETS            US Stocks · Crypto spot & perps · On-Chain / DEX · Options ║
║  RENDER             adaptive 60-240 Hz canvas · Float64Array tape rings        ║
║  TAPE               Time & Sales open by default · 8 sub-tabs · whale / block  ║
║  DOCK               position · cash · 6 quick chips · BTC ETH SOL SPY pills    ║
║  RESEARCH           137 indicators · 134 strategies · 17-test validation lab   ║
║  AI                 Grok · ChatGPT · Claude · DeepSeek · Ollama · own bots     ║
╟────────────────────────────────────────────────────────────────────────────────╢
║  CUSTODY            ZERO · paper by default · signals to YOUR 127.0.0.1 bot    ║
║  RISK               10 deterministic fail-safes · 4-gate live lock             ║
║  SECURITY           SHA-256 pinned CSP · AES-256-GCM vault · HMAC envelopes    ║
║  PRICE              $0 forever · AGPL-3.0 · no account, no subscription        ║
╚════════════════════════════════════════════════════════════════════════════════╝
```

<a id="launch"></a>
<img src="assets/hdr-01-launch.svg" alt="01 · 10-Second Local Launch" width="100%">

ExTerm is one HTML file plus a small standard-library launcher. No account, no install, no build step, no subscription.

| Platform | Do this |
|---|---|
| **Windows** | Unzip to e.g. `C:\ExTerm`, double-click **`start-exterm.bat`** (falls back to the built-in PowerShell server `serve.ps1` if Python isn't installed) |
| **macOS** | Double-click **`start-exterm.command`** |
| **Linux / any** | `./start-exterm.sh` or `python3 serve.py` → <http://localhost:8765> |

```bash
cd ~/ExTerm && python3 serve.py          # opens Chrome on http://localhost:8765
python3 serve.py 9000 --no-browser       # other port, no browser
python3 serve.py --doctor --offline      # health check + checksum self-test
```

> Opening `exterm.html` directly also works for crypto, but browsers block some stock and on-chain sources. The launcher
> proxies only an allow-list of public market-data hosts, on `localhost`, behind a fresh per-launch token.

<img src="screenshots/01-hero-chart.png" alt="ExTerm v16.6 Markets at 1440×900 in dark mode: the all-gold header emblem, the 240 Hz BTC chart, the default-open Live Transactions drawer with its pressure strip, 8 sub-tabs and filter chips, and the Obsidian & Gold bottom telemetry dock with position, Cash, quick-dock chips and BTC / ETH / SOL / SPY pills" width="100%">

<a id="subsystems"></a>
<img src="assets/hdr-02-subsystems.svg" alt="02 · Seven Terminal Subsystems" width="100%">

### `01` · 240 Hz multi-asset charting & direct order execution

One chart engine for **Crypto, US Stocks, On-chain DEX tokens, Options and Futures**, drawn at your display's refresh rate
(an adaptive governor targets 60–240 Hz and steps down when frames get expensive).

- **Every timeframe:** `1s · 5s · 10s · 15s · 1m · 5m · 15m · 30m · 1h · 4h · 1d · 1w · 1M`, true-form gapless candles;
  quiet sub-minute bars are re-anchored instead of drawing flat `Vol 0.00` filler.
- **Resilient data:** Kraken ↔ Coinbase ↔ Binance public-trade failover after a 1.5 s stall; a 500 ms DEX swap tape de-duplicated by transaction hash.
- **137 indicators**, multi-timeframe trend pills, drawing tools, **⚓ AVWAP**, and a 10 s / 60 s tape-delta + book micro-imbalance strip.
- **Trade on the chart:** click Entry / Stop / Target, drag any line, **R:R and $ P&L badges**, the **BE** pill, Auto-BE on TP1, TP1–TP3 scale-out.
- **Order ticket:** market / limit / stop, **$ Risk → exact quantity**, GTC / IOC / Post-Only, Chase Limit. Hotkeys `Shift+B` · `Shift+S` · `Shift+X` · `F`.

### `02` · Live Transactions tape (Time & Sales) + bottom telemetry dock

<img src="screenshots/07-live-transactions.png" alt="Close-up of the v16.6 Time & Sales drawer with the Whales ($25K+) and Blocks ($100K+) filters active: buy / sell pressure bar, net whale / block flow, Trades · Positions · Holders / Institutions · Top Traders / Funds · Pre / Early · Tracking · DCA · Orders sub-tabs, gold-tagged block prints and the bottom telemetry dock" width="100%">

- **Open by default** on Markets for every market: a 230 px drawer under the chart (the chart shrinks; nothing is covered),
  collapsible with the gold **`▾ Hide Tape`** / **`▴ Live Tape`** toggle.
- **2,000-print typed-array ring per symbol:** `Float64Array` ts / price / size / USD + `Uint32Array` side bitmask / venue.
  22 pooled DOM rows, re-filtered at most 30×/s, measured under 0.2 ms per frame. Stocks, Crypto and On-Chain stay strictly isolated.
- **8 sub-tabs:** Trades · Positions · Holders / Institutions · Top Traders / Funds · Pre / Early · Tracking · DCA · Orders.
  **Chips:** All · Whales ($25K+) · Blocks ($100K+) · Sweeps · Buys · Sells · Unusual (>3x) · Tracked, plus min USD.
- Hover **auto-pauses** (gold Paused pill), click a print to pin a gold marker on the chart, **Copy Tape for AI** feeds the AI Bridge.
- **Zero setup:** public Coinbase / Kraken / Binance trades 24/7, DEX pool swaps with maker wallets, stock last-sale volume
  through the launcher (**LAST SESSION TAPE** when closed). Optional Stock boost with your own Finnhub / Alpaca key (tab-only).
- **Telemetry dock** (every tab): position & **Cash** · quick-dock chips **Live Tape · Whales ($25K+) · Tracker · Positions ·
  3D Depth · AI Bridge** · live **BTC · ETH · SOL · SPY** pills and the active symbol's tape flow delta.

### `03` · Closed-loop zero-custody live execution cockpit (`127.0.0.1`)

<img src="docs/screenshots/02-live-hud-focus-cockpit.png" alt="ExTerm Markets with the local bot armed: the Floating Live Execution HUD, Focus Chart with collapsed rails, the docked Micro-Ticket and the Live Positions and Pending Orders drawer" width="100%">

- **HMAC-SHA256 signed** intents (fresh session key, 3 s expiry, idempotency key, rising sequence) to a bot you run; ACK + fill reconciliation.
- **Six local adapter slots**, ~40-line starter bridges for Interactive Brokers, Alpaca, CCXT and Freqtrade, a Multi-Slot Strategy Router.
- Floating Live HUD, Focus Chart, Micro-Ticket, Position & Pending Orders Drawer, Two-Key Arming (`Shift + Alt + A`), 3-Second Readiness Self-Check.

### `04` · DEX Discovery & pure-canvas 3D market structure

<img src="docs/screenshots/03-dex-discovery-3d-structure.png" alt="The DEX tab Discovery panel: Bubbles sized by market cap with gravity clusters, unified pills, sizing modes, the Top Gainers and Losers rail and the 3D Orbit button" width="100%">

- **One dataset, four views:** Scanner · Tiles · Bubbles · Buy Pressure, strictly isolated per market pill.
- GMGN-style on-chain filter drawer (chains, DEXes, liquidity / FDV / volume / age / holder ranges, safety toggles, presets).
- **Five 3D engines, zero 3D libraries:** Order-Book Liquidity Terrain, Options IV & Gamma Surface, Profit Mountain, Correlation Orbit, Whale Liquidation Orbit.

### `05` · 17-test Quant Lab & Strategy Studio Pro

<img src="docs/screenshots/04-quant-lab-validation.png" alt="Strategy Studio Pro: condition chips, Entry and Exit drop zones, stop / target / trail inputs, validation, backtest, replay and export buttons, and the walk-forward decay matrix" width="100%">

- Drag-and-drop node builder → **17-test Validation** (walk-forward, 1,000-run Monte Carlo, risk of ruin, slippage fragility, data quality).
- Depth-aware square-root slippage, ≤ 10-symbol portfolio with correlation matrix, Flash Crash / FOMC / Thin Weekend stress.
- **134 backtestable strategies**, replay on chart, export to Pine Script v5 or a standalone Python / Node bot.

### `06` · Universal AI Bridge, Copilot & AI-vetted copy-trading

<img src="docs/screenshots/05-ai-bridge-copy-firewall.png" alt="The AI Bridge tab: provider pills, quick-prompt presets, Token-Saver / Full Quant packets, the AI trade-idea / ticker / Pine boxes and the 127.0.0.1 llm-signal guardrail card" width="100%">

- Works with **Grok · ChatGPT · Claude · DeepSeek · Local Ollama · custom Python / Node bots**: copy a grounded packet out, paste ideas back in.
- Pasted ideas become **ghost lines** with R:R and $ badges only after a directional-stop + ATR check. Nothing is ever placed for you.
- `POST http://127.0.0.1:8765/llm-signal`: loopback-only, schema + stop checked, signed receipt, guardrail profile, PAPER shadow slot.
- **Quant & Execution Copilot** (no API key, no network): chart reader, plain English → safe strategy + Pine v5, stop auditor, ledger leak detector.
- **Copy engine:** multi-wallet consensus, anti-front-run drift shield, your own $ risk and ATR stop, per-leader daily loss cap.

### `07` · On-chain intelligence, 32 languages + RTL & Learn ExTerm

<img src="docs/screenshots/06-onchain-scanner-rtl.png" alt="ExTerm in Arabic, mirrored right to left: the On-chain Discovery scanner, the filter drawer and the Top Gainers rail" width="100%">

- Launch Radar, token safety scanner, wallet tracker, smart-money & perp leaderboards with Trader Detail & Mirror.
- **32 languages** with full right-to-left mirroring, chosen at first launch.
- **Learn ExTerm:** 35 interactive lessons, sandbox drills, a 5-minute quick-start and "How do I…" search.

<a id="cost"></a>
<img src="assets/hdr-03-cost.svg" alt="03 · Legacy Stack vs. ExTerm" width="100%">

| Capability | Typical legacy stack (USD / yr) | ExTerm |
|---|---:|:---:|
| Pro charting, multi-timeframe alerts, drawing tools | $240 – $720 | **$0** |
| Real-time US stock & options data | $360 – $2,400 | **$0** ¹ |
| Order-flow / Time & Sales tape, whale & block filters | $480 – $3,600 | **$0** |
| On-chain whale, wallet & DEX analytics | $360 – $4,800 | **$0** |
| Backtesting & quant validation suite | $240 – $2,520 | **$0** |
| AI trading co-pilot subscriptions | $240 – $2,400 | **$0** ² |
| Copy-trading / signal services | $120 – $9,600 | **$0** |
| **Total** | **$2,040 – $26,040+ / yr** | **$0 forever** |

<sub>Indicative ranges for comparable retail plans; your own costs vary. ¹ Free sources are 1-minute last-sale volume for
stocks; the optional Stock boost uses your own Finnhub / Alpaca key. ² Bring any AI you already use, or 100% offline Ollama.</sub>

<a id="firewall"></a>
<img src="assets/hdr-04-firewall.svg" alt="04 · 127.0.0.1 Deterministic Risk Firewall" width="100%">

```text
╔════════════════════════════════════════════════════════════════════════════════╗
║ 127.0.0.1 DETERMINISTIC RISK FIREWALL                            10 FAIL-SAFES ║
╠════════════════════════════════════════════════════════════════════════════════╣
║  [01] REQUIRE STOP-LOSS      every live opening order needs a valid stop       ║
║  [02] SIGNAL FIREWALL        schema · fat-finger notional cap · SSRF guard     ║
║  [03] SIGNED ENVELOPES       HMAC-SHA256 · 3 s TTL · nonce · rising seq        ║
║  [04] DEPTH & STALE QUOTE    book depth >= 3x order · stale quotes freeze      ║
║  [05] RATE & EXPOSURE CAPS   max trades / hour · global 6-slot exposure        ║
║  [06] DRAWDOWN THROTTLE      50% size after 2 losses · cooldown timer          ║
║  [07] CORRELATION GUARD      refuses r > 0.85 · thin-hours spread halving      ║
║  [08] EXECUTION SHIELD       spread ceiling · ticker allowlist · pause         ║
║  [09] MAX DAILY LOSS         breach -> CANCEL_ALL_AND_FLATTEN -> PAPER         ║
║  [10] DEAD-MAN / KILL        missed heartbeat · idle · Ctrl+Shift+K flat       ║
╟────────────────────────────────────────────────────────────────────────────────╢
║  CSP    default-src 'none' · bundle pinned by SHA-256 hash at build            ║
║  DOM    no inline handlers · no eval · every dynamic string escaped            ║
║  NET    localhost only · per-launch token · Origin + Host checks               ║
║  DATA   AES-256-GCM key vault (PBKDF2-SHA256) · encrypted backups              ║
╚════════════════════════════════════════════════════════════════════════════════╝
```

Every AI idea, bot signal and manual live order passes the **same** deterministic checks. Audit report:
[`SECURITY-AUDIT.md`](SECURITY-AUDIT.md) · reporting policy: [`SECURITY.md`](SECURITY.md).

**Verify official builds.** Releases are published only at <https://github.com/uexxx/ExTerm/releases>, each with a
`SHA256SUMS.txt`. In the app, **Settings → Verify build integrity** runs the same check and confirms the live CSP.

```bash
sha256sum -c SHA256SUMS.txt          # macOS: shasum -a 256 -c SHA256SUMS.txt
```

```powershell
Get-Content SHA256SUMS.txt | ForEach-Object {
  $h, $f = $_ -split '\s+', 2
  if ((Get-FileHash $f -Algorithm SHA256).Hash -eq $h) { "OK   $f" } else { "FAIL $f" }
}
```

<a id="gallery"></a>
<img src="assets/hdr-05-gallery.svg" alt="05 · Terminal Gallery" width="100%">

<table>
<tr>
<td width="50%"><img src="docs/screenshots/05-execution-bridge-safety.png" alt="Execution Bridge and Live Safety settings with a READY 7/7 readiness self-check" width="100%"></td>
<td width="50%"><img src="docs/screenshots/05-copilot-pine-bridge.png" alt="The Quant and Execution Copilot with action pills and the safe Pine Script v5 template library" width="100%"></td>
</tr>
<tr>
<td><img src="docs/screenshots/01-markets-live-execution.png" alt="Markets with an open position, Entry / Stop / Target lines, dollar tags and the order ticket" width="100%"></td>
<td><img src="screenshots/07-live-transactions.png" alt="The Live Transactions drawer with whale and block filters active" width="100%"></td>
</tr>
</table>

<a id="history"></a>
<img src="assets/hdr-06-history.svg" alt="06 · Release & Update History" width="100%">

| Version | Date | Highlights |
|---|---|---|
| **v16.6** | Nov 2026 | 240 Hz typed-array **Live Transactions tape** for Stocks · Crypto · On-Chain / DEX (8 sub-tabs, whale / block / sweep chips), now **open by default**, plus the Obsidian & Gold **bottom telemetry dock** |
| v16.5 | Nov 2026 | **AI Bridge** for any model or bot, `127.0.0.1/llm-signal` firewall, AI-vetted copy engine, privacy-masked share card |
| v16.4 | Nov 2026 | DEX Discovery (4 views), AVWAP, multi-exchange failover, Quant & Execution Copilot, Strategy Studio Pro |
| v16.3 | Nov 2026 | Closed-Loop Live Cockpit: HUD, Micro-Ticket, ACK + fill sync, Two-Key Arming, Require Stop-Loss ON by default |
| v16.2 | Nov 2026 | Universal timeframes, true-form sub-minute candles, Max Daily Loss auto-flatten, launch safety briefing |
| v16.1 | Nov 2026 | Chart click-to-trade, context menu, Measure dragger, 8 live-bot fail-safe engines |
| v16.0 | Nov 2026 | Six local adapter slots, 4-Gate Live Safety Lock, kill-switch |
| v15.7 | Nov 2026 | 1s ring, rollups and candle geometry hardening |
| v15.6 | Nov 2026 | Calmer surfaces, lighter rows, one inspector rail, zero-lag engine |
| v15.5 | Nov 2026 | Bot Net Profit card, Quant Lab wizard, `Ctrl+K` search, Simple / Pro modes |
| v15.4 | Nov 2026 | Learn ExTerm academy, on-chain perp & smart-money leaderboards, Pro Tools drawer |
| v15.3 – v15.1 | Nov 2026 | Language gate (32 + RTL), 1-click market swap, live 1s / 5s candles, 137 indicators, AES-256 vault + SHA-256 CSP |

Full notes for every release: [`CHANGELOG.md`](CHANGELOG.md).

<img src="assets/exterm-gold-divider.svg" alt="" width="100%">

## Build

```bash
python3 build.py             # dist/exterm.html (readable) + exterm.html
python3 build.py --harden    # dist/exterm.min.html (minified with esbuild)
```

`build.py` inlines `src/*.js` and `src/style.css` into one file and stamps the CSP with the bundle's SHA-256 hash.
Tests: `powershell -ExecutionPolicy Bypass -File test\run-all.ps1` (unit, launcher and browser end-to-end suites; needs Node 18+, Playwright and Chrome).

## Brand & Logo Policy

The names **ExTerm**, **ExTerm.labs**, **@exterm.labs** and the **Candle X** candlestick-and-diamond mark are reserved and
are not covered by the license. Modified versions must use their own name and logo and credit <https://github.com/uexxx/ExTerm>.
Details: **[`BRAND_GUIDELINES.md`](BRAND_GUIDELINES.md)**.

## Follow ExTerm Labs

<a href="https://www.instagram.com/exterm.labs"><img src="https://img.shields.io/badge/Instagram-@exterm.labs-F5C84B?style=for-the-badge&logo=instagram&logoColor=F5C84B&labelColor=07080B" alt="Instagram @exterm.labs"></a>
<a href="https://x.com/ExTermLabs"><img src="https://img.shields.io/badge/X-@ExTermLabs-F5C84B?style=for-the-badge&logo=x&logoColor=F5C84B&labelColor=07080B" alt="X @ExTermLabs"></a>

Official accounts are only the ones above and <https://github.com/uexxx/ExTerm>.

<a id="license"></a>

## AGPL-3.0 License & Disclaimer

ExTerm is free software under the **GNU Affero General Public License v3.0**: see **[`LICENSE`](LICENSE)**. It costs $0,
forever. The ExTerm name and logo are not licensed (see the brand policy above).

Copyright (c) 2026 ExTerm Labs (@exterm.labs) · https://github.com/uexxx/ExTerm

> **Disclaimer.** ExTerm is an educational paper-trading and research tool, **not financial advice**. Market data comes from
> third-party public APIs and may be delayed or wrong. Backtest results do not predict future returns. Live trading through
> your own bot is at your own risk; ExTerm never holds your funds or keys.
