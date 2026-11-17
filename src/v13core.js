/* ExTerm v13 core: safe storage (compaction, a visible warning when saving fails, daily automatic backups you can
   restore), data-freshness warnings, the first-run "live data" screen, and a worker heartbeat so paper bots keep
   checking signals when this tab is in the background (browsers throttle normal timers there). */

/* ───────────── safe storage + automatic backups ───────────── */
const SafeStore = (() => {
  const S = { failing: false, lastOk: 0, compactions: 0, snaps: [], dbp: null };
  const KEEP = 7, DAY = 864e5, OWN = (k) => k === LS_KEY || /^(nt\.|novaterm)/.test(k);
  S.lsBytes = () => { let n = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); n += (k.length + (localStorage.getItem(k) || '').length) * 2; } } catch (e) { /* blocked */ } return n; };
  // shrink the things that grow without bound; nothing the user typed is removed
  S.compact = () => {
    S.compactions++;
    ST.totalEq = (ST.totalEq || []).slice(-500); ST.chat = (ST.chat || []).slice(-15);
    if (ACC) { ACC.trades = ACC.trades.slice(-400); ACC.eq = ACC.eq.slice(-500); }
    for (const b of ST.bots || []) if (b.account) { b.account.trades = b.account.trades.slice(-200); b.account.eq = b.account.eq.slice(-300); }
    if (Array.isArray(ST.solTrades)) ST.solTrades = ST.solTrades.slice(-300);
    if (Array.isArray(ST.secTrades)) ST.secTrades = ST.secTrades.slice(-300);
    const keep = new Set([].concat(...Object.values(ST.mk || {}).map((m) => (m && m.watch) || []), ST.watch || [], [ST.sel]));
    for (const s of Object.keys(ST.draw || {})) if (!keep.has(s) && !(ST.draw[s] || []).length) delete ST.draw[s];
  };
  S.banner = (on) => {
    let el = $('#storeWarn');
    if (!on) { if (el) el.remove(); return; }
    if (el) return;
    el = document.createElement('div'); el.id = 'storeWarn'; el.className = 'banner warn store-warn'; el.setAttribute('role', 'alert');
    el.innerHTML = '⚠ <b>Your browser storage is full, so changes are not being saved.</b> Download a backup now, then free up space. <button class="btn sm" data-sw="dl">Download backup</button> <button class="btn sm" data-sw="fix">Free up space…</button>';
    el.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.sw === 'dl') S.download(); else { showTab('set'); setTimeout(() => { const p = $('#v13Store'); if (p) p.scrollIntoView({ behavior: 'smooth' }); }, 150); } };
    const ref = $('#banner'); ref.parentNode.insertBefore(el, ref);
  };
  S.wrap = () => {
    const prev = saveState;
    saveState = function () {
      const r = prev.apply(this, arguments);
      if (!storageOK) { S.compact(); storageOK = true; prev.apply(this, arguments); }
      if (!storageOK) { if (!S.failing) { S.failing = true; S.banner(true); } }
      else { S.lastOk = Date.now(); if (S.failing) { S.failing = false; S.banner(false); toast('Saving works again ✓', 'up'); } }
      return r;
    };
  };
  S.payload = () => { const o = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (OWN(k)) o[k] = localStorage.getItem(k); } } catch (e) { /* blocked */ } return o; };
  S.download = () => { const b = JSON.stringify({ novaterm: 13, ts: Date.now(), keys: S.payload() }); if (!download('exterm-full-backup-' + new Date().toISOString().slice(0, 10) + '.json', b, 'application/json')) toast('Downloads are blocked here', 'amb'); };
  // IndexedDB keeps the snapshots (it has far more room than localStorage)
  const db = () => S.dbp || (S.dbp = new Promise((res, rej) => { try { const r = indexedDB.open('novaterm-backups', 1); r.onupgradeneeded = () => r.result.createObjectStore('snaps', { keyPath: 'ts' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }));
  const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('snaps', mode), st = t.objectStore('snaps'), out = fn(st); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); }); };
  S.list = async () => { try { const all = await tx('readonly', (st) => st.getAll()); S.snaps = (all || []).map((x) => ({ ts: x.ts, size: x.size, auto: x.auto })).sort((a, b) => b.ts - a.ts); } catch (e) { S.snaps = []; } return S.snaps; };
  S.snapshot = async (auto) => {
    try { if (!S.failing) saveState(); } catch (e) { /* snapshot what is there */ }
    const keys = S.payload(), size = Object.values(keys).reduce((n, v) => n + (v || '').length * 2, 0);
    if (!keys[LS_KEY]) return null;
    try {
      await tx('readwrite', (st) => st.put({ ts: Date.now(), size, auto: !!auto, keys }));
      const l = await S.list(); for (const x of l.slice(KEEP)) await tx('readwrite', (st) => st.delete(x.ts));
      await S.list(); return size;
    } catch (e) { console.warn('backup failed', e); return null; }
  };
  S.restore = async (ts) => {
    const rec = await tx('readonly', (st) => st.get(ts)); if (!rec || !rec.keys || !rec.keys[LS_KEY]) throw new Error('backup not found');
    JSON.parse(rec.keys[LS_KEY]); // must be valid before we touch anything
    await S.snapshot(false); // safety net: the current state becomes a backup too
    for (const [k, v] of Object.entries(rec.keys)) if (OWN(k) && typeof v === 'string') localStorage.setItem(k, v);
    location.reload();
  };
  S.get = (ts) => tx('readonly', (st) => st.get(ts));
  S.auto = async () => { const l = await S.list(); if (!l.length || Date.now() - l[0].ts > DAY * 0.9) await S.snapshot(true); };
  S.panel = () => {
    const used = S.lsBytes(), pct = Math.min(100, (used / (5 * 1024 * 1024)) * 100);
    return `<div class="panel" id="v13Store"><h3>🛟 Backups &amp; storage</h3><div class="pb">
      <div class="note">ExTerm keeps everything in this browser. It now saves a full backup automatically once a day (the last ${KEEP} are kept), and warns you if saving ever fails.</div>
      <div class="v13-meter" title="Approximate: browsers allow about 5 MB"><i style="width:${pct.toFixed(1)}%" class="${pct > 85 ? 'hot' : ''}"></i></div>
      <div class="note">${(used / 1024).toFixed(0)} KB of about 5 MB used${S.failing ? ' · <b class="dn">saving is failing</b>' : S.lastOk ? ' · last saved ' + fmtClock(S.lastOk) : ''}</div>
      <div class="row" style="gap:6px;margin:8px 0"><button class="btn sm" id="v13Snap">Back up now</button><button class="btn sm" id="v13Dl">Download full backup</button><button class="btn sm" id="v13Compact" title="Trims old equity samples, chat and very old trade history">Free up space</button></div>
      <table class="v13-snaps"><thead><tr><th>Backup</th><th class="r">Size</th><th></th></tr></thead><tbody>${S.snaps.length ? S.snaps.map((x) => `<tr><td>${esc(fmtStamp(x.ts))} <span class="note">${x.auto ? 'auto' : 'manual'}</span></td><td class="r num">${(x.size / 1024).toFixed(0)} KB</td><td class="r"><button class="btn sm" data-snap-dl="${x.ts}">Download</button> <button class="btn sm" data-snap-restore="${x.ts}">Restore</button></td></tr>`).join('') : '<tr><td colspan="3" class="note">No backups yet. The first one is made a minute after start-up.</td></tr>'}</tbody></table>
    </div></div>`;
  };
  S.bind = () => {
    const re = () => { if (curTab === 'set') renderSettings(); };
    const sn = $('#v13Snap'); if (!sn) return;
    sn.onclick = async () => { const n = await S.snapshot(false); toast(n ? 'Backup saved ✓' : 'Backup failed (is browser storage blocked?)', n ? 'up' : 'dn'); re(); };
    $('#v13Dl').onclick = S.download;
    $('#v13Compact').onclick = () => { S.compact(); saveState(); toast('Trimmed old history ✓', 'up'); re(); };
    $$('[data-snap-dl]').forEach((b) => { b.onclick = async () => { const r = await S.get(+b.dataset.snapDl); if (r) download('exterm-backup-' + new Date(r.ts).toISOString().slice(0, 16).replace(':', '') + '.json', JSON.stringify({ novaterm: 13, ts: r.ts, keys: r.keys }), 'application/json'); }; });
    $$('[data-snap-restore]').forEach((b) => { b.onclick = () => confirmClick(b, () => S.restore(+b.dataset.snapRestore).catch((e) => toast('Restore failed: ' + esc(e.message), 'dn'))); });
  };
  return S;
})();

