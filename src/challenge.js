/* ExTerm Challenges Hub: replay challenges (a random or daily slice of real history, the future hidden, beat buy-and-hold)
   plus rule-based modes: Prop-Firm evaluations, Black Swan survival, a 10-minute scalping sprint, naked price action and
   Solana trench survival. Discipline grades, streaks and a shareable Flex Card. All paper, all local. */
const Challenge = (() => {
  const CH = { g: null, chart: null, play: 0, LS: 'nt.chal', mode: 'daily', tf: '1h', busy: false, swan: 'covid' };
  const POOL = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'DOGE-USD', 'ADA-USD', 'AVAX-USD', 'LINK-USD'];
  const SHOW = 60, PLAY = 90, FEE = 0.001;
  CH.SHOW = SHOW; CH.PLAY = PLAY;

  /* ---- the modes: rules are checked on every candle (bpd = bars per trading day for the daily loss limit) ---- */
  const PROP = { target: 8, dailyDD: 4, maxDD: 8, bpd: 24 };
  const MODES = {
    daily: { l: '📅 Daily', name: 'Daily Replay Challenge', d: 'Same hidden slice for everyone today. Beat buy-and-hold.' },
    blind: { l: '🙈 Blind', name: 'Blind Replay Challenge', d: 'Prices rescaled to 100 and dates hidden. Beat buy-and-hold.' },
    random: { l: '🎲 Pick a market', name: 'Replay Challenge', d: 'Real history on the market and timeframe you choose.' },
    prop50: { l: '🏦 Prop $50K', name: 'Prop-Firm $50K Evaluation', cash0: 50000, tf: '1h', play: 240, rules: PROP, d: 'Reach +8% before you break a rule: 4% daily loss limit, 8% max trailing drawdown. 10 trading days of 1h candles.' },
    prop100: { l: '🏦 Prop $100K', name: 'Prop-Firm $100K Evaluation', cash0: 100000, tf: '1h', play: 240, rules: PROP, d: 'Same rules on a $100K account: +8% target, 4% daily loss limit, 8% max trailing drawdown.' },
    swan: { l: '🦢 Black Swan', name: 'Black Swan Survival', rules: { maxDD: 20 }, d: 'Trade through a historic crash without losing 20% from your peak. Survive and beat buy-and-hold (or end in profit) to win.' },
    scalp: { l: '⚡ 10-min Sprint', name: '10-Min Scalping Sprint', tf: '1m', play: 120, fee: 0.0005, timeMs: 600000, d: '1-minute candles, a new one every 5 seconds, 10 minutes on the clock. 0.05% fee.' },
    naked: { l: '🕯 Naked Price', name: 'Zero-Indicator Naked Price Action', naked: true, d: 'No EMAs, no volume, no indicators. Just candles. Beat buy-and-hold.' },
    trench: { l: '🪖 Solana Trench', name: 'Solana Trench Survival', tf: '5m', play: 150, fee: 0.01, slip: 0.01, rules: { maxDD: 50 }, d: 'A fresh memecoin launch (simulated): 1% fee + 1% slippage per side, rugs happen. Lose 50% from your peak and you are out.' },
  };
  CH.MODES = MODES;
  /* Black swans are modeled on each event's approximate real key closes; the candles in between are simulated noise. */
  const SWANS = {
    covid: { l: '2020 COVID crash (BTC, 1h)', sym: 'BTC-USD', tf: '1h', t0: 1583366400, step: 3600, vol: 0.006, show: 60,
      pts: [[0, 9000], [48, 9150], [60, 8900], [84, 8000], [120, 7900], [156, 7700], [180, 6000], [198, 4000], [210, 5500], [240, 5300], [260, 4900]] },
    ftx: { l: '2022 FTX collapse (BTC, 1h)', sym: 'BTC-USD', tf: '1h', t0: 1667433600, step: 3600, vol: 0.004, show: 60,
      pts: [[0, 20300], [48, 21300], [60, 21200], [96, 20600], [120, 19500], [132, 17800], [150, 17500], [162, 15800], [170, 15700], [186, 17600], [204, 16900], [230, 16800], [260, 16300]] },
    gfc: { l: '2008 financial crisis (SPY, 1d)', sym: 'SPY', tf: '1d', t0: 1217548800, step: 86400, vol: 0.016, show: 30,
      pts: [[0, 126], [20, 128], [30, 125], [32, 120], [35, 124], [41, 106], [43, 115], [50, 90], [52, 101], [63, 84], [69, 100], [81, 75], [88, 82], [95, 90], [120, 92], [150, 68], [175, 85]] },
  };
  CH.SWANS = SWANS;

  /* ---- seeded randomness (daily challenge = same for everyone on the same date) ---- */
  CH.seed = (str) => { let h = 2166136261 >>> 0; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
  CH.rng = (seed) => { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
  CH.today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  /* ---- discipline grade A+..F: edge, drawdown, rule breaches, over/under-trading and hit rate ---- */
  CH.grade = (r) => {
    let s = 70;
    s += Math.max(-20, Math.min(15, (+r.edge || 0) * 1.5));
    s -= Math.min(30, (+r.maxDD || 0) * 2);
    if (r.fail) s -= 30;
    if (r.passed) s += 15;
    if (!r.trades) s -= 10; else if (r.bars && r.trades > r.bars / 4) s -= 10; // churning every few candles
    if (r.winRate != null) s += (r.winRate - 50) / 5;
    s = Math.round(Math.max(0, Math.min(100, s)));
    return { score: s, g: s >= 95 ? 'A+' : s >= 88 ? 'A' : s >= 78 ? 'B' : s >= 68 ? 'C' : s >= 55 ? 'D' : 'F' };
  };

  /* ---- game engine (pure, unit-tested) ---- */
  class Game {
    constructor(candles, o = {}) {
      const show = o.show > 0 ? o.show : SHOW;
      if (!Array.isArray(candles) || candles.length < show + 20) throw new Error('Not enough history for a challenge.');
      this.c = candles; this.start = show; this.end = Math.min(candles.length, show + (o.play || PLAY)); this.i = show - 1;
      this.cash0 = o.cash0 > 0 ? o.cash0 : 10000; this.cash = this.cash0; this.qty = 0; this.trades = []; this.done = false; this.meta = o.meta || {};
      this.fee = o.fee != null ? o.fee : FEE; this.slip = o.slip || 0; this.rules = o.rules || null;
      this.peak = this.cash0; this.maxDD = 0; this.dayEq = this.cash0; this.day = 0; this.fail = null; this.passed = false;
    }
    get price() { return this.c[this.i].c; }
    get equity() { return this.cash + this.qty * this.price; }
    get left() { return this.end - 1 - this.i; }
    visible() { return this.c.slice(0, this.i + 1); }
    buy() { if (this.done || this.qty > 0) return false; const px = this.price * (1 + this.fee + this.slip); this.qty = this.cash / px; this.trades.push({ side: 'buy', i: this.i, t: this.c[this.i].t, price: px }); this.cash = 0; return true; }
    sell() { if (this.done || !(this.qty > 0)) return false; const px = this.price * (1 - this.fee - this.slip); this.cash = this.qty * px; this.qty = 0; this.trades.push({ side: 'sell', i: this.i, t: this.c[this.i].t, price: px }); return true; }
    step(n = 1) { for (let k = 0; k < n && !this.done; k++) { if (this.i >= this.end - 1) { this.finish(); break; } const before = this.equity; this.i++; this.mark(before); if (!this.done && this.i >= this.end - 1) this.finish(); } return this.i; }
    /* drawdown + rules on the new candle; a held position is marked at the candle's low (the worst it got) */
    mark(before) {
      const k = this.c[this.i], e = this.equity, worst = this.qty > 0 ? this.cash + this.qty * k.l : e;
      const R = this.rules, bpd = (R && R.bpd) || 24, d = Math.floor((this.i - this.start) / bpd);
      if (d !== this.day) { this.day = d; this.dayEq = before; }
      const dd = this.peak > 0 ? ((this.peak - worst) / this.peak) * 100 : 0; if (dd > this.maxDD) this.maxDD = dd;
      if (e > this.peak) this.peak = e;
      if (!R) return;
      const dayLoss = this.dayEq > 0 ? ((this.dayEq - worst) / this.dayEq) * 100 : 0;
      if (R.dailyDD && dayLoss >= R.dailyDD) this.fail = `Daily loss limit hit: −${dayLoss.toFixed(2)}% today (limit ${R.dailyDD}%)`;
      else if (R.maxDD && dd >= R.maxDD) this.fail = `Max drawdown hit: −${dd.toFixed(2)}% from your peak (limit ${R.maxDD}%)`;
      else if (R.target && (e / this.cash0 - 1) * 100 >= R.target) this.passed = true;
      if (this.fail || this.passed) this.finish();
    }
    finish() { if (this.done) return; if (this.qty > 0) this.sell(); this.done = true; }
    result() {
      const p0 = this.c[this.start - 1].c, p1 = this.c[Math.min(this.i, this.end - 1)].c, mine = (this.equity / this.cash0 - 1) * 100, bh = (p1 / p0 - 1) * 100;
      const edge = mine - bh, buys = this.trades.filter((x) => x.side === 'buy'), sells = this.trades.filter((t) => t.side === 'sell'), wins = sells.filter((t, k) => buys[k] && t.price > buys[k].price).length;
      const winRate = sells.length ? (wins / sells.length) * 100 : null, R = this.rules;
      // score: beat the market, with a bonus for doing it without big swings and a nudge for actually trading
      const score = Math.round(Math.max(0, Math.min(1000, 500 + edge * 25 + (sells.length ? 20 : -40) + (mine > 0 ? 40 : 0) + (this.passed ? 150 : 0) - (this.fail ? 200 : 0))));
      const beat = R && R.target ? this.passed : R ? !this.fail && (edge > 0 || mine > 0) : edge > 0;
      const gr = CH.grade({ edge, maxDD: this.maxDD, fail: !!this.fail, passed: this.passed, trades: sells.length, bars: this.end - this.start, winRate });
      return { mine, bh, edge, beat, score, trades: sells.length, wins, winRate, maxDD: this.maxDD, grade: gr.g, gradeScore: gr.score, fail: this.fail, passed: this.passed, stars: beat ? (edge > 10 ? 3 : edge > 3 ? 2 : 1) : 0 };
    }
  }
  CH.Game = Game;
  // blind mode: rescale to 100 and replace real timestamps so the chart gives nothing away
  CH.blind = (c) => { const k = 100 / c[0].c, step = c.length > 1 ? c[1].t - c[0].t : 3600, base = 978307200; return c.map((x, i) => ({ t: base + i * step, o: x.o * k, h: x.h * k, l: x.l * k, c: x.c * k, v: x.v })); };
  CH.pick = (candles, rnd, need0) => { const need = need0 || SHOW + PLAY, max = candles.length - need - 30; if (max < 1) return candles.slice(-need); const s = Math.floor(rnd() * max); return candles.slice(s, s + need); };
  /* modeled path: a log-space bridge through key closes [[bar, price], ...] with seeded noise (deterministic per seed) */
  CH.path = (pts, rnd, vol, t0, step) => {
    const out = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const [i0, p0] = pts[k], [i1, p1] = pts[k + 1], n = i1 - i0; let x = Math.log(p0); const end = Math.log(p1);
      for (let j = 0; j < n; j++) {
        const left = n - j, xn = left === 1 ? end : x + (end - x) / left + (rnd() + rnd() + rnd() - 1.5) * vol;
        const o = Math.exp(x), c = Math.exp(xn), w = rnd() * vol * 0.8;
        out.push({ t: t0 + out.length * step, o, c, h: Math.max(o, c) * (1 + w), l: Math.min(o, c) * (1 - w * (0.6 + rnd())), v: Math.round((800 + rnd() * 900) * (1 + Math.abs(xn - x) / vol)) });
        x = xn;
      }
    }
    return out;
  };
  CH.swanCandles = (id, rnd) => { const s = SWANS[id] || SWANS.covid; return CH.path(s.pts, rnd, s.vol, s.t0, s.step); };
  /* a simulated Solana memecoin: launch pump, a dump, a second leg, and a seeded chance of a rug pull */
  const MEME = ['WIFHAT', 'BONKER', 'GIGACAT', 'MOODENG2', 'PNUTZ', 'SLERFY', 'POPCATX', 'CHILLGUY', 'TRENCHY', 'RUGSAFE'];
  CH.trench = (rnd) => {
    let p = 0.00001 * (1 + rnd()); const pts = [[0, p]], at = (i, k) => { p *= k; pts.push([i, p]); };
    at(25, 3 + rnd() * 5); at(45, 0.4 + rnd() * 0.3); at(60, 1.2 + rnd() * 0.8); at(90, 0.7 + rnd() * 1.6);
    const rug = rnd() < 0.45, rugAt = 120 + Math.floor(rnd() * 80);
    if (rug) { at(rugAt - 2, 1 + rnd()); at(rugAt, 0.05); at(210, 0.8); } else { at(150, 0.6 + rnd() * 2); at(210, 0.5 + rnd() * 2.5); }
    const c = CH.path(pts, rnd, 0.05, 1700000000, 300); c.rug = rug; c.name = MEME[Math.floor(rnd() * MEME.length)];
    return c;
  };
  /* offline fallback: a seeded random walk shaped like the requested market, clearly labelled simulated */
  CH.synth = (rnd, n, p0, vol, step) => { const pts = [[0, p0]]; let p = p0; for (let i = 30; i < n; i += 30) { p *= Math.exp((rnd() - 0.5) * vol * 12); pts.push([i, p]); } pts.push([n, p * Math.exp((rnd() - 0.5) * vol * 6)]); return CH.path(pts, rnd, vol, 1700000000, step); };

  /* ---- stats ---- */
  CH.stats = () => { let s; try { s = JSON.parse(localStorage.getItem(CH.LS) || '{}'); } catch (e) { s = {}; } return { played: +s.played || 0, beat: +s.beat || 0, streak: +s.streak || 0, best: +s.best || 0, bestScore: +s.bestScore || 0, daily: typeof s.daily === 'object' && s.daily ? s.daily : {}, hist: Array.isArray(s.hist) ? s.hist.slice(0, 30) : [] }; };
  CH.record = (r, meta) => {
    const s = CH.stats(), repeat = !!meta.daily && s.daily[meta.daily] != null; s.played++;
    if (!repeat) { if (r.beat) { s.beat++; s.streak++; } else s.streak = 0; } // a replayed daily (same slice, known future) never moves the streak
    s.best = Math.max(s.best, s.streak); s.bestScore = Math.max(s.bestScore, r.score);
    if (meta.daily && !repeat) s.daily[meta.daily] = r.score;
    const keys = Object.keys(s.daily).sort().slice(-60); s.daily = Object.fromEntries(keys.map((k) => [k, s.daily[k]]));
    s.hist.unshift({ ts: Date.now(), sym: meta.blind ? 'hidden' : meta.sym, tf: meta.tf, score: r.score, edge: +(+r.edge || 0).toFixed(2), daily: !!meta.daily, mode: MODES[meta.mode] ? meta.mode : 'random', grade: /^(A\+|[ABCDF])$/.test(r.grade || '') ? r.grade : null, dd: r.maxDD != null ? +(+r.maxDD).toFixed(1) : null }); s.hist = s.hist.slice(0, 30);
    try { localStorage.setItem(CH.LS, JSON.stringify(s)); } catch (e) { /* storage blocked */ }
    return s;
  };

  /* ---- data for a new round ---- */
  CH.load = async (mode, rnd) => {
    const M = MODES[mode] || MODES.random, day = CH.today();
    if (mode === 'swan') { const s = SWANS[CH.swan] || SWANS.covid; return { c: CH.swanCandles(CH.swan, rnd), o: { show: s.show, play: s.pts[s.pts.length - 1][0] - s.show }, meta: { sym: s.sym, tf: s.tf, event: SWANS[CH.swan] ? CH.swan : 'covid', modeled: true } }; }
    if (mode === 'trench') { const c = CH.trench(rnd); return { c, o: {}, meta: { sym: '$' + c.name, tf: '5m', sim: true, rug: c.rug } }; }
    if (mode === 'daily' || mode === 'blind' || mode === 'random') {
      const daily = mode === 'daily', sym = daily ? POOL[Math.floor(rnd() * POOL.length)] : CH.sym || POOL[Math.floor(rnd() * POOL.length)], tf = daily ? '1h' : CH.tf;
      let slice = CH.pick(await History.get(sym, NT.TF[tf], 3000), rnd); if (daily || mode === 'blind') slice = CH.blind(slice);
      return { c: slice, o: {}, meta: { sym, tf, blind: daily || mode === 'blind', daily: daily ? day : null } };
    }
    // prop / scalp / naked: real history when the feed has it, a labelled simulation when it doesn't (offline)
    const tf = M.tf || CH.tf, play = M.play || PLAY, sym = CH.sym || POOL[Math.floor(rnd() * POOL.length)];
    let c = null, sim = false;
    try { const h = await History.get(sym, NT.TF[tf], 3000); if (h && h.length >= SHOW + play + 5) c = CH.pick(h, rnd, SHOW + play); } catch (e) { /* offline */ }
    if (!c) { c = CH.synth(rnd, SHOW + play + 2, 100, tf === '1m' ? 0.0015 : 0.008, NT.TF[tf] || 3600); sim = true; }
    return { c, o: { play }, meta: { sym, tf, sim } };
  };

  /* ---- UI ---- */
  CH.newGame = async () => {
    if (CH.busy) return; CH.busy = true; clearInterval(CH.play); CH.play = 0;
    const host = $('#chStage'); if (host) host.innerHTML = '<div class="empty shimmer">Picking a slice of history…</div>';
    try {
      const mode = MODES[CH.mode] ? CH.mode : 'random', M = MODES[mode], day = CH.today();
      const rnd = CH.rng(mode === 'daily' ? CH.seed('exterm-daily-' + day) : (Math.random() * 4294967296) >>> 0);
      const d = await CH.load(mode, rnd);
      CH.g = new Game(d.c, Object.assign({ cash0: M.cash0, fee: M.fee, slip: M.slip, rules: M.rules }, d.o, { meta: Object.assign({ mode, naked: !!M.naked }, d.meta) }));
      if (M.timeMs) CH.g.deadline = Date.now() + M.timeMs;
      if (mode === 'daily' && CH.stats().daily[day] != null) toast("You've already played today's challenge. This round won't change your daily score.", 'acc', 6000);
    } catch (e) { CH.g = null; if ($('#chStage')) $('#chStage').innerHTML = `<div class="empty dn">${esc(e.message)}</div>`; }
    CH.busy = false; CH.render();
    if (CH.g && CH.g.deadline) CH.auto(5000);
  };
  CH.auto = (ms) => {
    clearInterval(CH.play);
    CH.play = setInterval(() => { if (!CH.g || CH.g.done || curTab !== 'challenge') { clearInterval(CH.play); CH.play = 0; return; } CH.g.step(1); CH.draw(); }, ms);
    const b = $('#chAuto'); if (b) b.textContent = '⏸ Pause';
  };
  const markers = (g) => g.trades.map((t) => ({ t: t.t, side: t.side, price: t.price, label: t.side === 'buy' ? 'B' : 'S' }));
  CH.draw = () => {
    const g = CH.g; if (!g || !CH.chart) return;
    if (g.deadline && !g.done && Date.now() >= g.deadline) g.finish();
    CH.chart.set(g.visible(), NT.TF[g.meta.tf] || 3600, markers(g), null, '');
    const r = g.result(), live = (g.equity / g.cash0 - 1) * 100, bhNow = (g.price / g.c[g.start - 1].c - 1) * 100;
    const set = (id, v, c) => { const el = $(id); if (el) { el.textContent = v; if (c != null) el.className = 'num ' + c; } };
    set('#chYou', NT.fmtPct(live, 2), cls(live)); set('#chBh', NT.fmtPct(bhNow, 2), cls(bhNow));
    set('#chLeft', g.deadline && !g.done ? Math.max(0, Math.ceil((g.deadline - Date.now()) / 1000)) + 's · ' + Math.max(0, g.left) + ' bars' : String(Math.max(0, g.left)));
    set('#chDD', '−' + g.maxDD.toFixed(2) + '%', g.maxDD > 0 ? 'dn' : '');
    const pos = $('#chPos'); if (pos) pos.textContent = g.qty > 0 ? 'In the market' : 'In cash';
    const b = $('#chBuy'), s = $('#chSell'); if (b) b.disabled = g.done || g.qty > 0; if (s) s.disabled = g.done || !(g.qty > 0);
    const prog = $('#chProg'); if (prog) prog.style.width = ((g.i - g.start + 1) / (g.end - g.start) * 100).toFixed(1) + '%';
    if (g.done) CH.finishUI(r);
  };
  CH.finishUI = (r) => {
    clearInterval(CH.play); CH.play = 0;
    if (CH.g.recorded) return; CH.g.recorded = true;
    const s = CH.record(r, CH.g.meta), m = CH.g.meta, M = MODES[m.mode] || MODES.random;
    const head = r.passed ? 'Evaluation passed!' : r.fail ? 'Rule broken: account closed' : r.beat ? (CH.g.rules ? 'You survived!' : 'You beat the market!') : 'The market won this one';
    $('#chEnd').innerHTML = `<div class="ch-result ${r.beat ? 'win' : 'lose'}"><div class="ch-stars">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</div><h2>${esc(head)}</h2>
      ${r.fail ? `<div class="note dn">${esc(r.fail)}</div>` : ''}
      <div class="ch-nums"><div><span>You</span><b class="${cls(r.mine)}">${NT.fmtPct(r.mine, 2)}</b></div><div><span>Buy &amp; hold</span><b class="${cls(r.bh)}">${NT.fmtPct(r.bh, 2)}</b></div><div><span>Grade</span><b class="ch-grade g-${esc(r.grade.replace('+', 'p'))}">${esc(r.grade)}</b></div><div><span>Max DD</span><b class="dn">−${r.maxDD.toFixed(1)}%</b></div><div><span>Win rate</span><b>${r.winRate == null ? '–' : Math.round(r.winRate) + '%'}</b></div><div><span>Score</span><b>${r.score}</b></div><div><span>Streak</span><b>${s.streak}</b></div></div>
      <div class="note">${esc(M.name)}. ${m.blind ? `It was <b>${esc(baseOf(m.sym))}</b> on the ${esc(m.tf)} chart.` : ''} ${m.modeled ? esc(SWANS[m.event].l) + ': modeled on the real key closes, candles in between simulated.' : ''} ${m.sim ? (m.rug != null ? (m.rug ? 'This one was a rug pull.' : 'No rug this time.') + ' Simulated memecoin.' : 'Simulated prices (history was unreachable).') : ''} ${r.trades} round trip${r.trades === 1 ? '' : 's'}.</div>
      <div class="row" style="gap:8px;justify-content:center;margin-top:10px"><button type="button" class="btn pri" id="chAgain">Play again</button><button type="button" class="btn" id="chShare">📸 Flex Card</button></div></div>`;
    $('#chEnd').hidden = false;
    $('#chAgain').onclick = () => { if (CH.mode === 'daily') CH.mode = 'blind'; CH.newGame(); };
    $('#chShare').onclick = () => { const u = CH.card(r, s, m); if (u) { const a = document.createElement('a'); a.href = u; a.download = 'exterm-flex-card.png'; document.body.appendChild(a); a.click(); a.remove(); } };
  };
  CH.card = (r, s, m) => {
    try {
      const M = MODES[m.mode] || MODES.random, c = document.createElement('canvas'); c.width = 1080; c.height = 1080; const g = c.getContext('2d');
      const bg = g.createLinearGradient(0, 0, 1080, 1080); bg.addColorStop(0, '#0b0f1e'); bg.addColorStop(1, '#1a1033'); g.fillStyle = bg; g.fillRect(0, 0, 1080, 1080);
      g.textAlign = 'center'; g.fillStyle = '#F5C84B'; g.font = '700 40px Inter, system-ui, sans-serif'; g.fillText('EXTERM CHALLENGE FLEX CARD', 540, 110);
      g.fillStyle = '#e6eaf3'; g.font = '600 36px Inter, system-ui, sans-serif'; g.fillText(M.name.slice(0, 44), 540, 165);
      const gc = { 'A+': '#22c55e', A: '#22c55e', B: '#84cc16', C: '#fbbf24', D: '#fb923c', F: '#EF4444' }[r.grade] || '#e6eaf3';
      g.fillStyle = gc; g.font = '900 200px Inter, system-ui, sans-serif'; g.fillText(r.grade || '–', 540, 380);
      g.fillStyle = '#ffffff'; g.font = '800 64px Inter, system-ui, sans-serif'; g.fillText(r.passed ? 'Evaluation passed' : r.fail ? 'Rule broken' : r.beat ? (m.mode === 'swan' || m.mode === 'trench' ? 'Survived' : 'Beat the market') : 'Market won', 540, 480);
      const box = (x, y, label, val, col) => { g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x - 230, y, 460, 170); g.fillStyle = '#9aa3b8'; g.font = '600 32px Inter, system-ui'; g.fillText(label, x, y + 52); g.fillStyle = col; g.font = '800 72px Inter, system-ui'; g.fillText(val, x, y + 135); };
      box(300, 540, 'Me', NT.fmtPct(r.mine, 1), r.mine >= 0 ? '#22c55e' : '#EF4444'); box(780, 540, 'Buy & hold', NT.fmtPct(r.bh, 1), r.bh >= 0 ? '#22c55e' : '#EF4444');
      box(300, 730, 'Max drawdown', '−' + (+r.maxDD || 0).toFixed(1) + '%', '#EF4444'); box(780, 730, 'Win rate', r.winRate == null ? '–' : Math.round(r.winRate) + '%', '#e6eaf3');
      g.fillStyle = '#9aa3b8'; g.font = '500 32px Inter, system-ui'; g.fillText(`Score ${r.score}  ·  Streak ${s.streak}  ·  ` + (m.daily ? 'Daily ' + m.daily : m.blind ? 'Blind' : String(baseOf(m.sym) + ' ' + m.tf).slice(0, 24)) + '  ·  paper', 540, 960);
      g.fillStyle = '#D4AF37'; g.font = '700 38px Inter, system-ui'; g.fillText('@exterm.labs', 540, 1030); if (typeof V151 !== 'undefined') V151.drawMark(g, 40, 40, 90);
      return c.toDataURL('image/png');
    } catch (e) { return null; }
  };
  CH.render = () => {
    const host = $('#chHost'); if (!host) return;
    const s = CH.stats(), g = CH.g, m = g ? g.meta : {}, played = s.daily[CH.today()], M = MODES[CH.mode] || MODES.random, pickMkt = /^(random|prop50|prop100|naked)$/.test(CH.mode);
    host.innerHTML = `<div class="ch-top"><div class="seg ch-modes" id="chMode"></div><span class="sp"></span>
      <div class="ch-badges"><span title="Challenges played">🎮 ${s.played}</span><span title="Wins">🏆 ${s.beat}</span><span title="Current streak">🔥 ${s.streak}</span><span title="Best streak">⭐ ${s.best}</span>${played != null ? `<span title="Today's daily score">📅 ${+played || 0}</span>` : ''}</div></div>
      <div class="ch-top ch-sub"><span class="note ch-desc" id="chDesc">${esc(M.d)}</span><span class="sp"></span>
      ${pickMkt ? `<select class="in" id="chSym" aria-label="Market"><option value="">Random market</option>${POOL.map((p) => `<option value="${p}" ${CH.sym === p ? 'selected' : ''}>${esc(baseOf(p))}</option>`).join('')}</select>` : ''}${CH.mode === 'random' || CH.mode === 'naked' ? `<select class="in" id="chTf" aria-label="Timeframe">${['15m', '1h', '4h', '1d'].map((t) => `<option ${t === CH.tf ? 'selected' : ''}>${t}</option>`).join('')}</select>` : ''}
      ${CH.mode === 'swan' ? `<select class="in" id="chSwan" aria-label="Event">${Object.entries(SWANS).map(([k, v]) => `<option value="${k}" ${CH.swan === k ? 'selected' : ''}>${esc(v.l)}</option>`).join('')}</select>` : ''}
      <button type="button" class="btn pri" id="chNew" ${CH.busy ? 'disabled' : ''}>${g ? 'New challenge' : 'Start'}</button></div>
      <div class="ch-wrap"><div class="ch-stage panel" id="chStage">${g ? `<div class="ch-head"><b>${m.blind ? '🙈 Mystery market' : esc(baseOf(m.sym)) + ' · ' + esc(m.tf)}</b><span class="note">${esc((MODES[m.mode] || MODES.random).name)}${m.daily ? ' ' + esc(m.daily) : ''}${m.modeled ? ' · ' + esc(SWANS[m.event].l) : ''}${m.sim ? ' · simulated' : ''}</span><span class="sp"></span><span class="note" id="chPos"></span></div>
        <div class="ch-prog"><i id="chProg"></i></div><div class="ch-chart" id="chChart"></div>` : '<div class="empty">Pick a challenge above. Replay modes hide the future of real history; Prop-Firm, Black Swan, Sprint, Naked and Trench modes add rules. Every round gets a discipline grade from A+ to F.</div>'}
        <div id="chEnd" hidden></div></div>
      <div class="ch-side panel"><div class="pb"><div class="ch-kpi"><span>You</span><b id="chYou" class="num">–</b></div><div class="ch-kpi"><span>Buy &amp; hold</span><b id="chBh" class="num">–</b></div><div class="ch-kpi"><span>Max drawdown</span><b id="chDD" class="num">–</b></div><div class="ch-kpi"><span>${M.timeMs ? 'Time left' : 'Bars left'}</span><b id="chLeft" class="num">–</b></div>
        ${g && g.rules ? `<div class="note ch-rules">${g.rules.target ? `Target +${g.rules.target}% · ` : ''}${g.rules.dailyDD ? `daily loss ≤ ${g.rules.dailyDD}% · ` : ''}max drawdown ≤ ${g.rules.maxDD}%${g.cash0 !== 10000 ? ` · $${NT.fmtCompact(g.cash0)} account` : ''}</div>` : ''}
        <div class="ch-ctl"><button type="button" class="btn up big" id="chBuy" ${g ? '' : 'disabled'}>Buy</button><button type="button" class="btn dn big" id="chSell" ${g ? '' : 'disabled'}>Sell</button></div>
        <div class="ch-ctl ch-ctl3"><button type="button" class="btn" id="chStep" ${g ? '' : 'disabled'} title="Next candle (→)">▶ Next</button><button type="button" class="btn" id="chStep5" ${g ? '' : 'disabled'} title="Five candles">⏩ +5</button><button type="button" class="btn" id="chAuto" ${g ? '' : 'disabled'}>${CH.play ? '⏸ Pause' : '⏵ Auto'}</button></div>
        <div class="note">Keys: <span class="kbd">B</span> buy · <span class="kbd">S</span> sell · <span class="kbd">→</span> next. All-in or all-out${g ? `, ${(g.fee * 100).toFixed(2).replace(/0$/, '')}% fee${g.slip ? ` + ${(g.slip * 100).toFixed(0)}% slippage` : ''} per trade` : ''}.</div>
        ${s.hist.length ? `<div class="ch-hist"><b>Recent</b>${s.hist.slice(0, 6).map((h) => `<div><span>${h.daily ? '📅' : h.sym === 'hidden' ? '🙈' : esc(String(baseOf(h.sym || '?')).slice(0, 10))}</span><span class="num ${cls(+h.edge || 0)}">${NT.fmtPct(+h.edge || 0, 1)} vs B&amp;H</span>${h.grade ? `<b class="ch-grade g-${esc(String(h.grade).replace('+', 'p'))}">${esc(h.grade)}</b>` : ''}<b class="num">${+h.score || 0}</b></div>`).join('')}</div>` : ''}</div></div></div>`;
    segBtns($('#chMode'), Object.entries(MODES).map(([v, x]) => ({ v, l: x.l, t: x.name })), CH.mode, (v) => { CH.mode = v; CH.render(); });
    const sy = $('#chSym'), tf = $('#chTf'), sw = $('#chSwan');
    if (sy) sy.onchange = (e) => { CH.sym = e.target.value; }; if (tf) tf.onchange = (e) => { CH.tf = e.target.value; }; if (sw) sw.onchange = (e) => { CH.swan = SWANS[e.target.value] ? e.target.value : 'covid'; };
    $('#chNew').onclick = CH.newGame;
    if (g) {
      CH.chart = new CandleChart($('#chChart'));
      CH.chart.o = Object.assign({}, CH.chart.o, m.naked ? { ema: false, sma: false, bb: false, vol: false, rsi: false, macd: false, trades: true, fc: false } : { ema: true, vol: true, trades: true, fc: false });
      $('#chBuy').onclick = () => { g.buy(); CH.draw(); }; $('#chSell').onclick = () => { g.sell(); CH.draw(); };
      $('#chStep').onclick = () => { g.step(1); CH.draw(); }; $('#chStep5').onclick = () => { g.step(5); CH.draw(); };
      $('#chAuto').onclick = (e) => { if (CH.play) { clearInterval(CH.play); CH.play = 0; e.target.textContent = '⏵ Auto'; } else CH.auto(g.deadline ? 5000 : 700); };
      CH.draw();
    }
  };
  if (typeof document !== 'undefined') document.addEventListener('keydown', (e) => {
    if (typeof curTab === 'undefined' || curTab !== 'challenge' || !CH.g || CH.g.done || /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) return;
    if (e.key === 'b' || e.key === 'B') { CH.g.buy(); CH.draw(); } else if (e.key === 's' || e.key === 'S') { CH.g.sell(); CH.draw(); } else if (e.key === 'ArrowRight') { e.preventDefault(); CH.g.step(1); CH.draw(); }
  });
  return CH;
})();
if (typeof TABS !== 'undefined') TABS.challenge = { show: () => Challenge.render(), render: () => {} };
if (typeof module === 'object' && module.exports) module.exports = Challenge;
