# ExTerm v16.5 Launch Kit

Ready-to-post material for the v16.5 release: **Universal AI Bridge, AI-vetted zero-custody copy-trading and the Share
Setup Card**. Copy, trim and post. Every claim below matches what ships in v16.5; keep it that way when you edit.

- **Download:** https://github.com/uexxx/ExTerm/releases/latest
- **Handles:** X [@ExTermLabs](https://x.com/ExTermLabs) · Instagram [@exterm.labs](https://www.instagram.com/exterm.labs)
- **Hero image:** `docs/screenshots/05-ai-bridge-copy-firewall.png` (1440×900)
- **Brand colours:** Obsidian `#0b0b0f` · Gold `#D4AF37` · Profit `#2fd08a` · Loss `#f43f5e`

### Ground rules for every post

1. **Paper-first, zero custody.** ExTerm never holds funds or keys. Say "paper by default" and "your own bot on 127.0.0.1".
2. **No profit promises.** No "guaranteed", no win-rate brags, no screenshots of balances. The share card masks balances on purpose.
3. **The AI advises, the firewall decides.** Every idea needs a stop-loss; unstopped or wrong-way ideas are rejected.
4. **Name AI tools as compatible, not as partners.** "Works with Grok, ChatGPT, Claude, DeepSeek and Ollama", never "official", "partnered" or "endorsed".
5. Not financial advice. Add it to every long-form post.

---

## 1 · X / Twitter launch threads

### Thread A: the main launch (8 posts)

> **1/** ExTerm v16.5 is out. 🌉
>
> One free, local trading terminal that works with ANY AI or bot: Grok, ChatGPT, Claude, DeepSeek, a local Ollama model or your own Python/Node script.
>
> The AI advises. A deterministic firewall decides. Your keys never leave your machine. 🧵

> **2/** The problem: you ask an AI for a trade and it invents a price, skips the stop, or "forgets" the chart.
>
> ExTerm's fix: one click copies a packet of REAL numbers from your chart (trend 1m→4h, EMA 20/50, RSI, ATR, AVWAP, tape delta, liquidity walls). Token-Saver mode keeps it near 120 tokens.

> **3/** Paste the AI's answer back. Plain English works:
>
> "Long SOL at 142.50, stop 138.00, target 154.00"
>
> ExTerm parses it, checks the stop is on the right side and outside the noise, and draws dashed ghost lines on the chart with live R:R and $ badges. That one is 2.56R.

> **4/** Running a bot or a local model? POST JSON to `127.0.0.1:8765/llm-signal`.
>
> No stop-loss → rejected, with a signed error receipt.
> Wrong-way stop → rejected.
> Low confidence → PAPER shadow slot first.
>
> One click applies the AI Live Guardrail Profile: min 1.5× ATR stop, ≥ 3× depth, 75% confidence, size cut after 2 losses.

> **5/** Copy-trading, but with YOUR rules:
>
> ✅ fires only when 2+ tracked wallets enter the same token, same direction, inside 5m / 15m / 1h
> 🛡 blocks the chase if price already ran 2.5% (or 1× ATR) past their fill
> 💵 sizes by YOUR $ risk with an ATR stop + TP1/TP2/TP3, never their notional

> **6/** Optional AI vetting gate: your model scores the wallet (≥ 75% to pass) through the same local endpoint. Per-leader daily loss cap auto-mutes a wallet that's bleeding.
>
> Every decision lands in the signed receipt ledger, with Manual vs Quant vs AI vs Copy win rate and slippage.

> **7/** Want to share a setup without doxxing your account? Share Setup Card exports an Obsidian & Gold PNG: symbol, timeframe, R:R, source, entry/stop/targets. Balances and personal data are masked by design.

> **8/** $0. Runs locally. Paper by default. 32 languages + RTL.
>
> Download v16.5 👇
> https://github.com/uexxx/ExTerm/releases/latest
>
> Not financial advice. Trade small, trade stopped.

### Thread B: "the AI firewall" (5 posts, for builders)

> **1/** I wired my Ollama model to a trading terminal and it can't place an unstopped trade even if it tries. Here's how ExTerm v16.5's AI firewall works. 🧵

> **2/** Your script POSTs `{"symbol","side","entry","stop_loss","tp","confidence"}` to `127.0.0.1/llm-signal` with a local bridge key. Loopback only. Browser origins are refused, so random websites can't post ideas either.

> **3/** The launcher checks the schema + stop direction and signs a receipt (HMAC-SHA256). Rejections come back as HTTP 422 with the reason. Your bot learns from its own rejections.

> **4/** The terminal then applies your guardrails: min ATR stop, liquidity depth multiple, confidence threshold → PAPER shadow slot, 50% size cut after a losing streak. Survivors become ghost lines on the chart.

> **5/** Three ~45-line stdlib Python starters ship in the tab: Grok xAI, ChatGPT/Claude/DeepSeek, and 100% offline Ollama. Exchange keys stay out of the AI and out of ExTerm.
> https://github.com/uexxx/ExTerm/releases/latest

### Single posts (rotate during launch week)

- "Paste any AI's trade idea → dashed ghost lines with R:R on your chart in one click. No stop, no lines. ExTerm v16.5 (free, local): https://github.com/uexxx/ExTerm/releases/latest"
- "Copy-trading that refuses to chase: if price already ran 2.5% past the whale's fill, ExTerm blocks it. Sizing comes from YOUR $ risk. v16.5 🪞🛡"
- "Grok, ChatGPT, Claude, DeepSeek, Ollama, your own bot: one AI Bridge tab, one firewall, zero custody. ExTerm v16.5."
- "Your AI said 'long at 142.5' with no stop. ExTerm said no. 🙅 Mandatory stop-loss is on and can't be switched off."

---

## 2 · Reddit deep-dive templates

> Check each subreddit's self-promotion rules first. Lead with the problem and the method, link once at the end, answer questions in the comments.

### Template A: algo / bot builders (r/algotrading-style communities)

**Title:** I built a local "AI firewall" so LLM trade ideas can't skip the stop-loss (free, runs on 127.0.0.1)

**Body:**

I kept seeing the same failure with LLM trade ideas: invented prices, missing stops, stops on the wrong side, and position sizes copied from whoever the model was imitating. So ExTerm v16.5 adds a bridge that treats every AI or bot as an untrusted advisor.

**How it works**

1. **Context out.** One click copies a packet of real numbers from your chart (trend on 1m/5m/1h/4h, EMA 20/50, RSI 14, ATR 14, AVWAP distance, 10 s / 60 s tape delta, the largest bid/ask walls). Token-Saver mode is around 120 tokens; Full Quant adds everything plus explicit rules.
2. **Ideas in.** Paste the answer (plain English or JSON) or have a script POST it to `http://127.0.0.1:8765/llm-signal` with a local key.
3. **Firewall.** The launcher rejects a missing or wrong-way stop with HTTP 422 and a signed receipt. The terminal then applies min-ATR, depth, confidence-threshold and loss-streak rules. Low confidence goes to a PAPER shadow slot.
4. **Output.** Survivors become dashed ghost lines with R:R and $ badges. Nothing is placed automatically; armed-slot routing is a paper fill, and the existing four-gate live cockpit still controls anything real.

**What I'd love feedback on:** the guardrail defaults (1.5× ATR, 3× depth, 75% confidence, 50% cut after 2 losses), and whether the Pine Script hardener (forces `barstate.isconfirmed`, `lookahead_off`, a `strategy.exit` stop and `max_intraday_loss`) misses common repaint traps.

It's free and local, with no account. Paper by default. Not financial advice. Link: https://github.com/uexxx/ExTerm/releases/latest

### Template B: crypto traders (copy-trading angle)

**Title:** Copy-trading rules I wish every platform had: consensus, no chasing, my own risk size

**Body:**

Most copy tools mirror one wallet's size and entry, even when you're 5% late. In ExTerm v16.5 I went the other way:

- **Consensus or nothing:** a copy only fires when **2+ tracked wallets** enter the same token in the same direction inside 5m / 15m / 1h.
- **Anti-front-run drift shield:** if price has already moved more than **2.5% (or 1× ATR)** past their fill, it's blocked and logged.
- **My risk, not theirs:** size = my $ risk ÷ stop distance, with a stop of at least **1.5× ATR** and TP1/TP2/TP3 at 1R/2R/3R.
- **Optional AI vetting:** a local or cloud model scores the wallet; under 75% means no copy.
- **Per-leader daily loss cap** with auto-mute, three exit modes, and a shadow mode that only logs.

Everything is paper by default and every decision is in a signed receipt ledger with Manual vs Quant vs AI vs Copy stats. No custody, no keys in the app. Not financial advice. https://github.com/uexxx/ExTerm/releases/latest

### Template C: AI / local-LLM communities (Ollama angle)

**Title:** Using a local Ollama model as a trading co-pilot, fully offline, with a hard safety layer

**Body:** ExTerm v16.5 ships a ~45-line standard-library Python script that reads a context packet you copy from the terminal, asks your local model for one JSON trade idea (`format: json`), and POSTs it to the terminal's loopback endpoint. Nothing leaves your machine. The terminal rejects unstopped or wrong-way ideas, applies ATR / confidence guardrails and draws the survivors on the chart for you to review. I'd love to hear which models give the most consistent stop placement. https://github.com/uexxx/ExTerm/releases/latest

---

## 3 · 20-second vertical scripts (Shorts / TikTok / Reels, 9:16)

> Record at 1080×1920 from a 1440×900 window scaled to fit, or crop the screenshot. Big captions, one idea per clip, end on the download line.

### Script 1: "No stop, no trade" (20 s)

| Time | On screen | Voice-over / caption |
|---|---|---|
| 0–3 s | AI chat answer: "Long SOL at 142.50, target 154" (no stop) | "My AI gave me a trade with no stop-loss." |
| 3–7 s | Paste into ExTerm → red "Not plotted. No stop-loss" | "ExTerm refuses it. No stop, no lines." |
| 7–13 s | Paste the fixed idea with "stop 138" → dashed ghost lines, **2.56R** badge | "Add a stop and it's on the chart with R:R and dollar risk." |
| 13–17 s | Receipts table: rejected / ghost / shadow | "Bots get the same firewall on 127.0.0.1." |
| 17–20 s | Logo + "Free · Local · Paper-first" | "ExTerm v16.5. Link in bio." |

### Script 2: "Copy-trading that won't chase" (20 s)

| Time | On screen | Voice-over / caption |
|---|---|---|
| 0–4 s | Whales tab, two wallets enter the same token | "Two smart wallets just bought the same coin." |
| 4–9 s | Price spikes +4% → "Drift Shield: blocked" | "But price already ran 4%. ExTerm blocks the chase." |
| 9–15 s | Next consensus inside the limit → copy with stop + TP1/TP2/TP3 | "When it's clean, it copies, sized by MY risk with an ATR stop." |
| 15–20 s | Ledger attribution row "Copy" | "Every decision is logged. ExTerm v16.5, free." |

### Script 3: "One tab, every AI" (20 s)

| Time | On screen | Voice-over / caption |
|---|---|---|
| 0–5 s | Tap provider pills Grok → ChatGPT → Claude → DeepSeek → Ollama | "Grok, ChatGPT, Claude, DeepSeek, Ollama." |
| 5–11 s | "Copy Chart + Order-Book Packet" → token counter "≈ 120 tokens" | "One click gives any AI real chart numbers, about 120 tokens." |
| 11–16 s | Share Setup Card PNG appears, balance masked | "Share the setup, never your balance." |
| 16–20 s | Download line | "ExTerm v16.5. Free and local." |

---

## 4 · Comparison tables

> Compare against product **categories**, not named brands, so every row stays true.

### ExTerm v16.5 vs. the usual ways traders use AI

| | Raw AI chat | Typical cloud AI trading bot | **ExTerm v16.5 AI Bridge** |
|---|---|---|---|
| Sees your live chart numbers | ✗ (you paste screenshots) | ✓ (on their servers) | ✓ one-click packet, ~120 tokens |
| Works with any model | n/a | usually one vendor | ✓ Grok · ChatGPT · Claude · DeepSeek · Ollama · custom |
| Fully offline option | ✗ | ✗ | ✓ local Ollama template |
| Blocks unstopped / wrong-way ideas | ✗ | varies | ✓ launcher + terminal, 422 receipts |
| Confidence threshold → paper first | ✗ | rarely | ✓ AI Shadow Slot |
| Holds your exchange keys | ✗ | often ✓ | ✗ never |
| Price | subscription | subscription / profit share | $0 |

### ExTerm v16.5 copy engine vs. typical copy-trading

| Rule | Typical copy-trading | **ExTerm v16.5** |
|---|---|---|
| Trigger | one leader trades | 2+ tracked wallets agree inside 5m / 15m / 1h |
| Late entries | copies anyway | Drift Shield blocks > 2.5% or > 1× ATR past the fill |
| Position size | proportional to the leader | your $ risk ÷ ATR stop distance |
| Stop-loss | leader's (if any) | min 1.5× ATR, mandatory |
| Exits | mirror only | Mirror · Independent trailing/TP · Whichever first |
| Bad days | keep copying | per-leader daily loss cap + auto-mute |
| AI review | ✗ | optional vetting gate (≥ 75%) |
| Custody | platform account | none: paper by default, your own bot for live |

---

## 5 · Short copy blocks

- **One-liner:** ExTerm is a free, local trading terminal that works with any AI or bot, and never lets one skip the stop-loss.
- **App-store style (80 chars):** Any AI, one firewall: ghost-line trade ideas, safe copy-trading, zero custody.
- **Bio line:** Free local trading terminal · works with any AI or bot · paper-first · zero custody.
- **Hashtags (use 2–3):** #ExTerm #AITrading #Ollama #AlgoTrading #RiskManagement

*ExTerm holds no funds and no keys. Paper trading is the default. Nothing here is financial advice.*
