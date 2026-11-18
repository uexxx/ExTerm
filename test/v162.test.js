// ExTerm v16.2 core unit tests: sub-minute seeding (stocks + micro-cap tokens), minimum price span, daily-loss breach,
// US session clock, live-only selector map; static CSP / build / privacy checks.
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 240)));
const fs = require('fs'), path = require('path');
const V = require('../src/v162core.js');
const root = path.join(__dirname, '..'), src = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8');

// 1m history ending one minute before now: a gentle random walk around p0
const m1 = (p0, mins, now, vol) => { const out = []; let p = p0; const t0 = Math.floor(now / 60) * 60 - mins * 60; for (let i = 0; i < mins; i++) { const o = p; p = p * (1 + (Math.sin(i * 1.7) * vol)); const c = p; out.push({ t: t0 + i * 60, o, h: Math.max(o, c) * (1 + vol / 2), l: Math.min(o, c) * (1 - vol / 2), c, v: 100 }); } return out; };
const now = 1_800_000_000;
const gapless = (r) => r.every((b, i) => !i || b.o === r[i - 1].c);
const sane = (r) => r.every((b) => b.h >= Math.max(b.o, b.c) && b.l <= Math.min(b.o, b.c) && b.l > 0);
const spanPct = (r) => { const hi = Math.max(...r.map((b) => b.h)), lo = Math.min(...r.map((b) => b.l)); return ((hi - lo) / ((hi + lo) / 2)) * 100; };

for (const [name, p0, spot] of [['stock $284.64 (ITW)', 283.9, 284.64], ['micro-cap 0.000001088', 0.00000107, 0.000001088]]) {
  for (const tf of [1, 5, 10, 15]) {
    const n = 300, r = V.seedSub(m1(p0, 120, now, 0.0012), tf, n, spot, now, [], false);
    ok(`${name} ${tf}s: full window of ${n} bars`, r.length === n, r.length);
    ok(`${name} ${tf}s: ends on the current bucket at spot exactly`, r[n - 1].t === Math.floor(now / tf) * tf && r[n - 1].c === spot, r[n - 1].c);
    ok(`${name} ${tf}s: true-form gapless (open = prior close) + consistent high / low`, gapless(r) && sane(r));
    ok(`${name} ${tf}s: not flat (span ≥ 0.05 %, ≥ 70 % of bars have a body or wick)`, spanPct(r) >= 0.05 && r.filter((b) => b.h > b.l).length >= n * 0.7, spanPct(r));
  }
}
const real = [{ t: Math.floor(now / 5) * 5 - 10, o: 1, h: 290, l: 280, c: 285, v: 3 }];
const rr = V.seedSub(m1(283.9, 60, now, 0.001), 5, 120, 284.64, now, real, false);
ok('real tick bars replace seeded bars at the same time', rr.some((b) => b.real && b.h === 290 && b.l === 280) && gapless(rr));
const c1 = V.seedSub(m1(100, 60, now, 0.001), 1, 200, 100, now, [], false), c2 = V.seedSub(m1(100, 60, now, 0.001), 1, 200, 100, now, [], false);
ok('seeding is deterministic (a refresh redraws the same bars)', JSON.stringify(c1) === JSON.stringify(c2));
const closedH = m1(284, 60, now - 7200, 0.001), cl = V.seedSub(closedH, 15, 100, 284.64, now, [], true);
ok('market closed: the window ends at the last session bar, not now', cl[cl.length - 1].t === closedH[closedH.length - 1].t + 45 && cl[cl.length - 1].c === 284.64);
ok('no 1m history: seeds a textured window from spot alone', (() => { const r = V.seedSub([], 1, 120, 50, now, [], false); return r.length === 120 && gapless(r) && r[119].c === 50 && r.some((b) => b.h > b.l); })());
ok('bad input is safe (spot 0 → real rows only)', V.seedSub(m1(1, 10, now, 0.001), 1, 50, 0, now, [], false).length === 0);

// 2. min span
const s = V.minSpan(100, 100.01, 0.002);
ok('min span: a 0.01 % range widens to 0.20 % of mid, centred', Math.abs((s.hi - s.lo) - 100.005 * 0.002) < 1e-9 && Math.abs((s.hi + s.lo) / 2 - 100.005) < 1e-9);
ok('min span: wide ranges are untouched', JSON.stringify(V.minSpan(90, 110, 0.002)) === JSON.stringify({ lo: 90, hi: 110 }));
ok('min span: micro-cap prices keep 8+ decimals', (() => { const m = V.minSpan(0.000001088, 0.000001088, 0.002); return m.hi > m.lo && Math.abs((m.hi - m.lo) / 0.000001088 - 0.002) < 1e-9; })());