/* ───────────── data health: what's live, what's simulated, what's stale ───────────── */
const DataHealth = (() => {
  const D = {};
  D.state = () => {
    const now = Date.now(), cryptoDemo = typeof Providers !== 'undefined' && Providers.active === Demo, stockDemo = typeof Stocks !== 'undefined' && Stocks.active === StockDemo;
    const age = Feed.lastTick ? now - Feed.lastTick : null, ocAge = OC.polled ? now - OC.polled : null;
    return {
      crypto: cryptoDemo ? 'simulated' : age == null ? 'connecting' : age > 45000 ? 'stale' : 'live', cryptoAge: age,
      stocks: stockDemo ? 'simulated' : 'live',
      onchain: OC.sim ? 'simulated' : ocAge != null && ocAge > 150000 && ST.mode === 'onchain' ? 'stale' : 'live', ocAge,
      launcher: !!J.proxy, bots: !!(Launcher.caps && Launcher.caps.bots), alerts: !!(Launcher.caps && Launcher.caps.alerts),
    };
  };
  const ago = (ms) => (ms < 90000 ? Math.round(ms / 1000) + 's' : Math.round(ms / 60000) + 'm');
  D.badge = () => {
    const pill = $('#srcPill'); if (!pill) return;
    let b = $('#staleBadge'); if (!b) { b = document.createElement('span'); b.id = 'staleBadge'; b.className = 'stale-badge'; b.hidden = true; pill.appendChild(b); }
    const s = D.state(); let txt = '';
    if (ST.mode === 'crypto' && s.crypto === 'stale') txt = `⏸ ${ago(s.cryptoAge)} old`;
    else if (ST.mode === 'onchain' && s.onchain === 'stale') txt = `⏸ ${ago(s.ocAge)} old`;
    b.hidden = !txt; b.textContent = txt; b.title = txt ? 'No fresh prices recently: the data source may be rate-limiting or offline. Numbers on screen may be out of date.' : '';
  };
  const row = (name, st, hint) => `<tr><td>${name}</td><td><span class="tag ${st === 'live' || st === true ? 'up' : st === 'simulated' || st === false ? 'amb' : 'dn'}">${st === true ? 'on' : st === false ? 'off' : st}</span></td><td class="note">${hint}</td></tr>`;
  D.panel = () => {
    const s = D.state();
    return `<div class="panel" id="v13Data"><h3>📡 Data status</h3><div class="pb"><table class="v13-data">
      ${row('Crypto prices', s.crypto, s.crypto === 'simulated' ? 'No exchange reachable from this page. Start the launcher.' : s.crypto === 'stale' ? 'No update for ' + ago(s.cryptoAge) + '. The exchange may be rate-limiting.' : esc(Providers.active.name))}
      ${row('US stocks', s.stocks, s.stocks === 'simulated' ? 'Yahoo Finance needs the launcher (browsers block it).' : esc(Stocks.active.name))}
      ${row('On-chain tokens', s.onchain, s.onchain === 'simulated' ? 'DEX APIs unreachable. Start the launcher.' : OC.gtCoolLeft && OC.gtCoolLeft() ? 'GeckoTerminal free limit hit: new lists pause ' + Math.ceil(OC.gtCoolLeft() / 1000) + 's, prices continue via DexScreener.' : 'GeckoTerminal + DexScreener' + (OC.rateHits ? ` (paced to ${OC.rpm}/min after ${OC.rateHits} rate limit${OC.rateHits > 1 ? 's' : ''})` : ''))}
      ${row('Launcher', s.launcher, s.launcher ? 'Running: live data proxy is on.' : 'Not running. Double-click start-exterm (.bat / .command / .sh).')}
      ${row('Background bots', s.bots, s.bots ? 'Bots can keep trading (paper) after you close this tab.' : 'Needs the launcher.')}
      ${row('Background alerts', s.alerts, s.alerts ? 'Alerts can reach Telegram / Discord.' : 'Needs the launcher.')}
      ${typeof DiskSync !== 'undefined' ? row('Saved to this computer', DiskSync.on && !DiskSync.err, '<span id="v13Disk">' + esc(DiskSync.status()) + '</span>') : ''}
    </table><button class="btn sm" id="v13Intro" style="margin-top:8px">${s.launcher ? 'Live Feed Diagnostics' : 'How to get live data'}</button>${typeof DiskSync !== 'undefined' && DiskSync.on ? ' <button class="btn sm" id="v13JnDl" style="margin-top:8px" title="Every logged trade kept on this computer (up to 20,000), as a spreadsheet">⬇ Full journal log (CSV)</button>' : ''}</div></div>`;
  };
  D.intro = (force) => {
    const s = D.state();
    if (!force && (ST.settings.liveIntroSeen || (s.launcher && s.crypto !== 'simulated' && s.stocks !== 'simulated'))) return;
    const ov = document.createElement('div'); ov.className = 'v13-modal'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Live data');
    const li = (ok, t) => `<li class="${ok ? 'ok' : 'no'}"><b>${ok ? '✓' : '✗'}</b> ${t}</li>`;
    ov.innerHTML = `<div class="v13-card"><h2>Get live data</h2>
      <p class="note">Some data sources block requests from a page opened straight from a file. Here's what works right now:</p>
      <ul class="v13-checks">${li(s.crypto !== 'simulated', 'Crypto prices')}${li(s.stocks !== 'simulated', 'US stocks')}${li(s.onchain !== 'simulated', 'On-chain tokens')}${li(s.launcher, 'Background bots &amp; alerts')}</ul>
      ${s.launcher ? '<p>The launcher is running, so everything that can be live is live.</p>' : `<p><b>Start the launcher</b> for live data everywhere. It's a small local helper that ships with ExTerm (no install, nothing leaves your computer except normal market-data requests):</p>
      <div class="v13-os"><div><b>Windows</b><span>Double-click <code>start-exterm.bat</code></span></div><div><b>Mac</b><span>Double-click <code>start-exterm.command</code></span></div><div><b>Linux</b><span>Run <code>./start-exterm.sh</code></span></div></div>
      <p class="note">Windows may show a blue "Windows protected your PC" box for the .bat file because it isn't code-signed. Click <b>More info → Run anyway</b>. You can read the file first: it's a short text script.</p>`}
      <div class="row" style="gap:8px;justify-content:flex-end"><label class="chk"><input type="checkbox" id="v13IntroNo" ${ST.settings.liveIntroSeen ? 'checked' : ''}> Don't show this again</label><button class="btn pri" id="v13IntroOk">Got it</button></div></div>`;
    document.body.appendChild(ov);
    const close = () => { ST.settings.liveIntroSeen = $('#v13IntroNo').checked; saveState(); ov.remove(); document.removeEventListener('keydown', esc_); };
    const esc_ = (e) => { if (e.key === 'Escape') close(); };
    $('#v13IntroOk').onclick = close; ov.onclick = (e) => { if (e.target === ov) close(); }; document.addEventListener('keydown', esc_);
    setTimeout(() => $('#v13IntroOk').focus(), 30);
  };
  return D;
})();

/* ───────────── heartbeat for background tabs ───────────── */
// Worker timers aren't subject to the main thread's background-tab throttling, so bot signals, stops and saves keep
// running roughly on time while you're in another tab. (Closing the tab still stops in-tab bots: use background bots.)
const BgTick = (() => {
  const T = { w: null, n: 0, hiddenRuns: 0 };
  T.start = () => {
    if (T.w) return;
    try { T.w = new Worker(URL.createObjectURL(new Blob(['setInterval(function(){postMessage(1)},1000)'], { type: 'text/javascript' }))); }
    catch (e) { T.w = null; return; }
    T.w.onmessage = () => {
      if (!document.hidden) return; // the normal 1-second loop handles a visible tab
      T.n++; T.hiddenRuns++;
      try {
        if (T.n % 2 === 0) botLoop();
        if (T.n % 15 === 0) sampleEquity();
        if (T.n % 10 === 0) saveState();
      } catch (e) { console.warn('background tick', e); }
    };
  };
  return T;
})();
