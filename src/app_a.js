/* ExTerm app — part A: state, helpers, shell, Markets tab */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Security: only absolute http(s) URLs may become links/images (blocks javascript:, data:, vbscript: and attribute breakout). Returns an HTML-escaped string. */
const safeUrl = (u, fallback = '#', httpsOnly = false) => { try { const x = new URL(String(u || '')); return (x.protocol === 'https:' || (!httpsOnly && x.protocol === 'http:')) ? esc(x.href) : esc(fallback); } catch (e) { return esc(fallback); } };
const cleanTxt = (s, n = 48) => (s == null ? s : String(s).replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, n)); // strips control & bidi-override chars used for spoofing
const cls = (v) => (v > 0 ? 'up' : v < 0 ? 'dn' : '');
const tzOpt = (o) => (typeof TZ !== 'undefined' && TZ.zone ? Object.assign({ timeZone: TZ.zone }, o) : o); // v13: chosen time zone
const fmtClock = (ms) => new Date(ms).toLocaleTimeString([], tzOpt({ hour: '2-digit', minute: '2-digit', second: '2-digit' }));
const fmtStamp = (ms) => new Date(ms).toLocaleString([], tzOpt({ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }));
const baseOf = (sym) => (/^oc:/.test(sym) && typeof OC !== 'undefined' ? OC.label(sym) : String(sym).replace(/-USD$/, ''));
const TABS = {};
let curTab = 'markets';