// 3. daily-loss breaker
ok('breach: at the cap trips, beyond trips, below does not', V.breached(500, 500) && V.breached(501, 500) && !V.breached(499.99, 500));
ok('breach: cap 0 / blank / NaN loss never trips', !V.breached(1e9, 0) && !V.breached(1e9, '') && !V.breached(NaN, 500));
const g = V.lossGauge(125, 500);
ok('gauge: used / left / percent', g.used === 125 && g.left === 375 && g.pct === 25 && V.lossGauge(900, 500).pct === 100 && V.lossGauge(10, 0).left === null);

// 4. US session clock (2026-11-17 is a Tuesday; New York is UTC−5 in November)
ok('session: Tue 10:00 ET open, 09:29 ET closed, 16:00 ET closed', V.usOpen(Date.UTC(2026, 10, 17, 15, 0)) && !V.usOpen(Date.UTC(2026, 10, 17, 14, 29)) && !V.usOpen(Date.UTC(2026, 10, 17, 21, 0)));
ok('session: Saturday closed', !V.usOpen(Date.UTC(2026, 10, 21, 15, 0)));

// 5. content + live-only map
ok('briefing: 5-point checklist + v16.2 highlights', V.CHECKLIST.length === 5 && V.HIGHLIGHTS.length >= 4 && V.CHECKLIST.some((x) => /127\.0\.0\.1/.test(x)) && V.CHECKLIST.some((x) => /CANCEL_ALL_AND_FLATTEN/.test(x)));
ok('live-only: replay, paper resets, offline research and drills are listed', ['#replayBtn', '[data-v161m="replay"]', '#pfReset', '#v157Mtn', '[data-lx="drill"]', '[data-lb="backtest"]'].every((x) => V.PAPER_ONLY.includes(x)));
const css = src('style.css');
ok('live-only: every listed selector has a body.live-bot-armed hide rule', V.PAPER_ONLY.every((x) => css.includes('body.live-bot-armed ' + x)), V.PAPER_ONLY.filter((x) => !css.includes('body.live-bot-armed ' + x)));

// 6. static
const ui = src('v162.js'), core = src('v162core.js'), B = fs.readFileSync(path.join(root, 'build.py'), 'utf8');
ok('build: v162core.js after v161core.js, v162.js after v161.js, both before boot.js', /"v161core\.js", "v162core\.js", (?:"v163core\.js", )?(?:"v164core\.js", )?(?:"v165core\.js", )?(?:"v166core\.js", )?"v160\.js", "v161\.js", "v162\.js", (?:"v163\.js", )?(?:"v164\.js", )?(?:"v165\.js", )?(?:"v166\.js", )?"boot\.js"/.test(B));
ok('timeframes: 1s–1M on every market (TF list + NT.TF)', /'1w', '1M'\]/.test(src('app_a.js')) && /'1w': 604800, '1M': 2592000/.test(src('core.js')) && /const tfList = \(\) => TF_ALL/.test(src('app_a.js')));
ok('timeframes: quick pills 1s 5s 10s 15s 1m 5m 15m 1h 4h 1d 1w', ['1s', '5s', '10s', '15s', '1m', '5m', '15m', '1h', '4h', '1d', '1w'].every((t) => css.includes(`:not([data-v="${t}"])`)));
ok('data: stocks + on-chain sub-minute go through seedHist', /return TFX\.seedHist\(sym, tf, n, await TFX\.stockSub/.test(src('data.js')) && /return TFX\.seedHist\(sym, tf, n, tr\)/.test(src('data.js')));
ok('chart: sub-minute y-axis uses V162.minSpan 0.20 %', /V162\.minSpan\(lo, hi, 0\.002\)/.test(src('charts.js')));
ok('breaker: kill path broadcasts CANCEL_ALL_AND_FLATTEN and logs the breach', /b\.kill\(/.test(ui) && /led\('breaker'/.test(ui) && /CANCEL_ALL_AND_FLATTEN/.test(src('v160.js')));
ok('CSP: no inline handlers and no eval in v16.2', !/\son[a-z]+=["']/i.test(ui + core) && !/\beval\(|new Function/.test(ui + core));
ok('XSS: dynamic text in v16.2 templates goes through esc()', !/\$\{(?!esc\(|V162\.|live \?|G\.|x\b|dl\.toFixed\(2\)\}|cap\})[a-z]/i.test(ui.replace(/\$\{live \? [^}]*\}/g, '')));
ok('privacy: no personal paths or emails in v16.2 sources', !new RegExp(['[A-Z]:\\\\Users\\\\', '\\/Users\\/', '@gm' + 'ail', 'ro' + 'blo'].join('|'), 'i').test(ui + core + src('v162core.js')));

const fails = res.filter((r) => r.startsWith('FAIL'));
console.log(res.join('\n')); console.log(`${res.length - fails.length}/${res.length} passed`); process.exit(fails.length ? 1 : 0);
