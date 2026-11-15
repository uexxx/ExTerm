/* ExTerm v15.4 core: pure logic behind the Learn ExTerm Academy, the on-chain Perp / Smart-Money Leaderboards and the
   15 workstation upgrades. Curriculum + fuzzy search + learning paths + drill checks; ExTerm Alpha Score (mirrors
   serve.py alpha_score exactly), leaderboard / position / fill parsing at the trust boundary, style + tilt + anti-rug
   classifiers, confluence, consensus heatmap, Backtest-Style extraction; ghost candles, step-ladder stops, opening
   ranges, tape velocity, dealer charm / vanna drift, absorption, gap-fill odds, holder clusters, lead-lag, forensic
   move breakdown, plain-English pattern hunter, bot throttle, macro event reactions, tilt guard. No DOM, no eval. */
const V154 = (() => {
  const V = {}, fin = Number.isFinite, clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const num = (x) => { const n = typeof x === 'string' && x.trim() !== '' ? +x : typeof x === 'number' ? x : NaN; return fin(n) ? n : null; };
  const r2 = (x, k = 2) => (fin(x) ? Math.round(x * 10 ** k) / 10 ** k : x);
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const med = (a) => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
  const STR = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, '').slice(0, n);
  const ADDR = /^0x[0-9a-fA-F]{40}$/, COIN = /^[A-Za-z0-9@:._-]{1,24}$/;
  V.ADDR = ADDR; V.isAddr = (a) => typeof a === 'string' && ADDR.test(a);
  V.rng = (seed) => { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };

  /* ══════════ Learn ExTerm Academy ══════════ */
  V.LEARN_MOUNT_TARGETS = ['topbar', 'settings'];
  V.CATS = [['chart', 'Charting & Visual Execution', '📈'], ['flow', 'Order Flow & 0DTE Derivatives', '🌊'], ['scan', 'Scanners & On-Chain DEX', '🔭'], ['quant', 'Institutional Quant Lab', '🧬'], ['grok', 'Grok Bots & 3-Agent Copilot', '⚡'], ['macro', 'World Macro Shield', '🌍'], ['prop', 'Prop-Firm Gauntlets & Trade Journal', '🏁'], ['lead', 'On-Chain Perp & Smart-Money Leaderboards', '🏆'], ['sec', 'Security & External Execution Bridges', '🛡']];
  // [id, cat, title, what, steps ('·'-separated), tip, shortcut, go {tab, lab, drawer, sel, mode}, minutes, drill, quick]
  const M = [
    ['chart-basics', 'chart', 'Read the 240Hz chart', 'Candles, volume, crosshair and timeframes on the GPU-paced main chart.', 'Pick a symbol in the search box · Switch timeframe with the 1s…1d pills · Scroll to zoom, drag to pan · Hover for OHLC', 'Use 1s/1m bars for execution only; decide direction on 15m+.', '/', { tab: 'markets', sel: '#chartWrap, #chart, canvas' }, 2, null, 1],
    ['chart-ladder', 'chart', 'Drag SL / TP ladders', 'Three take-profit rungs with a stop-loss that moves to break-even after TP1.', 'Open the Workstation drawer (🧭) · Click TP ladder · Drag TP1–TP3 on the chart · Right-click a rung to arm step rules', 'Size so the stop distance risks ≤ 1% of equity.', 'Ctrl+K → TP ladder', { tab: 'markets', sel: '#v152Btn, #chartWrap' }, 3, 'ladder', 1],
    ['chart-vwap', 'chart', 'Anchor VWAP', 'Volume-weighted average price from any candle you pick, with ±1/±2σ bands.', 'Open the Workstation drawer · Choose Anchored VWAP · Click the anchor candle', 'Reclaims of an event-anchored VWAP are cleaner than the session VWAP.', 'Ctrl+K → AVWAP', { tab: 'markets', sel: '#chartWrap' }, 2, 'vwap', 0],
    ['chart-ghost', 'chart', 'Multi-Timeframe Ghost Candles', 'Faint 15m / 1h / 4h candle shells behind your 1s / 1m execution bars.', 'Open 🧭 → Charts & Execution · Toggle Ghost candles · Pick 15m, 1h or 4h', 'Trade 1m entries only in the direction of the ghost candle body.', 'G', { tab: 'markets', sel: '#v154Up' }, 1, null, 0],
    ['chart-or', 'chart', 'Opening Range & Kill-Zones', '5m / 15m / 30m opening-range bands plus Asia, London and NY liquidity boxes.', 'Open 🧭 → Charts & Execution · Toggle Session bands · Watch sweeps of the box edges', 'A sweep of the Asia high into London open is a classic liquidity grab.', '', { tab: 'markets', sel: '#v154Up' }, 1, null, 0],
    ['flow-tape', 'flow', 'Tape Velocity Speedometer', 'Market orders per second and bid/ask imbalance bursts on the DOM ladder.', 'Open 🧭 → Order Flow · Toggle the speedometer · Watch the burst lamp', 'Velocity spikes without price progress often mark absorption.', '', { tab: 'markets', sel: '#v154Up' }, 1, null, 0],
    ['flow-gamma', 'flow', '0DTE Gamma Flip & Walls', 'Where dealer hedging flips from dampening to amplifying moves, with call / put walls.', 'Open Stocks · Load an options chain · Enable the γ overlay', 'Above the flip, fade extremes; below it, respect momentum.', '', { tab: 'markets', mode: 'stocks', sel: '#chartWrap' }, 2, null, 0, 'gamma'],
    ['flow-charm', 'flow', 'Dealer Charm & Vanna Drift', 'Intraday hedge drift from time decay (charm) and volatility (vanna).', 'Enable the γ overlay · Toggle Charm / Vanna curve · Read pin vs squeeze windows', 'Late-day charm pins price near the largest open-interest strike.', '', { tab: 'markets', mode: 'stocks', sel: '#v154Up' }, 2, null, 0, 'charm'],
    ['flow-cvd', 'flow', 'CVD Divergence & Absorption', 'Cumulative delta that disagrees with price, and absorption-coloured candle bodies.', 'Open 🧭 → Order Flow · Toggle CVD divergence · Toggle Absorption footprints', 'A higher high on lower CVD is a warning, not an entry by itself.', '', { tab: 'markets', sel: '#v154Up' }, 2, null, 0, 'cvd'],
    ['scan-gap', 'scan', 'Gap-Fill Probability Scanner', 'Ranks gaps by size, pre-market RVOL and 90-day historical fill rate.', 'Open 🧭 → Scanners · Run Gap-fill scan · Click a row to chart it', 'Gaps on news with RVOL > 3× fill far less often.', '', { tab: 'markets', sel: '#v154Up' }, 2, null, 0],
    ['scan-dex', 'scan', 'DEX Holder Cluster X-Ray', 'Separates coordinated fresh-funded sniper wallets from independent buyers.', 'Switch to On-chain · Open a token · Open the safety popover · Expand the X-Ray', 'One funder behind many top holders is a coordinated-dump risk.', '', { tab: 'markets', mode: 'onchain', sel: '#v154Up' }, 2, 'pool', 1],
    ['scan-lag', 'scan', 'Correlation & Lead-Lag', 'Live decoupling alerts between linked markets such as NVDA vs SMH or ETH vs BTC.', 'Open 🧭 → Scanners · Run Lead-lag · Read the lag and decoupling flags', 'Trade the laggard back toward the leader only when correlation is historically high.', '', { tab: 'markets', sel: '#v154Up' }, 1, null, 0],
    ['quant-lab', 'quant', 'Quant Lab Pro tour', 'Backtest, validate and stress any strategy before it ever touches capital.', 'Open Lab → 🧬 · Pick a strategy · Run backtest · Open any accordion', 'Never trust a backtest that has not passed the 17-test gate.', '', { tab: 'lab', lab: 'q153', sel: '#q153Root' }, 2, null, 1],
    ['quant-evolve', 'quant', 'Auto-Evolve', 'Genetic search over parameters and filters, gated by walk-forward and the 17-test lab.', 'Lab → 🧬 → Auto-Evolve · Choose generations · Run · Use a survivor', 'No survivors is an honest answer: there is no robust edge here.', '', { tab: 'lab', lab: 'q153', sel: '#q153Root details[data-sec="evolve"]' }, 2, null, 0],
    ['quant-crisis', 'quant', 'Crisis Time Machine', 'Replays 2020, 2022 and FOMC shocks calibrated to the current market.', 'Lab → 🧬 → Crisis Time Machine · Replay all crises', 'If one crisis wipes out a year of gains, cut size.', '', { tab: 'lab', lab: 'q153', sel: '#q153Root details[data-sec="crisis"]' }, 1, null, 0],
    ['quant-frag', 'quant', 'Slippage Fragility', 'The friction multiple at which the strategy stops making money.', 'Lab → 🧬 → Fragility Break-Point · Set order size · Stress liquidity', 'Below 2× the edge is fragile: real fills will eat it.', '', { tab: 'lab', lab: 'q153', sel: '#q153Root details[data-sec="frag"]' }, 1, null, 0, 'fragility'],
    ['quant-size', 'quant', 'Kelly / ATR Sizing', 'Four sizing models and the odds of passing a $50k / $100k prop evaluation.', 'Lab → 🧬 → Dynamic Sizing · Pick account · Compare', 'Half-Kelly is the ceiling, not the target.', '', { tab: 'lab', lab: 'q153', sel: '#q153Root details[data-sec="sizing"]' }, 1, 'risk', 0],
    ['quant-inspect', 'quant', 'Visual Trade Inspector', 'Click the equity curve to open the exact trade on its candles.', 'Run a backtest · Click the drawdown dip · Step trades with ◀ ▶', 'Inspect the worst trades first: they reveal the hidden rule.', '', { tab: 'lab', lab: 'q153', sel: '#q153Root' }, 1, null, 0],
    ['quant-shadow', 'quant', 'Grok Shadow Bot', 'Promote a validated strategy to dry-run forward ticks with zero capital at risk.', 'Validate to grade A–C · Click Promote to Shadow Bot · Watch the Grok tab', 'Forward-test at least 30 shadow fills before going live.', '', { tab: 'grok', sel: '#q153Grok, #tab-grok' }, 1, null, 0],
    ['grok-copilot', 'grok', '3-Agent Copilot', 'Bull, bear and risk agents debate the setup before you act.', 'Open Grok · Ask about a symbol · Read the three stances', 'Act only when the risk agent agrees.', '', { tab: 'grok', sel: '#tab-grok' }, 2, null, 1],
    ['grok-why', 'grok', 'Explain Why Price Just Moved', 'Alt-click any spike: 60 s of flow, delta and headlines get a root-cause breakdown.', 'Enable Forensic clicks in 🧭 → AI · Alt-click a wick · Read the breakdown', 'A move with no flow and no headline is often a liquidity gap.', 'Alt+Click', { tab: 'markets', sel: '#chartWrap' }, 1, null, 0],
    ['grok-hunt', 'grok', 'Pattern & Liquidity Hunter', 'Type a plain-English query and matching zones are drawn on the chart.', 'Open 🧭 → AI · Type e.g. bullish FVG above VWAP with RVOL > 2.5x · Hunt', 'Combine a structure (FVG) with a filter (RVOL) for fewer, better zones.', '', { tab: 'markets', sel: '#v154Up' }, 1, null, 0],
    ['grok-throttle', 'grok', 'Bot Cool-Off & Volatility Throttle', 'Halves size after two straight losses and pauses entries when ATR > 2.5× normal.', 'Open 🧭 → AI · Toggle the throttle · Watch the status lamp', 'Most blow-ups start in a volatility regime the bot never saw.', '', { tab: 'markets', sel: '#v154Up' }, 1, null, 0],
    ['macro-shield', 'macro', 'World Macro Shield', 'Global headlines graded CRITICAL / HIGH / MACRO with opt-in bot shielding.', 'Open Grok · Read the intel strip · Opt in to auto-pause', 'Flat before CRITICAL headlines beats the best stop-loss.', '', { tab: 'grok', sel: '#tab-grok' }, 1, null, 0],
    ['macro-react', 'macro', 'FOMC / CPI / NFP Reaction Overlay', 'First-5-minute spike, fakeout wick and follow-through from the last 12 releases.', 'Open 🧭 → Macro · Toggle Event reactions · Read the table', 'The first spike after CPI fakes out more often than it follows through.', '', { tab: 'markets', sel: '#v154Up' }, 2, null, 0],
    ['prop-gauntlet', 'prop', 'Prop-Firm Gauntlets', 'Timed challenges with profit targets, daily-loss and trailing-drawdown rules.', 'Open Challenges · Pick a gauntlet · Trade the paper account', 'Daily-loss rules fail more evaluations than bad entries.', '', { tab: 'challenge', sel: '#chHost' }, 1, null, 0],
    ['prop-journal', 'prop', 'Trade Journal & Tilt Guard', 'Every fill is journaled; a banner warns when size doubles right after a stop-out.', 'Open Journal · Tag trades · Review the Tilt Guard', 'Walk away for 15 minutes after a stop-out.', '', { tab: 'journal', sel: '#jnHost' }, 1, 'risk', 1],
    ['prop-replay', 'prop', 'Replay My Worst Loss', 'Loads your worst losing trade into tick replay 30 s before entry.', 'Open Journal · Click Replay my worst loss · Practise the exit', 'Rehearse the exit you should have taken, three times.', '', { tab: 'journal', sel: '#jnHost' }, 1, null, 0],
    ['lead-perp', 'lead', 'Perp Trader Leaderboard', 'Ranked public on-chain perp traders with live positions and the ExTerm Alpha Score.', 'Open Social → Perp Leaderboard · Pick 24h / 7d / 30d / All · Expand a trader', 'Rank by Alpha Score, not raw PnL: PnL rewards leverage.', '', { tab: 'social', sel: '#lbPerpBtn' }, 2, null, 1, 'alpha'],
    ['lead-shadow', 'lead', 'Chart Setup & Shadow Mirror', 'Plot a trader\'s entry and liquidation on your chart or mirror deltas in dry-run.', 'Expand a trader · Click Chart Setup or Shadow Mirror', 'Mirror in dry-run for a week before copying anything.', '', { tab: 'social', sel: '#lbPerpBtn' }, 1, null, 0],
    ['lead-smart', 'lead', 'Smart-Money Wallet Leaderboard', 'Public and saved wallets ranked by win rate, realised PnL and Alpha Score with CONFLUENCE alerts.', 'Switch to On-chain · Open Wallet Tracker · Expand Smart-Money Leaderboard', '2+ top wallets entering the same side within 15 min is the signal worth watching.', '', { tab: 'whales', mode: 'onchain', sel: '#lbSmart' }, 2, null, 0],
    ['lead-backtest', 'lead', 'Backtest a Trader\'s Style', 'Turns a trader\'s cadence, hold time and leverage into a Quant Lab run through the 17-test gate.', 'Expand a trader · Click Backtest Style · Read the grade', 'A great trader with an untestable style is luck until proven otherwise.', '', { tab: 'social', sel: '#lbPerpBtn' }, 1, null, 0],
    ['lead-heat', 'lead', 'Consensus Heatmap & Anti-Rug', 'Where top wallets hold longs, take profits and liquidation walls; filters padded or wash wallets.', 'Social → Perp Leaderboard · Toggle Consensus heatmap · Toggle Anti-Rug filter', 'Liquidation walls within 2.5% act as price magnets.', '', { tab: 'social', sel: '#lbPerpBtn' }, 1, null, 0],
    ['sec-vault', 'sec', 'Key Vault & Strict CSP', 'AES-256 key vault, strict script-hash CSP and zero inline handlers.', 'Open Settings · Set a vault passphrase · Verify build integrity', 'Never paste withdrawal-enabled API keys anywhere.', '', { tab: 'set', sel: '#setBody' }, 1, null, 1],
    ['sec-bridge', 'sec', 'External Execution Bridges', 'Signed webhooks to allow-listed bot services; the Auto-Breakeven ladder is enforced there too.', 'Open Settings · Add a webhook bridge · Send a test signal', 'Use trade-only keys with IP allow-lists on the bridge side.', '', { tab: 'set', sel: '#setBody' }, 1, null, 0],
  ];
  V.MODULES = M.map(([id, cat, title, what, steps, tip, key, go, min, drill, quick, metric]) => ({ id, cat, title, what, steps: steps.split(' · '), tip, key, go, min, drill, quick: !!quick, metric: metric || null }));
  V.byId = (id) => V.MODULES.find((m) => m.id === id) || null;
  V.QUICK = V.MODULES.filter((m) => m.quick).map((m) => m.id);
  V.METRICS = {
    gamma: { title: '0DTE Gamma Flip', lesson: 'flow-gamma', text: 'The price where net dealer gamma changes sign. Above it dealers sell rallies and buy dips (moves dampen); below it they chase (moves accelerate).' },
    fragility: { title: 'Fragility Break-Point', lesson: 'quant-frag', text: 'How many times today\'s spread and impact the strategy survives before it loses money. Under 2× is fragile; 5×+ is robust.' },
    alpha: { title: 'ExTerm Alpha Score', lesson: 'lead-perp', text: '0–100 blend of risk-adjusted ROI (35%), drawdown control (25%), consistency across 24h/7d/30d/All (25%) and liquid, non-churning size (15%).' },
    cvd: { title: 'CVD Divergence', lesson: 'flow-cvd', text: 'Cumulative volume delta making a lower high while price makes a higher high (or the reverse): aggressive buyers are fading.' },
    charm: { title: 'Dealer Charm / Vanna', lesson: 'flow-charm', text: 'Charm is delta decay over time, vanna is delta change with volatility. Into the close, charm hedging can pin price or fuel a squeeze.' },
  };
  V.PATHS = { perps: ['chart-basics', 'chart-ladder', 'flow-tape', 'flow-cvd', 'lead-perp', 'lead-heat', 'grok-throttle', 'prop-journal'], stocks: ['chart-basics', 'chart-or', 'flow-gamma', 'flow-charm', 'scan-gap', 'macro-react', 'chart-vwap'], dex: ['chart-basics', 'scan-dex', 'lead-smart', 'scan-lag', 'grok-hunt', 'sec-vault', 'chart-ghost'], quant: ['quant-lab', 'quant-evolve', 'quant-frag', 'quant-size', 'quant-crisis', 'lead-backtest', 'quant-shadow'] };
  V.GOALS = [['perps', 'Crypto Perps'], ['stocks', 'US Stocks & 0DTE'], ['dex', 'On-Chain DEX'], ['quant', 'No-Code Quant Bots']];
  /* tailored ≤ 15-minute playlist: the goal's ordered lessons, drills first-class, trimmed to the time budget */
  V.path = (goal, budget = 15) => { const ids = V.PATHS[goal] || []; let t = 0; const out = []; for (const id of ids) { const m = V.byId(id); if (!m) continue; const cost = m.min + (m.drill ? 1 : 0); if (t + cost > budget) continue; t += cost; out.push({ id, min: cost, drill: m.drill }); } return { goal, minutes: t, items: out }; };
  V.progress = (done, ids = V.MODULES.map((m) => m.id)) => { const set = new Set(Array.isArray(done) ? done : []), n = ids.filter((i) => set.has(i)).length; return { done: n, total: ids.length, pct: ids.length ? Math.round((n / ids.length) * 100) : 0 }; };
  V.cleanDone = (d) => [...new Set((Array.isArray(d) ? d : []).filter((x) => typeof x === 'string' && V.byId(x)))];
  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const STOP = new Set(['how', 'do', 'i', 'a', 'an', 'the', 'to', 'my', 'on', 'in', 'of', 'what', 'is', 'can', 'use', 'with', 'for', 'and', 'where']);
  const subseq = (q, s) => { let j = 0; for (let i = 0; i < s.length && j < q.length; i++) if (s[i] === q[j]) j++; return j === q.length; };
  /* fuzzy search: "How do I …" phrasing ignored; each remaining word must hit title / category / text / shortcut by
     prefix, substring or ordered subsequence; ranked by where it hit */
  V.search = (q, list = V.MODULES) => {
    const words = fold(q).replace(/[^a-z0-9%/+.\s-]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)); if (!words.length) return list.slice();
    const cat = Object.fromEntries(V.CATS.map(([k, n]) => [k, fold(n)])), out = [];
    list.forEach((m, idx) => {
      const T = fold(m.title), B = fold([m.what, m.steps.join(' '), m.tip, m.key, cat[m.cat]].join(' ')); let sc = 0, hits = 0;
      for (const w of words) { const tw = T.split(/[^a-z0-9%]+/); let s = tw.some((x) => x.startsWith(w)) ? 4 : T.includes(w) ? 3 : B.split(/[^a-z0-9%]+/).some((x) => x.startsWith(w)) ? 2 : B.includes(w) ? 1.5 : w.length >= 4 && subseq(w, T.replace(/\s+/g, '')) ? 1 : 0; if (s) { sc += s; hits++; } }
      if (hits >= Math.max(1, Math.ceil(words.length * 0.6))) out.push({ m, sc: sc + hits * 2, idx });
    });
    return out.sort((a, b) => b.sc - a.sc || a.idx - b.idx).map((x) => x.m);
  };
  /* sandbox drill scenarios: seeded, deterministic, tagged so nothing confuses them with live data */
  V.drillCandles = (kind, seed = 7, n = 160, t0 = 1.7e9, tf = 60) => {
    const r = V.rng(seed), out = []; let p = kind === 'pool' ? 0.0042 : 100;
    for (let i = 0; i < n; i++) {
      const brk = kind !== 'pool' && i > n * 0.7, vol = kind === 'pool' ? 0.035 : brk ? 0.012 : 0.003, drift = brk ? 0.004 : kind === 'pool' && i > n * 0.6 ? -0.006 : 0;
      const o = p; p = Math.max(1e-9, p * Math.exp(drift + (r() - 0.5) * 2 * vol)); const hi = Math.max(o, p) * (1 + r() * vol * 0.6), lo = Math.min(o, p) * (1 - r() * vol * 0.6);
      out.push({ t: t0 + i * tf, o, h: hi, l: lo, c: p, v: (brk ? 4000 : 900) * (0.5 + r()) * (kind === 'pool' ? 0.05 : 1), sim: true });
    }
    return out;
  };
  /* verify the user really performed the drill action (state before vs after) */
  V.drillCheck = (kind, before, after) => {
    const b = before || {}, a = after || {};
    if (kind === 'ladder') return !!(a.ladder && a.ladder.levels && (!b.ladder || a.ladder.moved || JSON.stringify(a.ladder.levels.map((x) => r2(x.p, 6))) !== JSON.stringify((b.ladder.levels || []).map((x) => r2(x.p, 6)))));
    if (kind === 'risk') { const v = num(a.riskPct); return v != null && v > 0 && v <= 2 && a.sizeMode === 'risk' && (b.sizeMode !== 'risk' || v !== num(b.riskPct)); }
    if (kind === 'vwap') return a.anchor != null && fin(+a.anchor) && a.anchor !== b.anchor;
    if (kind === 'pool') return !!a.xray;
    return false;
  };

  /* ══════════ ExTerm Alpha Score (identical formula in serve.py: alpha_score) ══════════ */
  const tanh = (x) => { const e = Math.exp(2 * clamp(x, -20, 20)); return (e - 1) / (e + 1); };
  V.alphaScore = (w) => {
    const g = (k) => { const v = num(w && w[k]); return v == null ? 0 : v; };
    const rd = g('roiDay'), rw = g('roiWeek'), rm = g('roiMonth'), ra = g('roiAll'), acct = Math.max(0, g('acct')), vlm = Math.max(0, g('vlmMonth'));
    const risk = clamp(0.5 + 0.5 * tanh(rm / 0.5 + ra / 4), 0, 1); // risk-adjusted ROI: 30d dominates, all-time anchors
    const dd = clamp(1 - Math.max(0, -Math.min(rd, rw, rm)) * 2.5, 0, 1); // drawdown control: worst window loss
    const cons = [rd, rw, rm, ra].filter((x) => x > 0).length / 4; // consistency across windows
    const turn = acct > 0 ? vlm / acct : 0, size = clamp((Math.log10(Math.max(1, acct)) - 3) / 5, 0, 1), churn = turn > 400 ? clamp(1 - (turn - 400) / 1600, 0, 1) : 1; // liquid, non-churning
    return Math.round(100 * (0.35 * risk + 0.25 * dd + 0.25 * cons + 0.15 * size * churn));
  };
  /* leaderboard JSON (raw stats-data rows or the launcher's cleaned rows) → validated rows */
  const WIN = { day: 'day', week: 'week', month: 'month', allTime: 'allTime' };
  V.WINDOWS = [['day', '24h'], ['week', '7d'], ['month', '30d'], ['allTime', 'All']];
  V.cleanRow = (x) => {
    if (!x || typeof x !== 'object') return null; const addr = x.addr || x.ethAddress; if (!V.isAddr(addr)) return null;
    const out = { addr: addr.toLowerCase(), name: STR(x.name != null ? x.name : x.displayName, 32).replace(/[<>&"'`]/g, ''), acct: Math.max(0, num(x.acct != null ? x.acct : x.accountValue) || 0), pnl: {}, roi: {}, vlm: {} };
    if (Array.isArray(x.windowPerformances)) { for (const it of x.windowPerformances) if (Array.isArray(it) && WIN[it[0]] && it[1] && typeof it[1] === 'object') { out.pnl[it[0]] = num(it[1].pnl) || 0; out.roi[it[0]] = num(it[1].roi) || 0; out.vlm[it[0]] = Math.max(0, num(it[1].vlm) || 0); } }
    else for (const k of Object.keys(WIN)) { out.pnl[k] = num(x.pnl && x.pnl[k]) || 0; out.roi[k] = num(x.roi && x.roi[k]) || 0; out.vlm[k] = Math.max(0, num(x.vlm && x.vlm[k]) || 0); }
    for (const k of Object.keys(WIN)) { if (!fin(out.pnl[k])) out.pnl[k] = 0; if (!fin(out.roi[k])) out.roi[k] = 0; if (!fin(out.vlm[k])) out.vlm[k] = 0; }
    out.alpha = V.alphaScore({ roiDay: out.roi.day, roiWeek: out.roi.week, roiMonth: out.roi.month, roiAll: out.roi.allTime, acct: out.acct, vlmMonth: out.vlm.month });
    return out;
  };
  V.parseBoard = (j) => { const rows = Array.isArray(j) ? j : j && (Array.isArray(j.rows) ? j.rows : Array.isArray(j.leaderboardRows) ? j.leaderboardRows : []); const seen = new Set(), out = []; for (const x of rows.slice(0, 5000)) { const r = V.cleanRow(x); if (r && !seen.has(r.addr)) { seen.add(r.addr); out.push(r); } } return out; };
  V.rank = (rows, win = 'month', by = 'pnl', n = 100) => (rows || []).filter((r) => r && WIN[win]).slice().sort((a, b) => (by === 'alpha' ? b.alpha - a.alpha || b.pnl[win] - a.pnl[win] : by === 'roi' ? b.roi[win] - a.roi[win] : b.pnl[win] - a.pnl[win])).slice(0, n);
  /* clearinghouseState → positions */
  V.positions = (st) => {
    const ap = st && Array.isArray(st.assetPositions) ? st.assetPositions : [], out = [];
    for (const x of ap.slice(0, 200)) { const p = x && x.position; if (!p || !COIN.test(String(p.coin || ''))) continue; const szi = num(p.szi); if (!szi) continue;
      const entry = num(p.entryPx) || 0, ntl = Math.abs(num(p.positionValue) || Math.abs(szi) * entry), lev = p.leverage && typeof p.leverage === 'object' ? num(p.leverage.value) : num(p.leverage);
      out.push({ coin: String(p.coin), side: szi > 0 ? 'Long' : 'Short', szi, entry, ntl, lev: lev || null, upnl: num(p.unrealizedPnl) || 0, liq: num(p.liquidationPx), mark: ntl && szi ? ntl / Math.abs(szi) : entry, roe: num(p.returnOnEquity) }); }
    const acct = st && st.marginSummary ? num(st.marginSummary.accountValue) : null;
    return { acct: acct || 0, list: out.sort((a, b) => b.ntl - a.ntl) };
  };
  /* userFills → clean fills (newest last) */
  V.fills = (arr) => (Array.isArray(arr) ? arr : []).slice(0, 2000).map((f) => f && COIN.test(String(f.coin || '')) && num(f.px) > 0 && num(f.sz) > 0 && num(f.time) > 0 ? { coin: String(f.coin), px: num(f.px), sz: num(f.sz), t: num(f.time), side: f.side === 'A' ? 'A' : 'B', dir: STR(f.dir, 24), pnl: num(f.closedPnl) || 0, start: num(f.startPosition) || 0 } : null).filter(Boolean).sort((a, b) => a.t - b.t);
  const isOpen = (f) => /^Open/.test(f.dir) || (!/Close/.test(f.dir) && !f.pnl), isClose = (f) => /Close/.test(f.dir) || (f.pnl !== 0 && !/^Open/.test(f.dir));
  /* stats from fills: win rate, hold time, cadence, favoured coins, size profile */
  V.fillStats = (fills) => {
    const F = fills || [], closes = F.filter(isClose), opens = F.filter(isOpen), wins = closes.filter((f) => f.pnl > 0).length, open = {}, holds = [];
    for (const f of F) { if (isOpen(f) && open[f.coin] == null) open[f.coin] = f.t; else if (isClose(f) && open[f.coin] != null && Math.abs(f.start) <= f.sz * 1.0001) { holds.push((f.t - open[f.coin]) / 60000); open[f.coin] = null; } }
    const span = F.length > 1 ? (F[F.length - 1].t - F[0].t) / 86400000 : 0, by = {}; for (const f of opens) by[f.coin] = (by[f.coin] || 0) + f.px * f.sz;
    return { trades: F.length, closes: closes.length, winRate: closes.length ? r2(wins / closes.length, 3) : null, realized: r2(closes.reduce((s, f) => s + f.pnl, 0), 2), avgHoldMin: holds.length ? r2(med(holds), 1) : null, opensPerDay: span > 0 ? r2(opens.length / span, 2) : opens.length, favored: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k), medNtl: r2(med(opens.map((f) => f.px * f.sz)), 2) };
  };
  /* style tag: hold time + entry burstiness */
  V.styleTag = (st, fills) => {
    const h = st && st.avgHoldMin; if (h == null) return 'Unclassified';
    const opens = (fills || []).filter(isOpen); let bursts = 0; for (let i = 2; i < opens.length; i++) if (opens[i].t - opens[i - 2].t < 120000 && (i < 3 || opens[i - 2].t - opens[i - 3].t > 6 * 3600000)) bursts++;
    if (h < 30) return 'Scalper'; if (bursts >= 2) return 'News Sniper'; if (h > 720) return 'Swing'; return st.winRate != null && st.winRate >= 0.55 ? 'Mean-Reversion' : 'Swing';
  };
  /* tilted whale: ≥ 2 straight losing closes followed by an open ≥ 2× the median earlier open size */
  V.tilt = (fills) => {
    const F = fills || []; let streak = 0; const sizes = [];
    for (const f of F) { if (isClose(f)) { streak = f.pnl < 0 ? streak + 1 : 0; continue; } const n = f.px * f.sz; if (streak >= 2 && sizes.length >= 3 && n >= 2 * med(sizes)) return { tilt: true, why: `${streak} losses in a row, then a ${r2(n / med(sizes), 1)}× size open on ${f.coin}`, t: f.t, coin: f.coin }; sizes.push(n); }
    return { tilt: false };
  };
  /* liquidation magnets: positions sitting within pct% of their liquidation price */
  V.liqMagnets = (positions, pct = 2.5) => (positions || []).filter((p) => p.liq > 0 && p.mark > 0 && Math.abs(p.mark - p.liq) / p.mark <= pct / 100).map((p) => ({ coin: p.coin, side: p.side, liq: p.liq, dist: r2((Math.abs(p.mark - p.liq) / p.mark) * 100, 2), ntl: p.ntl }));
  /* position delta radar: prev vs current positions (+ trigger orders for stop changes) */
  V.delta = (prev, cur, prevOrd, curOrd) => {
    const P = new Map((prev || []).map((p) => [p.coin, p])), C = new Map((cur || []).map((p) => [p.coin, p])), out = [];
    for (const [k, p] of P) { const c = C.get(k); if (!c || Math.sign(c.szi) !== Math.sign(p.szi)) out.push({ coin: k, badge: 'Full Exit', kind: 'exit' }); else { const ch = Math.abs(c.szi) / Math.abs(p.szi) - 1; if (ch <= -0.1) out.push({ coin: k, badge: `${Math.round(ch * 100)}% Size Trimmed`, kind: 'trim' }); else if (ch >= 0.1) out.push({ coin: k, badge: `+${Math.round(ch * 100)}% Size Added`, kind: 'add' }); } }
    for (const [k, c] of C) if (!P.has(k)) out.push({ coin: k, badge: 'New ' + c.side, kind: 'new' });
    const sl = (ord, coin) => (ord || []).filter((o) => o && o.coin === coin && o.isTrigger && num(o.triggerPx) > 0).map((o) => num(o.triggerPx));
    for (const [k, c] of C) { const a = sl(prevOrd, k), b = sl(curOrd, k); if (a.length && b.length && c.mark > 0) { const da = Math.min(...a.map((x) => Math.abs(c.mark - x))), db = Math.min(...b.map((x) => Math.abs(c.mark - x))); if (db < da * 0.97) out.push({ coin: k, badge: 'SL Tightened', kind: 'sl' }); } }
    return out;
  };
  /* anti-rug / copy-trap: dust win-rate padding, circular wash volume, bundled same-millisecond fills across wallets */
  V.antiRug = (row, fills, peers) => {
    const why = [], closes = (fills || []).filter(isClose), wins = closes.filter((f) => f.pnl > 0);
    if (wins.length >= 10 && wins.filter((f) => f.pnl < 1).length / wins.length > 0.4) why.push('micro-dust win-rate padding');
    if (row && row.acct > 0 && row.vlm && row.vlm.month / row.acct > 2000) why.push('circular wash volume');
    if (peers && fills && fills.length) { const mine = new Set(fills.map((f) => f.coin + '|' + f.t)); for (const [addr, pf] of Object.entries(peers)) { if (row && addr === row.addr) continue; const hit = (pf || []).filter((f) => mine.has(f.coin + '|' + f.t)).length; if (hit >= 3) { why.push('bundled fills with ' + addr.slice(0, 6) + '…'); break; } } }
    return { flag: why.length > 0, why };
  };
  /* confluence: 2+ Top-25 wallets opening the same coin + direction within win seconds */
  V.confluence = (entries, win = 900, min = 2) => {
    const by = new Map(), out = [];
    for (const e of (entries || []).filter((x) => x && V.isAddr(x.addr) && COIN.test(x.coin || '') && (x.side === 'Long' || x.side === 'Short') && fin(x.t)).sort((a, b) => a.t - b.t)) {
      const k = e.coin + '|' + e.side, L = by.get(k) || []; L.push(e); while (L.length && e.t - L[0].t > win) L.shift(); by.set(k, L);
      const who = [...new Set(L.map((x) => x.addr))]; if (who.length >= min && !out.some((y) => y.key === k && e.t - y.t < win)) out.push({ key: k, coin: e.coin, side: e.side, t: e.t, wallets: who.slice(0, 8) });
    }
    return out;
  };
  /* consensus heatmap: price-axis bins of net long / short entry notional, TP clusters and liquidation walls */
  V.heatmap = (books, coin, lo, hi, bins = 40) => {
    if (!(hi > lo) || bins < 1) return null; const B = Array.from({ length: bins }, (_, i) => ({ p0: lo + ((hi - lo) * i) / bins, p1: lo + ((hi - lo) * (i + 1)) / bins, long: 0, short: 0, tp: 0, liq: 0 }));
    const at = (p) => (p >= lo && p < hi ? B[Math.min(bins - 1, Math.floor(((p - lo) / (hi - lo)) * bins))] : null);
    for (const bk of books || []) { for (const p of (bk && bk.positions) || []) { if (p.coin !== coin) continue; const b = at(p.entry); if (b) b[p.side === 'Long' ? 'long' : 'short'] += p.ntl; const l = at(p.liq); if (l) l.liq += p.ntl; } for (const o of (bk && bk.orders) || []) { if (o.coin !== coin || o.isTrigger || !o.reduceOnly) continue; const b = at(num(o.limitPx)); if (b) b.tp += (num(o.sz) || 0) * (num(o.limitPx) || 0); } }
    const mx = Math.max(1, ...B.map((b) => Math.max(b.long, b.short, b.tp, b.liq))); for (const b of B) b.w = r2(Math.max(b.long, b.short, b.tp, b.liq) / mx, 3);
    return B;
  };
  /* Backtest Style: trader fills → Quant Lab spec (strategy family, time stop, cooldown, leverage profile) */
  V.styleSpec = (st, tag, tfSec = 3600) => {
    const hold = st && st.avgHoldMin ? st.avgHoldMin : 240, perDay = st && st.opensPerDay ? st.opensPerDay : 1, bar = tfSec / 60;
    const strat = tag === 'Mean-Reversion' ? 'rsi' : tag === 'Scalper' ? 'q4_qs_ema513' : tag === 'News Sniper' ? 'bbbreak' : 'donchian';
    return { strat, tf: tfSec >= 86400 ? '1d' : tfSec >= 14400 ? '4h' : '1h', filters: { timeStop: clamp(Math.round(hold / bar), 2, 200), cooldown: clamp(Math.round(1440 / Math.max(0.1, perDay) / bar / 2), 0, 50) }, coin: (st && st.favored && st.favored[0]) || 'BTC', hold, perDay, lev: st && st.lev ? st.lev : null };
  };

  /* ══════════ 15 workstation upgrades ══════════ */
  // 1. ghost candles: higher-timeframe shells over the visible bars
  V.ghost = (D, htfSec) => { const out = []; let cur = null; for (let i = 0; i < (D || []).length; i++) { const c = D[i], t0 = Math.floor(c.t / htfSec) * htfSec; if (!cur || cur.t0 !== t0) { cur = { t0, t1: t0 + htfSec, i0: i, i1: i, o: c.o, h: c.h, l: c.l, c: c.c }; out.push(cur); } else { cur.i1 = i; cur.h = Math.max(cur.h, c.h); cur.l = Math.min(cur.l, c.l); cur.c = c.c; } } return out; };
  // 2. auto-breakeven / trailing step-ladder on top of the v15.2 TP ladder (rules armed per rung)
  V.STEP_RULES = { be01: 'Move SL to Entry +0.1R', be: 'Move SL to Entry', tp1: 'Trail SL to TP1', none: 'No stop move' };
  V.stepLadder = (L, rules) => {
    if (!L || !L.levels) return null; const R = Math.abs(L.entry - (L.sl0 != null ? L.sl0 : L.sl)), dir = L.long ? 1 : -1, ev = []; let sl = L.sl;
    L.levels.forEach((x, i) => { if (!x.hit) return; const r = (rules || {})['TP' + (i + 1)]; let to = null; if (r === 'be01') to = L.entry + dir * 0.1 * R; else if (r === 'be') to = L.entry; else if (r === 'tp1' && i >= 1) to = L.levels[0].p; if (to != null && (L.long ? to > sl : to < sl)) { sl = to; ev.push(`TP${i + 1} → ${V.STEP_RULES[r]}`); } });
    return { sl, events: ev };
  };
  // 3. opening range + kill-zone boxes for the day of the last bar
  V.openingRange = (D, startUtcMin, mins = [5, 15, 30]) => {
    if (!D || !D.length) return null; const last = D[D.length - 1].t, day = Math.floor(last / 86400) * 86400, t0 = day + startUtcMin * 60, out = {};
    for (const m of mins) { const bs = D.filter((c) => c.t >= t0 && c.t < t0 + m * 60); if (bs.length) out[m] = { hi: Math.max(...bs.map((c) => c.h)), lo: Math.min(...bs.map((c) => c.l)), t0, t1: t0 + m * 60 }; }
    return out;
  };
  V.KILLZONES = { asia: [0, 6], london: [7, 10], ny: [12, 15] };
  V.killZones = (D) => { if (!D || !D.length) return {}; const day = Math.floor(D[D.length - 1].t / 86400) * 86400, out = {}; for (const [k, [a, b]] of Object.entries(V.KILLZONES)) { const t0 = day + a * 3600, t1 = day + b * 3600, bs = D.filter((c) => c.t >= t0 && c.t < t1); if (bs.length) out[k] = { t0, t1, hi: Math.max(...bs.map((c) => c.h)), lo: Math.min(...bs.map((c) => c.l)) }; } return out; };
  // 4. tape velocity: market orders / s and imbalance burst over the last window
  V.tapeVelocity = (trades, nowMs, winMs = 5000) => {
    const T = (trades || []).filter((x) => x && nowMs - x.t <= winMs && x.t <= nowMs), prev = (trades || []).filter((x) => x && nowMs - x.t > winMs && nowMs - x.t <= winMs * 7);
    const buy = T.filter((x) => x.side === 'buy').reduce((s, x) => s + (x.q || 1), 0), sell = T.filter((x) => x.side !== 'buy').reduce((s, x) => s + (x.q || 1), 0), perSec = T.length / (winMs / 1000), base = prev.length / ((winMs * 6) / 1000);
    const imb = buy + sell ? (buy - sell) / (buy + sell) : 0; return { perSec: r2(perSec, 1), base: r2(base, 1), imbalance: r2(imb, 2), burst: perSec >= Math.max(2, base * 2.5) && Math.abs(imb) >= 0.4, side: imb >= 0 ? 'buy' : 'sell' };
  };
  // 5. dealer charm / vanna intraday drift curve (Black-Scholes, dealer short the open interest)
  const npdf = (x) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  V.greeks2 = (S, K, T, iv, r = 0.04) => { if (!(S > 0 && K > 0 && T > 0 && iv > 0)) return { charm: 0, vanna: 0 }; const v = iv * Math.sqrt(T), d1 = (Math.log(S / K) + (r + iv * iv / 2) * T) / v, d2 = d1 - v; return { charm: -npdf(d1) * (2 * r * T - d2 * v) / (2 * T * v), vanna: -npdf(d1) * d2 / iv }; };
  V.charmCurve = (chain, spot, hoursLeft = 6.5, steps = 13) => {
    if (!chain || !(spot > 0)) return null; const legs = [].concat((chain.calls || []).map((c) => [c, 1]), (chain.puts || []).map((p) => [p, -1])).filter(([x]) => x && x.strike > 0 && x.oi > 0); if (!legs.length) return null;
    const pts = []; for (let k = 0; k <= steps; k++) { const h = hoursLeft * (1 - k / steps), T = Math.max(1 / (365 * 24 * 12), h / (24 * 365)); let ch = 0, va = 0; for (const [x, s] of legs) { const g = V.greeks2(spot, x.strike, T, x.iv || 0.5); ch += -s * g.charm * x.oi * 100 * spot / (24 * 365); va += -s * g.vanna * x.oi * 100 * 0.01; } pts.push({ h: r2(h, 2), charm: r2(ch, 0), vanna: r2(va, 0) }); }
    const late = pts.slice(-4), drift = late.reduce((s, p) => s + p.charm, 0), mxOi = legs.slice().sort((a, b) => b[0].oi - a[0].oi)[0][0].strike;
    return { pts, pinStrike: mxOi, window: Math.abs(spot - mxOi) / spot < 0.004 ? 'pin' : Math.abs(drift) > Math.abs(pts[0].charm) * 2 ? 'squeeze' : 'neutral', drift: r2(drift, 0) };
  };
  // 6. absorption footprints: high volume + small body relative to range and recent volume
  V.absorption = (D, look = 20) => (D || []).map((c, i) => { if (i < look) return null; const vs = D.slice(i - look, i).map((x) => x.v), mv = mean(vs) || 1, rng = c.h - c.l || 1e-12, body = Math.abs(c.c - c.o) / rng, delta = ((c.c - c.o) / rng) * c.v, rv = c.v / mv; const a = clamp((rv - 1.3) / 2, 0, 1) * clamp(1 - body * 2, 0, 1); return a > 0.15 ? { i, absorb: r2(a, 2), side: c.c >= (c.h + c.l) / 2 ? 'bid' : 'ask', delta: r2(delta, 0) } : null; }).filter(Boolean);
  // 7. gap-fill probability from daily candles
  V.gapStats = (D, look = 90) => {
    if (!D || D.length < 25) return null; const last = D[D.length - 1], prev = D[D.length - 2], gap = (last.o / prev.c - 1) * 100, vols = D.slice(-21, -1).map((c) => c.v), rvol = (mean(vols) ? last.v / mean(vols) : 0);
    let n = 0, filled = 0; for (let i = Math.max(1, D.length - 1 - look); i < D.length - 1; i++) { const g = D[i].o / D[i - 1].c - 1; if (Math.abs(g) < 0.003 || Math.sign(g) !== Math.sign(gap || 1)) continue; n++; if (g > 0 ? D[i].l <= D[i - 1].c : D[i].h >= D[i - 1].c) filled++; }
    return { gap: r2(gap, 2), rvol: r2(rvol, 2), n, fillRate: n ? r2(filled / n, 2) : null };
  };
  // 8. holder cluster x-ray: wallets funded by the same source within a short window form a coordinated cluster
  V.holderClusters = (holders, winSec = 1800) => {
    const H = (holders || []).filter((h) => h && typeof h.addr === 'string' && num(h.pct) >= 0).slice(0, 50), by = new Map();
    for (const h of H) { const k = h.funder || ('self:' + h.addr); const L = by.get(k) || []; L.push(h); by.set(k, L); }
    const out = []; for (const [funder, L] of by) { const ts = L.map((x) => num(x.t)).filter(fin).sort((a, b) => a - b), tight = ts.length > 1 && ts[ts.length - 1] - ts[0] <= winSec, coord = L.length >= 3 && !funder.startsWith('self:') && (tight || L.every((x) => x.fresh)); out.push({ funder: funder.startsWith('self:') ? null : funder, members: L.map((x) => x.addr), pct: r2(L.reduce((s, x) => s + num(x.pct), 0), 2), coordinated: coord }); }
    out.sort((a, b) => b.pct - a.pct); const coordPct = r2(out.filter((c) => c.coordinated).reduce((s, c) => s + c.pct, 0), 2);
    return { clusters: out, coordPct, verdict: coordPct >= 20 ? 'high' : coordPct >= 8 ? 'elevated' : 'low' };
  };
  // 9. correlation, beta and lead-lag between two close series
  const rets = (a) => a.slice(1).map((x, i) => (a[i] > 0 ? x / a[i] - 1 : 0));
  const corr = (a, b) => { const n = Math.min(a.length, b.length); if (n < 5) return null; const x = a.slice(-n), y = b.slice(-n), mx = mean(x), my = mean(y); let sxy = 0, sx = 0, sy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) ** 2; sy += (y[i] - my) ** 2; } return sx && sy ? sxy / Math.sqrt(sx * sy) : null; };
  V.leadLag = (A, B, maxLag = 5, recent = 30) => {
    const a = rets(A || []), b = rets(B || []), n = Math.min(a.length, b.length); if (n < recent + maxLag + 5) return null; const x = a.slice(-n), y = b.slice(-n);
    let best = { lag: 0, c: corr(x, y) || 0 }; for (let L = 1; L <= maxLag; L++) { const c1 = corr(x.slice(0, n - L), y.slice(L)) || 0, c2 = corr(x.slice(L), y.slice(0, n - L)) || 0; if (Math.abs(c1) > Math.abs(best.c) + 0.02) best = { lag: L, c: c1 }; if (Math.abs(c2) > Math.abs(best.c) + 0.02) best = { lag: -L, c: c2 }; }
    const full = corr(x, y) || 0, rc = corr(x.slice(-recent), y.slice(-recent)) || 0, vb = sd(y) ** 2, beta = vb ? (corr(x, y) * sd(x) * sd(y)) / vb : 0;
    return { corr: r2(full, 2), recent: r2(rc, 2), beta: r2(beta, 2), lag: best.lag, decoupled: full >= 0.6 && rc < full - 0.35 };
  };
  // 10. forensic breakdown of the last 60 s around a clicked spike
  V.forensic = (bars, flow, heads) => {
    const B = (bars || []).filter((c) => c && c.c > 0); if (B.length < 2) return null; const p0 = B[0].o || B[0].c, p1 = B[B.length - 1].c, mv = (p1 / p0 - 1) * 100, hi = Math.max(...B.map((c) => c.h)), lo = Math.min(...B.map((c) => c.l));
    const vol = B.reduce((s, c) => s + c.v, 0), wick = mv >= 0 ? (hi - Math.max(p0, p1)) / (hi - lo || 1) : (Math.min(p0, p1) - lo) / (hi - lo || 1), why = [];
    const f = flow || {}; if (f.imbalance != null && Math.abs(f.imbalance) >= 0.4) why.push(`aggressive ${f.imbalance > 0 ? 'buying' : 'selling'} (${Math.round(Math.abs(f.imbalance) * 100)}% imbalance)`);
    if (f.rvol != null && f.rvol >= 2) why.push(`volume ${r2(f.rvol, 1)}× normal`); if (wick > 0.5) why.push('long rejection wick: liquidity sweep / stop run'); const h = (heads || []).filter(Boolean)[0]; if (h) why.push('headline: ' + STR(h, 140));
    if (!why.length) why.push('thin liquidity: price moved without unusual flow or news');
    return { move: r2(mv, 3), range: r2(((hi - lo) / p0) * 100, 3), vol: r2(vol, 2), wick: r2(wick, 2), why };
  };
  // 11. plain-English pattern + liquidity hunter
  V.parseHunt = (q) => {
    const s = fold(q); if (!s.trim()) return null; const pat = /\bfvg|fair value/.test(s) ? 'fvg' : /order ?block|\bob\b/.test(s) ? 'ob' : /sweep|liquidity grab|stop run/.test(s) ? 'sweep' : /engulf/.test(s) ? 'eng' : null; if (!pat) return null;
    const dir = /bull|long|demand/.test(s) ? 'bull' : /bear|short|supply/.test(s) ? 'bear' : null, vw = /above (the )?vwap/.test(s) ? 'above' : /below (the )?vwap/.test(s) ? 'below' : null, m = /rvol\s*(?:>|>=|over|above)\s*(\d+(?:\.\d+)?)/.exec(s);
    return { pattern: pat, dir, vwap: vw, rvol: m ? Math.min(50, +m[1]) : null };
  };
  V.hunt = (D, spec, finder) => {
    if (!spec || !D || D.length < 25 || typeof finder !== 'function') return []; let pv = 0, vv = 0; const vw = D.map((c) => { pv += ((c.h + c.l + c.c) / 3) * c.v; vv += c.v; return vv ? pv / vv : c.c; });
    return finder(D, spec.pattern).filter((z) => { if (spec.dir && z.dir !== spec.dir) return false; const c = D[z.i]; if (!c) return false; if (spec.vwap === 'above' && !(c.c > vw[z.i])) return false; if (spec.vwap === 'below' && !(c.c < vw[z.i])) return false; if (spec.rvol != null) { const m = mean(D.slice(Math.max(0, z.i - 20), z.i).map((x) => x.v)) || 1; if (c.v / m < spec.rvol) return false; } return true; });
  };
  // 12. bot drawdown cool-off + volatility throttle
  V.throttle = (results, atrNow, atr20) => { const R = (results || []).filter(fin); let streak = 0; for (let i = R.length - 1; i >= 0 && R[i] < 0; i--) streak++; if (atr20 > 0 && atrNow > 2.5 * atr20) return { factor: 0, why: `ATR ${r2(atrNow / atr20, 1)}× its 20-day average: entries paused` }; if (streak >= 2) return { factor: 0.5, why: `${streak} losses in a row: size halved` }; return { factor: 1, why: 'normal' }; };
  // 13. macro event reactions (past releases; ET → UTC with the US DST rule)
  const nthSun = (y, m, n) => { const d = new Date(Date.UTC(y, m, 1)); return 1 + ((7 - d.getUTCDay()) % 7) + 7 * (n - 1); };
  V.etToUtc = (ymd, hh, mm) => { const [y, mo, d] = ymd.split('-').map(Number), dst = (mo > 3 && mo < 11) || (mo === 3 && d >= nthSun(y, 2, 2)) || (mo === 11 && d < nthSun(y, 10, 1)); return Date.UTC(y, mo - 1, d, hh + (dst ? 4 : 5), mm) / 1000; };
  const FOMC = ['2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18', '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10', '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28'];
  const CPI = ['2025-01-15', '2025-02-12', '2025-03-12', '2025-04-10', '2025-05-13', '2025-06-11', '2025-07-15', '2025-08-12', '2025-09-11'];
  const NFP = ['2025-01-10', '2025-02-07', '2025-03-07', '2025-04-04', '2025-05-02', '2025-06-06', '2025-07-03', '2025-08-01', '2025-09-05'];
  V.pastEvents = (nowSec, kinds = ['fomc', 'cpi', 'nfp'], n = 12) => { const all = [].concat(FOMC.map((d) => ({ k: 'fomc', d, t: V.etToUtc(d, 14, 0) })), CPI.map((d) => ({ k: 'cpi', d, t: V.etToUtc(d, 8, 30) })), NFP.map((d) => ({ k: 'nfp', d, t: V.etToUtc(d, 8, 30) }))); return kinds.map((k) => all.filter((e) => e.k === k && e.t < nowSec).sort((a, b) => b.t - a.t).slice(0, n)).flat().sort((a, b) => a.t - b.t); };
  V.reaction = (D, t) => {
    const i = (D || []).findIndex((c) => c.t >= t); if (i < 1) return null; const base = D[i - 1].c, sec = D[i].t - D[i - 1].t || 60, w5 = D.slice(i, i + Math.max(1, Math.round(300 / sec))), w60 = D.slice(i, i + Math.max(1, Math.round(3600 / sec))); if (!w5.length || !(base > 0)) return null;
    const hi = Math.max(...w5.map((c) => c.h)), lo = Math.min(...w5.map((c) => c.l)), up = hi / base - 1, dn = lo / base - 1, spike = Math.abs(up) >= Math.abs(dn) ? up : dn, end5 = w5[w5.length - 1].c / base - 1, end60 = w60[w60.length - 1].c / base - 1;
    return { spike: r2(spike * 100, 2), close5: r2(end5 * 100, 2), follow60: r2(end60 * 100, 2), fakeout: Math.sign(end60) !== Math.sign(spike) && Math.abs(spike) > 0.0005, t: D[i].t };
  };
  // 14. tilt & revenge-trade guard over the journal
  V.tiltGuard = (entries, winMs = 180000) => {
    const E = (entries || []).filter((e) => e && fin(e.ts)).slice().sort((a, b) => a.ts - b.ts), out = [];
    for (let i = 0; i < E.length; i++) { const e = E[i]; if (e.side !== 'sell' || !(e.pnl < 0)) continue; const lastBuy = E.slice(0, i).reverse().find((x) => x.side === 'buy' && x.sym === e.sym), nxt = E.slice(i + 1).find((x) => x.side === 'buy' && x.ts - e.ts <= winMs); if (lastBuy && nxt && nxt.usd >= 2 * lastBuy.usd) out.push({ ts: nxt.ts, sym: nxt.sym, mult: r2(nxt.usd / lastBuy.usd, 1), why: `size ${r2(nxt.usd / lastBuy.usd, 1)}× within ${Math.round((nxt.ts - e.ts) / 1000)} s of a stop-out` }); }
    const hour = E.filter((e) => E.length && E[E.length - 1].ts - e.ts <= 3600000 && e.side === 'buy').length;
    return { events: out, warn: out.length > 0 && Date.now() - out[out.length - 1].ts < 6 * 3600000, freq: hour, overtrading: hour >= 12 };
  };
  // 15. worst losing trade + replay start (30 s before its entry)
  V.worstLoss = (entries) => { const L = (entries || []).filter((e) => e && e.side === 'sell' && e.pnl < 0).sort((a, b) => a.pnl - b.pnl)[0]; if (!L) return null; const held = num(L.held) || 0, entryMs = L.ts - held; return { exit: L, entryMs, startMs: entryMs - 30000 }; };
  return V;
})();
if (typeof module === 'object' && module.exports) module.exports = V154;