/* ───────────── state ───────────── */
const LS_KEY = 'novaterm.v1';
const DEFSTATE = () => ({
  v: 1, _mk: 0,
  social: { xToken: '', q: '' }, draw: {}, pending: [], stops: [],
  settings: { source: 'auto', stockSource: 'auto', fee: 0.1, slip: 0.05, startCash: 100000, whaleBtc: 50, whaleEth: 250, whaleUsd: 1000000, solRpc: '', solSpeed: 'normal', secContact: '', rememberKeys: false, allowRelays: true },
  mode: 'crypto',
  mk: { crypto: { watch: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'DOGE-USD', 'ADA-USD', 'LINK-USD', 'AVAX-USD'], sel: 'BTC-USD', tf: '15m' }, stocks: { watch: ['SPY', 'QQQ', 'AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMZN', 'META', 'GOOGL', 'COIN'], sel: 'SPY', tf: '1h' }, onchain: { watch: [], sel: null, tf: '5m' } },
  solWallets: null, solTrades: [], secTickers: null, secLive: true, secTrades: [], copy: { on: false, cash: 1000, usd: 50, tp: 100, sl: 35, trail: 0, max: 5, who: 'alerts', minSol: 1, mirror: true, acct: null },
  watch: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'DOGE-USD', 'ADA-USD', 'LINK-USD', 'AVAX-USD'],
  sel: 'BTC-USD', tf: '15m',
  ind: { ema: true, sma: false, bb: false, vol: true, rsi: false, macd: false, trades: true, fc: false, type: 'candles', extra: [] }, theme: 'midnight',
  acct: null, bots: [], alerts: [], wallets: [], chat: [], totalEq: [], pfSeen: 0,
  ai: { preset: 'local', base: '', model: '', key: '', mode: 'auto' },
  grok: { preset: 'local', model: '', key: '', orKey: '', seen: [], inbox: [], wfs: [], notifyBots: true }, p4: {}, p5: {}, // v15 phases 4/5: validated by P4UI / P5UI on use hooks: { discord: '', tgToken: '', tgChat: '' },
  heat: { asset: 'crypto', period: '24h', size: 'mcap', top: 50, hide: true },
  setup: { strat: 'rsi', sym: 'BTC-USD', tf: '1h', capital: 10000, posPct: 100, sl: '', tp: '', trail: '', bars: 'r:365', params: {} },
});
let ST = DEFSTATE(), ACC = null, storageOK = true;
const SECRET_PATHS = [['ai', 'key'], ['ai', 'hfToken'], ['settings', 'stKey'], ['settings', 'heliusKey'], ['settings', 'solRpc'], ['settings', 'secContact'], ['social', 'xToken'], ['grok', 'key'], ['grok', 'orKey'], ['hooks', 'discord'], ['hooks', 'tgToken']];
function loadState() {
  const s = DEFSTATE();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      for (const k of Object.keys(s)) {
        if (o[k] === undefined) continue;
        s[k] = (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]) && o[k] && typeof o[k] === 'object') ? Object.assign(s[k], o[k]) : o[k];
      }
    }
  } catch (e) { storageOK = false; console.warn('state load failed', e); }
  for (const [a, b] of SECRET_PATHS) if (s[a] && s[a][b]) { legacyKeysMoved = true; s.settings.rememberKeys = false; } // keys from older versions were saved in plain text: keep them for this session, never write them back
  try { const sec = JSON.parse(sessionStorage.getItem(LS_KEY + '.secrets') || '{}'); for (const [a, b] of SECRET_PATHS) if (sec[a + '.' + b] && s[a] && !s[a][b]) s[a][b] = String(sec[a + '.' + b]); } catch (e) { }
  if (!s._mk) { s.mk.crypto = { watch: s.watch, sel: s.sel, tf: s.tf }; s._mk = 1; s.mode = 'crypto'; }
  if (s.mode === 'onchain' && (!s.mk.onchain || !s.mk.onchain.sel || !/^oc:/.test(s.mk.onchain.sel))) s.mode = 'crypto';
  const k = s.mk[s.mode] || s.mk.crypto; s.watch = k.watch; s.sel = k.sel; s.tf = k.tf;
  return s;
}
function hydrate() {
  ACC = ST.acct ? NT.Account.from(ST.acct) : new NT.Account({ cash: ST.settings.startCash, fee: ST.settings.fee / 100, slip: ST.settings.slip / 100 });
  ST.acct = ACC;
  ST.bots.forEach((b) => { b.account = NT.Account.from(b.account); b._rt = {}; });
  Whale.thr = { btc: ST.settings.whaleBtc, eth: ST.settings.whaleEth, usd: ST.settings.whaleUsd };
  Whale.watch = (ST.wallets || []).map((w) => Object.assign({ bal: null, recent: [], ts: 0 }, w));
  COPY = ST.copy.acct ? NT.Account.from(ST.copy.acct) : new NT.Account({ cash: ST.copy.cash, fee: 0.01, slip: 0.01 }); ST.copy.acct = COPY;
  if (ST.walletSet !== 'kol-2026-11') { ST.solWallets = null; ST.solTrades = []; ST.walletSet = 'kol-2026-11'; } // replace the old imported list with the curated top-trader set
  Sol.load(ST.solWallets || DEFAULT_WALLETS, true); Sol.restoreTrades(ST.solTrades);
  Sol.custom = (ST.settings.solRpc || '').trim(); Sol.speed = ST.settings.solSpeed || 'normal'; Sol.keys.st = ST.settings.stKey || ''; Sol.keys.helius = ST.settings.heliusKey || '';
  Object.assign(NT.NAMES, STOCK_NAMES);
  SEC.contact = ST.settings.secContact || ''; for (const t of ST.secTrades || []) if (!SEC.ids.has(t.id)) { SEC.ids.add(t.id); SEC.trades.push(t); }
}
let legacyKeysMoved = false;
function currentSecrets() { const o = {}; for (const [a, b] of SECRET_PATHS) if (ST[a] && ST[a][b]) o[a + '.' + b] = ST[a][b]; return o; }
function applySecrets(sec) {
  for (const [a, b] of SECRET_PATHS) if (sec[a + '.' + b] && ST[a]) ST[a][b] = String(sec[a + '.' + b]);
  Sol.custom = (ST.settings.solRpc || '').trim(); Sol.keys.st = ST.settings.stKey || ''; Sol.keys.helius = ST.settings.heliusKey || ''; SEC.contact = ST.settings.secContact || '';
}
function showVaultUnlock() {
  if ($('#vaultModal')) return;
  const m = document.createElement('div'); m.id = 'vaultModal'; m.className = 'vault-modal';
  m.innerHTML = `<div class="vault-box panel"><div class="vault-ic">${typeof V151 !== 'undefined' ? V151.markSvg(56, 'vault') : '🔐'}</div><h3 style="margin:0 0 4px">Unlock your saved API keys</h3><div class="note">Your keys are saved encrypted on this computer. Enter your passphrase to use them in this tab.</div>
    <input class="in mono" id="vaultPw" type="password" autocomplete="current-password" placeholder="Passphrase" style="margin-top:10px">
    <div class="note dn" id="vaultErr" style="min-height:16px;margin-top:4px"></div>
    <div class="row" style="gap:8px;justify-content:flex-end"><button class="btn sm" id="vaultSkip">Not now</button><button class="btn sm pri" id="vaultGo">Unlock</button></div></div>`;
  document.body.appendChild(m); setTimeout(() => $('#vaultPw').focus(), 50);
  let fails = 0, wait = 0;
  const go = async () => {
    if (Date.now() < wait) return; const b = $('#vaultGo'); b.disabled = true; b.textContent = 'Unlocking…';
    try { const sec = await KeyVault.unlock($('#vaultPw').value); applySecrets(sec); saveState(); m.remove(); toast('🔓 API keys unlocked for this tab', 'acc'); if (curTab === 'set') renderSettings(); }
    catch (e) { fails++; if (fails >= 5) { wait = Date.now() + 30000; fails = 0; } $('#vaultErr').textContent = e.message + (wait > Date.now() ? ' · too many tries, wait 30 seconds' : ''); m.querySelector('.vault-box').classList.remove('shake'); void m.offsetWidth; m.querySelector('.vault-box').classList.add('shake'); }
    b.disabled = false; b.textContent = 'Unlock';
  };
  $('#vaultGo').onclick = go; $('#vaultPw').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  $('#vaultSkip').onclick = () => { m.remove(); toast('Keys stay locked. Features that need them will ask again.', 'amb'); };
}
function saveState() {
  try {
    ST.wallets = Whale.watch.map((w) => ({ addr: w.addr, name: w.name, chain: w.chain }));
    ST.mk[ST.mode] = { watch: ST.watch, sel: ST.sel, tf: ST.tf };
    ST.solWallets = Sol.persist(); ST.solTrades = Sol.trades.filter((t) => !t.sim).slice(0, 400); ST.copy.acct = COPY; ST.secTrades = SEC.trades.filter((t) => !t.sim).slice(0, 400);
    ST.chat = ST.chat.slice(-60); ST.totalEq = ST.totalEq.slice(-3000);
    const json = JSON.stringify(ST, (k, v) => (k === '_rt' ? undefined : v));
    // API keys never reach localStorage in plain text: they go to sessionStorage (this browser session) and,
    // if the user chose it, into the passphrase-encrypted vault.
    const o = JSON.parse(json), sec = {}; for (const [a, b] of SECRET_PATHS) { if (o[a] && o[a][b]) { sec[a + '.' + b] = o[a][b]; o[a][b] = ''; } }
    try { sessionStorage.setItem(LS_KEY + '.secrets', JSON.stringify(sec)); } catch (e) { }
    if (ST.settings.rememberKeys && typeof KeyVault !== 'undefined') KeyVault.saveLater(sec);
    localStorage.setItem(LS_KEY, JSON.stringify(o));
  } catch (e) { if (storageOK) { storageOK = false; console.warn('save failed', e); } }
}
function applyCosts() {
  const fee = ST.settings.fee / 100, slip = ST.settings.slip / 100;
  for (const a of [ACC, ...ST.bots.map((b) => b.account)]) { a.fee = fee; a.slip = slip; }
}

/* ───────────── helpers ───────────── */
function toast(msg, kind = '', ms = 5000) {
  const box = $('#toasts'), d = document.createElement('div');
  d.className = 'toast ' + kind; d.innerHTML = msg; box.appendChild(d);
  while (box.children.length > 5) box.removeChild(box.firstChild);
  setTimeout(() => d.remove(), ms);
}
let audioCtx = null;
function beep() { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.connect(g); g.connect(audioCtx.destination); o.frequency.value = 880; g.gain.value = 0.05; o.start(); o.stop(audioCtx.currentTime + 0.15); } catch (e) { } }
function px(sym) {
  const l = Feed.live[sym]; if (l && l.price) return l.price;
  const ss = StoresBySym.get(sym); if (ss) for (const s of ss) if (s.candles.length) return s.candles[s.candles.length - 1].c;
  return null;
}
function priceMap() { const m = {}; for (const s in ACC.pos) m[s] = px(s); for (const b of ST.bots) for (const s in b.account.pos) m[s] = px(s); return m; }
function chg24(sym) { const l = Feed.live[sym]; return l && l.open24 && l.price ? (l.price / l.open24 - 1) * 100 : null; }
function resolveSym(text, mode) {
  mode = mode || ST.mode;
  let t = String(text || '').trim().toUpperCase().replace(/^\$/, '').replace('/', '-').replace(/\s+/g, '');
  if (!t) return null;
  if (NT.NAMES[t.toLowerCase()]) t = NT.NAMES[t.toLowerCase()];
  const cr = Providers.ids.has(t) ? t : Providers.ids.has(t + '-USD') ? t + '-USD' : null;
  const known = STOCK_SET.has(t), looks = !/-USD$/.test(t) && /^[A-Z][A-Z0-9.\-]{0,8}$/.test(t);
  if (/^OC:/.test(t) && typeof OC !== 'undefined') { const raw = String(text).trim(); return OC.is(raw) ? raw : null; }
  if (mode === 'onchain') { const h = typeof ocFind === 'function' ? ocFind(t) : null; if (h) return h; }
  if (mode === 'stocks') return known ? t : looks && !cr ? t : cr || (looks ? t : null);
  return cr || (known ? t : null);
}
function ensureSym(sym) { Feed.subscribe([sym]); const s = getStore(sym, ST.tf); if (!s.loaded && !s.loading) s.load(300).then(() => s.backfill()); else s.backfill(); } // fast first page, then deep history once
function tradeToast(t, who) {
  const b = baseOf(t.sym), up = t.side === 'buy';
  toast(`<b>${esc(who)}</b> ${up ? '🟢 BUY' : '🔴 SELL'} ${NT.fmtQty(t.qty)} ${esc(b)} @ ${NT.fmtPrice(t.price)}${t.pnl != null ? ` · P&L <b class="${cls(t.pnl)}">${NT.fmtUSD(t.pnl)}</b>` : ''}${t.reason ? `<div class="note">${esc(t.reason)}</div>` : ''}`, up ? 'up' : t.pnl > 0 ? 'up' : 'dn');
}
function md(s) { // tiny markdown → safe HTML (everything is escaped first; only b/code/ul/table are added back)
  const lines = esc(s).split('\n'); let out = '', ul = false, tb = null;
  const inl = (x) => x.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
  const cells = (ln) => ln.trim().replace(/^\||\|$/g, '').split('|').map((c) => inl(c.trim()));
  const flush = () => { if (!tb) return; const [h, ...rows] = tb; out += `<div class="mdt-wrap"><table class="mdt"><thead><tr>${cells(h).map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cells(r).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; tb = null; };
  for (const ln of lines) {
    if (/^\s*\|.*\|\s*$/.test(ln)) { if (ul) { out += '</ul>'; ul = false; } if (/^\s*\|[\s|:-]+\|\s*$/.test(ln)) continue; (tb = tb || []).push(ln); continue; }
    flush();
    const m = ln.match(/^\s*[-•*]\s+(.*)/);
    if (m) { if (!ul) { out += '<ul>'; ul = true; } out += '<li>' + inl(m[1]) + '</li>'; }
    else { if (ul) { out += '</ul>'; ul = false; } if (ln.trim()) out += '<p>' + inl(ln) + '</p>'; }
  }
  flush();
  return out + (ul ? '</ul>' : '');
}
function segBtns(host, items, cur, onPick) {
  host.innerHTML = items.map((it) => `<button data-v="${esc(it.v)}" class="${String(it.v) === String(cur) ? 'on' : ''}" title="${esc(it.t || '')}">${esc(it.l)}</button>`).join('');
  host.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; $$('button', host).forEach((x) => x.classList.toggle('on', x === b)); onPick(b.dataset.v); };
}
function download(name, text, type = 'text/plain') {
  try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); return true; } catch (e) { return false; }
}
function showTab(name) {
  if (name === 'crypto' || name === 'stocks') { if (ST.mode !== name) setMode(name); name = 'markets'; }
  curTab = name;
  $$('#nav button[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $$('.tab').forEach((t) => t.classList.toggle('on', t.id === 'tab-' + name));
  const t = TABS[name]; if (t) { if (t.show) t.show(); if (t.render) t.render(); }
  if (typeof FX3 !== 'undefined') FX3.nav();
}

/* ───────────── live tick handling: exits, limit orders, alerts ───────────── */
function onTick(sym, price) {
  const now = Date.now();
  const t = ACC.checkExits(sym, price, price, now, { open: price, src: 'manual' });
  if (t) { tradeToast(t, 'Paper account'); }
  if (ACC.orders.length) for (const f of ACC.matchOrders(sym, price, price, now)) tradeToast(f, 'Paper account');
  for (const b of ST.bots) {
    if (!b.run || b.sym !== sym || !b.account.pos[sym]) continue;
    const x = b.account.checkExits(sym, price, price, now, { open: price, src: 'bot:' + b.name });
    if (x) { const st = NT.strategies[b.strat]; if (st.onExit) st.onExit(b.state); b.lastSig = `${x.reason} @ ${NT.fmtPrice(x.price)}`; tradeToast(x, b.name); }
  }
  for (const a of ST.alerts) {
    if (!a.active || a.sym !== sym) continue;
    const hit = a.dir === 'above' ? price >= a.price : price <= a.price;
    if (hit) { a.active = false; a.hitAt = now; toast(`🔔 <b>${esc(baseOf(sym))}</b> ${a.dir} ${NT.fmtPrice(a.price)} — now ${NT.fmtPrice(price)}`, 'amb', 12000); beep(); try { if (window.Notification && Notification.permission === 'granted') new Notification('ExTerm alert', { body: `${baseOf(sym)} ${a.dir} ${NT.fmtPrice(a.price)} (now ${NT.fmtPrice(price)})` }); } catch (e) { } if (curTab === 'lab' && TABS.lab.render) TABS.lab.render(); }
  }
}

/* ───────────── MARKETS tab ───────────── */
let chart = null, chartVer = -1, chartKey = '', fcCache = { key: '', v: null }, tape = [], tapeDirty = false, tkSide = 'buy', tkType = 'market', prevPx = {}, bookTimer = 0;
const TF_ALL = ['1s', '5s', '10s', '15s', '30s', '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'];
const tfList = () => TF_ALL; // v15 p3: 1s / 5s / 15s on every market (stocks build sub-minute bars from launcher ticks)
const TF_LIST = TF_ALL;
const IND_LIST = [['ema', 'EMA 20/50'], ['sma', 'SMA 200'], ['vwap', 'VWAP'], ['bb', 'Bollinger'], ['kc', 'Keltner'], ['st', 'Supertrend'], ['ichi', 'Ichimoku'], ['psar', 'SAR'], ['vol', 'Volume'], ['rsi', 'RSI'], ['macd', 'MACD'], ['stochrsi', 'StochRSI'], ['adx', 'ADX'], ['atr', 'ATR'], ['obv', 'OBV'], ['trades', 'My trades'], ['fc', 'Forecast']];
const CT_LIST = [['candles', '🕯 Candles'], ['ha', 'Heikin-Ashi'], ['line', 'Line'], ['area', 'Area']];

function markersFor(sym) {
  const m = [];
  for (const t of ACC.trades) if (t.sym === sym) m.push({ t: t.ts / 1000, side: t.side, price: t.price });
  for (const b of ST.bots) for (const t of b.account.trades) if (t.sym === sym) m.push({ t: t.ts / 1000, side: t.side, price: t.price });
  return m;
}
function chartRefresh(force) {
  if (!chart) return;
  if (typeof Replay !== 'undefined' && Replay.on) { if (Replay.sym === ST.sel && Replay.tf === ST.tf) return; Replay.exit(); }
  const st = getStore(ST.sel, ST.tf), key = ST.sel + '|' + ST.tf + '|' + ST.ind.fc + '|' + ACC.trades.length + '|' + ST.bots.reduce((s, b) => s + b.account.trades.length, 0);
  if (!force && st.version === chartVer && key === chartKey) return;
  chartVer = st.version; chartKey = key;
  let fc = null;
  if (ST.ind.fc && st.candles.length > 40) {
    const k = st.candles.length + ':' + st.candles[st.candles.length - 1].t + ':' + ST.sel;
    if (fcCache.key !== k) fcCache = { key: k, v: NT.forecast(st.candles.slice(-300).map((c) => c.c), 24) };
    fc = fcCache.v;
  }
  chart.o = Object.assign(chart.o, ST.ind);
  chart.set(st.candles, st.sec, markersFor(ST.sel), fc, st.err ? 'Could not load candles for ' + ST.sel + ': ' + st.err : st.loaded ? 'No candles' : 'Loading candles…');
}
function selectSym(sym, noSave) {
  if (!sym) return;
  const m = modeOf(sym);
  if (m !== ST.mode) { setMode(m, sym); return; }
  ST.sel = sym; ensureSym(sym);
  if (chart) { ST.draw = ST.draw || {}; chart.drawings = ST.draw[sym] || (ST.draw[sym] = []); chart.pend = null; }
  tape = []; tapeDirty = true; $('#book').innerHTML = '<div class="empty">loading…</div>'; bookTimer = 0;
  $('#symInput').value = baseOf(sym);
  const stk = isStock(sym), oc = isOnchain(sym);
  $('#bookTitle').textContent = oc ? 'Pool stats' : stk ? 'Quote' : 'Order book'; $('#tapeTitle').textContent = oc ? 'On-chain swaps' : stk ? 'Price updates' : 'Live trades';
  if (typeof OC !== 'undefined') OC.watchTrades(oc ? sym : null);
  chartRefresh(true); renderTicketMeta(); renderWatch(); renderQuote(); renderPosStrip(); renderMode(); refreshBook();
  if (!noSave) saveState();
}
function renderQuote() {
  const s = ST.sel, p = px(s), c = chg24(s);
  $('#qSym').textContent = isOnchain(s) ? OC.title(s) : s;
  const el = $('#qPrice'), prev = prevPx['_q'];
  el.textContent = p ? NT.fmtPrice(p) : '–';
  if (prev && p && p !== prev) { el.classList.remove('flash-up', 'flash-dn'); void el.offsetWidth; el.classList.add(p > prev ? 'flash-up' : 'flash-dn'); }
  prevPx['_q'] = p;
  const ce = $('#qChg'); ce.textContent = c == null ? '' : NT.fmtPct(c) + (isStock(s) ? ' today' : ' 24h'); ce.className = 'chg ' + cls(c);
}
function renderWatch() {
  const host = $('#watchList'); $('#wlCount').textContent = ST.watch.length;
  host.innerHTML = ST.watch.map((s) => {
    const p = px(s), c = chg24(s), pv = prevPx[s], f = pv && p && p !== pv ? (p > pv ? 'flash-up' : 'flash-dn') : '';
    prevPx[s] = p;
    const st1 = StoresBySym.get(s), cs = st1 ? [...st1].map((x) => x.candles).sort((a, b) => b.length - a.length)[0] || [] : [], sv = cs.slice(-40).map((k) => k.c);
    const spk = sv.length > 5 ? (() => { const lo = Math.min(...sv), hi = Math.max(...sv) || 1, r = hi - lo || 1; return `<svg class="spk" viewBox="0 0 60 18" preserveAspectRatio="none"><polyline fill="none" stroke="${sv[sv.length - 1] >= sv[0] ? 'var(--up)' : 'var(--dn)'}" stroke-width="1.4" points="${sv.map((v, i) => `${((i / (sv.length - 1)) * 60).toFixed(1)},${(17 - ((v - lo) / r) * 16).toFixed(1)}`).join(' ')}"/></svg>`; })() : '<span></span>';
    return `<div class="wl-row ${s === ST.sel ? 'on' : ''}" data-s="${esc(s)}"><div style="min-width:0"><b>${esc(baseOf(s))}</b>${spk}</div><span class="num ${f}">${p ? (isOnchain(s) ? NT.fmtTiny(p) : NT.fmtPrice(p)) : '–'}</span><span class="num ${cls(c)}" style="min-width:56px;text-align:right">${c == null ? '' : NT.fmtPct(c, 1)}</span><span class="x" data-x="${esc(s)}" title="Remove">✕</span></div>`;
  }).join('') || '<div class="empty">Add symbols below</div>';
}
function renderPosStrip() {
  const s = ST.sel, p = ACC.pos[s], m = px(s), el = $('#posStrip');
  if (!p) { el.innerHTML = `<span>No open position in <b>${esc(baseOf(s))}</b></span><span>Cash <b>${NT.fmtUSD(ACC.cash)}</b></span>`; return; }
  const avg = p.cost / p.qty, u = m ? p.qty * m - p.cost : 0;
  el.innerHTML = `<span>Position <b>${NT.fmtQty(p.qty)} ${esc(baseOf(s))}</b></span><span>Avg <b>${NT.fmtPrice(avg)}</b></span><span>Mark <b>${NT.fmtPrice(m)}</b></span><span>Unrealized <b class="${cls(u)}">${NT.fmtUSD(u)} (${NT.fmtPct(p.cost ? (u / p.cost) * 100 : 0)})</b></span>${p.sl ? `<span>SL <b>${NT.fmtPrice(p.sl)}</b></span>` : ''}${p.tp ? `<span>TP <b>${NT.fmtPrice(p.tp)}</b></span>` : ''}<button class="btn sm sell" id="posClose">Close position</button>`;
  const b = $('#posClose'); if (b) b.onclick = () => { const t = ACC.sell(s, px(s), null, Date.now(), { reason: 'manual close', src: 'manual' }); if (t) { tradeToast(t, 'Paper account'); renderPosStrip(); renderTicketMeta(); } };
}
function buildTicket() {
  $('#ticket').innerHTML = `
  <div class="tabs"><button class="b on" data-side="buy">Buy</button><button class="s" data-side="sell">Sell</button></div>
  <div class="pb" style="display:flex;flex-direction:column;gap:8px">
    <div class="row" style="justify-content:space-between"><b class="mono" id="tkSym"></b><span class="note">Available <b class="mono" id="tkAvail" style="color:var(--text)"></b></span></div>
    <div class="seg" id="tkType"><button class="on" data-t="market">Market</button><button data-t="limit">Limit</button><button data-t="stop" title="Stop entry: buy when price rises to the trigger (breakout) or sell when it falls to it">Stop</button></div>
    <label class="f" id="tkLimitRow" hidden><span id="tkLimitLbl">Limit price (USD)</span><input class="in mono" id="tkLimit" inputmode="decimal"></label>
    <div class="seg" id="tkSize" style="width:100%"><button class="on" data-z="usd" style="flex:1">Size in USD</button><button data-z="risk" style="flex:1" title="Size the position from how much you're willing to lose if the stop is hit">Size by risk</button></div>
    <label class="f" id="tkUsdRow">Amount (USD)<input class="in mono" id="tkUsd" value="1000" inputmode="decimal"></label>
    <label class="f" id="tkRiskRow" hidden>Risk per trade (% of equity)<input class="in mono" id="tkRisk" value="1" inputmode="decimal"></label>
    <div class="seg" id="tkPct" style="width:100%">${[25, 50, 75, 100].map((p) => `<button data-p="${p}" style="flex:1">${p}%</button>`).join('')}</div>
    <div class="row" id="tkBr"><label class="f" style="flex:1">Stop-loss %<input class="in mono" id="tkSl" placeholder="off" inputmode="decimal"></label><label class="f" style="flex:1">Take-profit %<input class="in mono" id="tkTp" placeholder="off" inputmode="decimal"></label><label class="f" style="flex:1" title="Trailing stop: follows the highest price by this %">Trail %<input class="in mono" id="tkTr" placeholder="off" inputmode="decimal"></label></div>
    <div class="row tk-quick" id="tkQuick"><button class="chip" data-q="sl15" title="Stop 1.5 × ATR below price">SL 1.5 ATR</button><button class="chip" data-q="sl2" title="Stop 2 × ATR below price">SL 2 ATR</button><button class="chip" data-q="tp2" title="Target 2 × the stop distance">TP 2R</button><button class="chip" data-q="tp3">TP 3R</button><button class="chip" data-q="clr">Clear</button></div>
    <div class="note" id="tkEst"></div>
    <button class="btn buy" id="tkGo" style="padding:9px;font-weight:600"></button>
    <div id="tkStops"></div>
    <div class="note">Paper money only — nothing here touches a real exchange.</div>
  </div>`;
  const root = $('#ticket');
  root.querySelector('.tabs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; tkSide = b.dataset.side; $$('.tabs button', root).forEach((x) => x.classList.toggle('on', x === b)); renderTicketMeta(); };
  $('#tkType').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; tkType = b.dataset.t; $$('#tkType button').forEach((x) => x.classList.toggle('on', x === b)); $('#tkLimitRow').hidden = tkType === 'market'; $('#tkLimitLbl').textContent = tkType === 'stop' ? 'Trigger price (USD)' : 'Limit price (USD)'; if (tkType !== 'market' && !$('#tkLimit').value) $('#tkLimit').value = px(ST.sel) ? px(ST.sel).toPrecision(6) : ''; renderTicketMeta(); };
  $('#tkPct').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; const p = +b.dataset.p / 100, price = px(ST.sel); if (!price) return; const base = tkSide === 'buy' ? ACC.cash : ACC.qty(ST.sel) * price; $('#tkUsd').value = (base * p).toFixed(2); renderTicketMeta(); };
  $('#tkUsd').oninput = renderTicketMeta;
  ['#tkRisk', '#tkSl', '#tkTp', '#tkTr', '#tkLimit'].forEach((k) => { $(k).oninput = renderTicketMeta; });
  $('#tkSize').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; tkSize = b.dataset.z; $$('#tkSize button').forEach((x) => x.classList.toggle('on', x === b)); $('#tkUsdRow').hidden = tkSize === 'risk'; $('#tkRiskRow').hidden = tkSize !== 'risk'; $('#tkPct').style.display = tkSize === 'risk' ? 'none' : ''; if (tkSize === 'risk' && !$('#tkSl').value) quickTk('sl2'); renderTicketMeta(); };
  $('#tkQuick').onclick = (e) => { const b = e.target.closest('[data-q]'); if (b) { quickTk(b.dataset.q); renderTicketMeta(); } };
  $('#tkStops').onclick = (e) => { const b = e.target.closest('[data-stopx]'); if (!b) return; ST.stops = (ST.stops || []).filter((o) => o.id !== b.dataset.stopx); renderStops(); saveState(); };
  $('#tkGo').onclick = submitOrder;
}
let tkSize = 'usd';
function tkAtr() { const c = getStore(ST.sel, ST.tf).candles; return c.length > 20 ? NT.ind.atr(c, 14)[c.length - 1] : null; }
function quickTk(q) {
  const p = tkType === 'market' ? px(ST.sel) : parseFloat($('#tkLimit').value) || px(ST.sel), a = tkAtr(); if (!p) return;
  const slp = parseFloat($('#tkSl').value);
  if (q === 'clr') { ['#tkSl', '#tkTp', '#tkTr'].forEach((k) => { $(k).value = ''; }); return; }
  if (q === 'sl15' || q === 'sl2') { if (!a) return toast('Need some candles first', 'amb'); $('#tkSl').value = (((q === 'sl2' ? 2 : 1.5) * a) / p * 100).toFixed(2); return; }
  if (!(slp > 0)) return toast('Set a stop-loss first: targets are multiples of it', 'amb');
  $('#tkTp').value = (slp * (q === 'tp3' ? 3 : 2)).toFixed(2);
}
function tkAmount() { // USD to spend, from either the amount box or the risk sizing
  if (tkSize !== 'risk' || tkSide !== 'buy') return parseFloat($('#tkUsd').value);
  const r = parseFloat($('#tkRisk').value) / 100, sl = parseFloat($('#tkSl').value) / 100; if (!(r > 0) || !(sl > 0)) return NaN;
  return Math.min(ACC.cash, (ACC.equity(priceMap()) * r) / sl);
}
function renderStops() {
  const el = $('#tkStops'); if (!el) return; const list = (ST.stops || []).filter((o) => o.sym === ST.sel);
  el.innerHTML = list.length ? `<div class="note" style="margin-bottom:4px">Pending stop orders</div>` + list.map((o) => `<div class="row tk-stop"><span class="${o.side === 'buy' ? 'up' : 'dn'}">${o.side === 'buy' ? 'Buy ≥' : 'Sell ≤'} ${NT.fmtPrice(o.trigger)}</span><span class="mono">${NT.fmtUSD(o.usd)}</span><button class="btn sm" data-stopx="${esc(o.id)}" title="Cancel">✕</button></div>`).join('') : '';
}
function renderTicketMeta() {
  const s = ST.sel, b = baseOf(s), go = $('#tkGo'); if (!go) return;
  $('#tkSym').textContent = isOnchain(s) ? OC.title(s) : s;
  $('#tkAvail').textContent = tkSide === 'buy' ? NT.fmtUSD(ACC.cash) : NT.fmtQty(ACC.qty(s)) + ' ' + b;
  go.className = 'btn ' + (tkSide === 'buy' ? 'buy' : 'sell'); go.textContent = `${tkSide === 'buy' ? 'Buy' : 'Sell'} ${b}${tkType === 'limit' ? ' (limit)' : ''}`;
  $('#tkBr').style.display = tkSide === 'buy' ? '' : 'none';
  const usd = tkAmount(), p = tkType !== 'market' ? parseFloat($('#tkLimit').value) : px(s), sl = parseFloat($('#tkSl').value) / 100 || 0, tp = parseFloat($('#tkTp').value) / 100 || 0;
  let est = usd > 0 && p > 0 ? `≈ ${NT.fmtQty(usd / p)} ${b} · ${NT.fmtUSD(usd)} · fee ${NT.fmtUSD(usd * ACC.fee)}` : tkSize === 'risk' ? 'Set a risk % and a stop-loss to size the trade' : '';
  if (tkSide === 'buy' && usd > 0 && sl) est += ` · risk ${NT.fmtUSD(usd * sl)}` + (tp ? ` · reward ${NT.fmtUSD(usd * tp)} · R:R 1:${(tp / sl).toFixed(1)}` : '');
  $('#tkEst').textContent = est; renderStops();
}
function submitOrder() {
  const s = ST.sel, usd = tkAmount(), price = tkType !== 'market' ? parseFloat($('#tkLimit').value) : px(s), trp = parseFloat($('#tkTr').value) / 100 || 0;
  if (!(usd > 0)) return toast('Enter an amount in USD', 'amb');
  if (!(price > 0)) return toast('No price available yet for ' + s, 'amb');
  if (isStock(s) && StockFeed.session[s] === false && tkType === 'market') toast('Market is closed, so this paper order fills at the last price.', 'amb');
  const slp = parseFloat($('#tkSl').value) / 100 || 0, tpp = parseFloat($('#tkTp').value) / 100 || 0, now = Date.now();
  if (Replay && Replay.on) return toast('Exit Bar Replay first (or use the replay Buy/Sell buttons)', 'amb');
  if (tkType === 'stop') {
    const cur = px(s); if (tkSide === 'buy' && !(price > cur)) return toast('A buy stop triggers above the current price', 'amb'); if (tkSide === 'sell' && !(price < cur)) return toast('A sell stop triggers below the current price', 'amb');
    if (tkSide === 'sell' && !ACC.qty(s)) return toast('No ' + baseOf(s) + ' position to protect', 'amb');
    ST.stops = ST.stops || []; ST.stops.push({ id: NT.uid(), sym: s, side: tkSide, trigger: price, usd, meta: { slPct: slp, tpPct: tpp, trailPct: trp }, ts: now });
    toast(`Stop ${tkSide} armed: ${NT.fmtUSD(usd)} of ${esc(baseOf(s))} when price ${tkSide === 'buy' ? 'rises to' : 'falls to'} ${NT.fmtPrice(price)}`, 'acc');
  } else if (tkType === 'limit') {
    ACC.placeLimit(s, tkSide, price, tkSide === 'buy' ? usd : usd / price, now, tkSide === 'buy' ? { slPct: slp, tpPct: tpp, trailPct: trp } : {});
    toast(`Limit ${tkSide} placed: ${NT.fmtUSD(usd)} of ${esc(baseOf(s))} @ ${NT.fmtPrice(price)}`, 'acc');
  } else if (tkSide === 'buy') {
    if (ACC.cash < 1) return toast('Not enough cash', 'dn');
    const t = ACC.buy(s, price, usd, now, { reason: tkSize === 'risk' ? `market buy (sized for ${$('#tkRisk').value}% risk)` : 'market buy', src: 'manual', slPct: slp, tpPct: tpp, trailPct: trp }); if (t) tradeToast(t, 'Paper account');
  } else {
    const have = ACC.qty(s); if (!have) return toast('No ' + baseOf(s) + ' position to sell', 'amb');
    const t = ACC.sell(s, price, Math.min(have, usd / price), now, { reason: 'market sell', src: 'manual' }); if (t) tradeToast(t, 'Paper account');
  }
  renderTicketMeta(); renderPosStrip(); renderWatch(); chartRefresh(true); saveState();
}
async function refreshBook() {
  if (curTab !== 'markets' || !Providers.active) return;
  const s = ST.sel;
  if (isOnchain(s)) { renderPoolStats(s); if (!OC.stats[s] || Date.now() - OC.stats[s].ts > 60000) { await OC.poll([s]); if (s === ST.sel) renderPoolStats(s); } return; }
  if (isStock(s)) {
    const q = StockFeed.last[s], L = Feed.live[s], info = STOCK_INFO[s];
    $('#bookSpread').textContent = marketStatus(s);
    $('#book').innerHTML = `<div class="pb"><div style="font-weight:600">${esc((info && info.name) || StockFeed.names[s] || s)}</div><div class="note">${esc((info && info.sector) || (q && q.exch) || '')}</div>
      <table style="margin-top:6px"><tr><td class="mut">Last</td><td class="r num">${L ? NT.fmtPrice(L.price) : '–'}</td></tr><tr><td class="mut">Prev close</td><td class="r num">${L && L.open24 ? NT.fmtPrice(L.open24) : '–'}</td></tr><tr><td class="mut">Change</td><td class="r num ${cls(chg24(s))}">${chg24(s) == null ? '–' : NT.fmtPct(chg24(s))}</td></tr>${info && info.shares ? `<tr><td class="mut">Mkt cap (approx.)</td><td class="r num">$${NT.fmtCompact(info.shares * (L ? L.price : info.demo))}</td></tr>` : ''}</table>
      <div class="note" style="margin-top:6px">${Stocks.active === StockDemo ? 'Simulated quotes, because Yahoo Finance is unreachable from this page. Run serve.py for real ones.' : 'Quotes from Yahoo Finance, refreshed every 15s (may be delayed). Free Level-2 depth isn’t available for stocks.'}</div></div>`;
    return;
  }
  try {
    const bk = await Providers.active.book(s); if (s !== ST.sel) return;
    if (typeof Depth3D !== 'undefined') { Depth3D.push(s, bk); if (Depth3D.on) { Depth3D.render(); const sp0 = bk.asks[0][0] - bk.bids[0][0]; $('#bookSpread').textContent = 'spread ' + ((sp0 / bk.asks[0][0]) * 1e4).toFixed(1) + ' bp'; return; } }
    const asks = bk.asks.slice(0, 10).reverse(), bids = bk.bids.slice(0, 10);
    const mx = Math.max(...asks.map((x) => x[1]), ...bids.map((x) => x[1]), 1e-9);
    const row = (x, c) => `<div class="rw"><span class="${c}">${NT.fmtPrice(x[0])}</span><span style="text-align:right">${NT.fmtQty(x[1])}</span><i class="bar" style="width:${(x[1] / mx) * 100}%;background:var(--${c})"></i></div>`;
    $('#book').innerHTML = asks.map((x) => row(x, 'dn')).join('') + bids.map((x) => row(x, 'up')).join('');
    const sp = bk.asks[0][0] - bk.bids[0][0]; $('#bookSpread').textContent = 'spread ' + NT.fmtPrice(sp) + ' (' + ((sp / bk.asks[0][0]) * 1e4).toFixed(1) + ' bp)';
  } catch (e) { $('#book').innerHTML = `<div class="empty">Order book unavailable<br><span class="note">${esc(e.message)}</span></div>`; }
}
function renderPoolStats(s) {
  const st = OC.stats[s] || {}, m = OC.meta[s] || {}, L = Feed.live[s], p = (L && L.price) || st.price;
  const usd = (v) => (v == null ? '–' : NT.fmtUSD(v, v >= 1e6 ? 0 : 0).replace(/\.00$/, ''));
  const big = (v) => (v == null ? '–' : v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : usd(v));
  const pc = (v) => `<span class="${cls(v)}">${v == null ? '–' : NT.fmtPct(v)}</span>`;
  const b = st.buys24, sl = st.sells24, tot = (b || 0) + (sl || 0), bp = tot ? (b / tot) * 100 : 50;
  const age = st.created ? (() => { const h = (Date.now() - st.created) / 36e5; return h < 1 ? Math.round(h * 60) + 'm' : h < 48 ? h.toFixed(1) + 'h' : Math.round(h / 24) + 'd'; })() : '–';
  const flags = OC.flags(s).map(([c, t]) => `<span class="tag ${c}">${esc(t)}</span>`).join(' ');
  const links = OC.links(s).map(([t, u]) => `<a href="${safeUrl(u, '#', true)}" target="_blank" rel="noopener noreferrer">${esc(t)} ↗</a>`).join(' · ');
  const pa = OC.parse(s) || {}, logo = m.img && ST.settings.ocLogos !== false ? `<img src="${safeUrl(m.img, '', true)}" alt="" class="oc-logo" referrerpolicy="no-referrer">` : '';
  $('#bookSpread').textContent = marketStatus(s);
  $('#book').innerHTML = `<div class="pb oc-pool"><div class="row" style="gap:8px">${logo}<div style="min-width:0"><div style="font-weight:700">${esc(m.s || OC.label(s))} <span class="mut">/ ${esc(m.q || '?')}</span></div><div class="note">${esc(m.n || '')}${m.dex ? ' · ' + esc(m.dex) : ''}</div></div></div>
    <table style="margin-top:8px"><tr><td class="mut">Price</td><td class="r num">${p ? NT.fmtPrice(p) : '–'}</td></tr>
    <tr><td class="mut">5m · 1h</td><td class="r num">${pc(st.ch5m)} · ${pc(st.ch1h)}</td></tr><tr><td class="mut">6h · 24h</td><td class="r num">${pc(st.ch6h)} · ${pc(st.ch24)}</td></tr>
    <tr><td class="mut">Liquidity</td><td class="r num">${big(st.liq)}</td></tr><tr><td class="mut">Market cap</td><td class="r num">${big(st.mcap || st.fdv)}</td></tr><tr><td class="mut">FDV</td><td class="r num">${big(st.fdv)}</td></tr>
    <tr><td class="mut">24h volume</td><td class="r num">${big(st.vol24)}</td></tr><tr><td class="mut">Pair age</td><td class="r num">${age}</td></tr></table>
    <div class="note" style="margin-top:8px;display:flex;justify-content:space-between"><span class="up">${b == null ? '–' : b.toLocaleString()} buys</span><span class="dn">${sl == null ? '–' : sl.toLocaleString()} sells</span></div>
    <div class="oc-bs"><i style="width:${bp.toFixed(1)}%"></i></div>
    ${flags ? `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">${flags}</div>` : ''}
    <div class="note mono" style="margin-top:8px;word-break:break-all" title="Pool address">${esc(pa.pool || '')}</div>
    ${typeof Safety !== 'undefined' ? `<div style="margin-top:8px">${Safety.poolBadge(s)}</div>` : ''}
    ${links ? `<div class="note" style="margin-top:4px">${links}</div>` : ''}
    <div class="note" style="margin-top:6px">${OC.sim || pa.chain === 'sim' ? 'Simulated token: DEX data was unreachable. Run the launcher (serve.py) for live pools.' : 'AMM pool, so there is no order book. Stats refresh every ~10s; flags are quick heuristics, not advice.'}</div></div>`;
}
function renderTape() {
  if (!tapeDirty) return; tapeDirty = false;
  if (isOnchain(ST.sel)) {
    $('#tape').innerHTML = tape.length ? tape.map((t) => `<div class="t"><span class="${t.side === 'buy' ? 'up' : 'dn'}">${NT.fmtPrice(t.p)}</span><span style="text-align:right">${t.usd != null ? NT.fmtUSD(t.usd) : NT.fmtQty(t.q)}</span><span class="mut" style="padding-left:10px" title="${esc(t.who || '')}">${t.who ? esc(t.who.slice(0, 4) + '…' + t.who.slice(-3)) : fmtClock(t.ts * 1000)}</span></div>`).join('') : `<div class="empty">${OC.tradeErr ? 'Swaps unavailable: ' + esc(OC.tradeErr) : 'Waiting for swaps…'}</div>`;
    return;
  }
  if (isStock(ST.sel) && !tape.length) { $('#tape').innerHTML = '<div class="empty">Price updates appear here as quotes refresh.</div>'; return; }
  $('#tape').innerHTML = tape.length ? tape.map((t) => `<div class="t"><span class="${t.side === 'buy' ? 'up' : 'dn'}">${NT.fmtPrice(t.p)}</span><span style="text-align:right">${NT.fmtQty(t.q)}</span><span class="mut" style="padding-left:10px">${fmtClock(t.ts * 1000)}</span></div>`).join('') : '<div class="empty">waiting for trades…</div>';
}
TABS.markets = {
  show() { chartRefresh(true); setTimeout(() => chart && chart.invalidate(), 30); refreshBook(); },
  render() { renderWatch(); renderPosStrip(); renderTicketMeta(); renderTape(); },
};
function initMarkets() {
  chart = new CandleChart($('#chartHost')); Object.assign(chart.o, ST.ind); if (typeof OF !== 'undefined') OF.attach(chart);
  ST.draw = ST.draw || {}; chart.drawings = ST.draw[ST.sel] || (ST.draw[ST.sel] = []);
  chart.onDraw = (d) => { ST.draw[ST.sel] = d; chart.tool = null; chart.cv.style.cursor = ''; if (chart.paintTools) chart.paintTools(); saveState(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && chart && (chart.tool || chart.pend)) { chart.tool = null; chart.pend = null; chart.cv.style.cursor = ''; if (chart.paintTools) chart.paintTools(); chart.invalidate(); } });
  segBtns($('#tfBtns'), tfList().map((v) => ({ v, l: v })), ST.tf, (v) => { ST.tf = v; ensureSym(ST.sel); chartRefresh(true); saveState(); });
  const dtb = $('#drawBtns'); if (dtb) { const paint = () => segBtns(dtb, [{ v: 't', l: '╱ Trend' }, { v: 'h', l: '― Level' }, { v: 'fib', l: 'Fib' }, { v: 'ch', l: '⫽ Channel' }, { v: 'rect', l: '▭ Zone' }, { v: 'long', l: '⬆ Long' }, { v: 'short', l: '⬇ Short' }, { v: 'ruler', l: '📏' }, { v: 'txt', l: 'T' }, { v: 'undo', l: '↶' }, { v: 'clear', l: '✕' }], chart.tool || '', (v) => { if (v === 'undo') { chart.undo(); ST.draw[ST.sel] = chart.drawings.slice(); saveState(); paint(); return; } if (v === 'clear') { chart.drawings = []; ST.draw[ST.sel] = []; chart.tool = null; chart.pend = null; saveState(); } else { chart.tool = chart.tool === v ? null : v; chart.pend = null; } chart.cv.style.cursor = chart.tool ? 'crosshair' : ''; paint(); chart.invalidate(); }); paint(); chart.paintTools = paint; }
  const ctb = $('#ctBtns'); if (ctb) segBtns(ctb, CT_LIST.map(([v, l]) => ({ v, l })), ST.ind.type || 'candles', (v) => { ST.ind.type = v; chartRefresh(true); saveState(); });
  if (!Array.isArray(ST.ind.extra)) ST.ind.extra = [];
  IndPick.chips(); $('#indBtns').onclick = (e) => IndPick.onBar(e);
  buildTicket();
  $('#watchList').onclick = (e) => {
    const x = e.target.closest('[data-x]'); if (x) { ST.watch = ST.watch.filter((s) => s !== x.dataset.x); renderWatch(); saveState(); return; }
    const r = e.target.closest('.wl-row'); if (r) selectSym(r.dataset.s);
  };
  const addWatch = () => { const s = resolveSym($('#wlAdd').value); if (!s && ST.mode === 'onchain') { const q = $('#wlAdd').value.trim(); return SymPick.open($('#wlAdd'), ST.sel, (x) => { if (!ST.watch.includes(x)) ST.watch.push(x); Feed.subscribe([x]); $('#wlAdd').value = ''; renderWatch(); saveState(); }, { q, tab: 'onchain' }); } if (!s) return toast('Unknown symbol — try BTC, ETH, SOL…', 'amb'); if (!ST.watch.includes(s)) ST.watch.push(s); Feed.subscribe([s]); $('#wlAdd').value = ''; renderWatch(); saveState(); };
  $('#wlAddBtn').onclick = addWatch; $('#wlAdd').onkeydown = (e) => { if (e.key === 'Enter') addWatch(); };
  const si = $('#symInput');
  si.onkeydown = (e) => { if (e.key === 'Enter') { const s = resolveSym(si.value); if (s) { selectSym(s); showTab('markets'); si.blur(); } else toast('Unknown symbol “' + esc(si.value) + '”', 'amb'); } };
  si.removeAttribute('list'); si.readOnly = true; si.style.cursor = 'pointer';
  si.onfocus = si.onclick = () => { if (!SymPick.st) SymPick.open(si.parentNode, ST.sel, (s) => openSym(s)); };
  Feed.tickL.push((sym, price) => { if (sym === ST.sel && isStock(sym)) { const pv = tape[0] ? tape[0].p : price; tape.unshift({ p: price, q: 0, side: price >= pv ? 'buy' : 'sell', ts: Date.now() / 1000 }); if (tape.length > 40) tape.pop(); tapeDirty = true; } });
  Feed.tradeL.push((sym, price, size, side, ts, x) => { if (sym === ST.sel) { tape.unshift({ p: price, q: size, side, ts, usd: x ? x.usd : null, who: x ? x.who : '' }); if (tape.length > 40) tape.pop(); tapeDirty = true; } });
}
