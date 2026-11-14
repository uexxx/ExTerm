/* ExTerm DiskSync: everything the page saves is mirrored to this computer through the launcher
   (~/.exterm/state.json), and restored when the terminal opens. Browsers keep storage per address, so a new launcher
   port, a different browser profile or cleared site data used to look like a fresh install; now your settings,
   watchlists, bots, paper accounts, drawings, workspaces and the trade journal come back.
   Runs first in the bundle: restore() must finish before any other script reads localStorage.
   Never synced: API keys (stripped from the main state before saving, and blanked again by the launcher) and
   chart snapshots in the journal (kept in this browser only, they're large). */
const DiskSync = (() => {
  const D = { on: false, restored: false, synced: false, busy: false, again: false, err: '', last: 0, disk: null, journal: [], fails: 0 };
  const MAIN = 'novaterm.v1', AT = 'nt.savedAt', SKIP = new Set(['nt.gtCool', AT]);
  const OWN = (k) => k === MAIN || /^(nt\.|novaterm)/.test(k);
  const tok = () => { const m = document.querySelector('meta[name="nt-token"]'); return m ? m.content : ''; };
  const sent = new Map(), jDirty = new Map(), jDel = new Set();
  let jClear = false, timer = 0, firstDirty = 0;
  D.available = () => !!tok() && /^https?:$/.test(location.protocol);
  D.lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };

  /* 1. restore (synchronous on purpose: one small request to the launcher on this computer, before the app reads storage) */
  D.restore = () => {
    if (!D.available()) return false;
    try {
      const x = new XMLHttpRequest(); x.open('GET', '/api/state', false); x.setRequestHeader('X-ExTerm', tok()); x.send();
      if (x.status !== 200) { D.err = x.status === 503 ? 'off in the launcher' : 'HTTP ' + x.status; return false; }
      const j = JSON.parse(x.responseText || '{}'); D.on = true;
      D.disk = { savedAt: +j.savedAt || 0, keys: j.keys && typeof j.keys === 'object' ? Object.keys(j.keys).length : 0, journal: +j.journalTotal || 0 };
      D.journal = Array.isArray(j.journal) ? j.journal : [];
      const localAt = +D.lsGet(AT) || 0, hasLocal = !!D.lsGet(MAIN);
      if (j.keys && typeof j.keys === 'object' && D.disk.keys && (D.disk.savedAt > localAt || !hasLocal)) {
        let n = 0;
        for (const [k, v] of Object.entries(j.keys)) if (OWN(k) && !SKIP.has(k) && typeof v === 'string' && v.length < 8e6) { try { localStorage.setItem(k, v); n++; } catch (e) { D.err = 'browser storage is full'; } }
        try { localStorage.setItem(AT, String(D.disk.savedAt)); } catch (e) { /* full */ }
        D.restored = n > 0; D.restoredKeys = n;
      }
      return D.restored;
    } catch (e) { D.err = String(e.message || e).slice(0, 120); return false; }
  };

  /* 2. save: only what changed since the last save (the first save after opening mirrors everything) */
  const collect = () => {
    const cur = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (OWN(k) && !SKIP.has(k)) cur[k] = localStorage.getItem(k); } } catch (e) { /* blocked */ }
    const changed = {}, removed = [];
    for (const [k, v] of Object.entries(cur)) if (sent.get(k) !== v) changed[k] = v;
    for (const k of sent.keys()) if (!(k in cur)) removed.push(k);
    return { cur, changed, removed };
  };
  const noSnap = (e) => { const o = Object.assign({}, e); delete o.snap; return o; };
  D.pending = () => { const c = collect(); return Object.keys(c.changed).length + c.removed.length + jDirty.size + jDel.size + (jClear ? 1 : 0) + (D.synced ? 0 : 1); };
  D.push = async (keepalive) => {
    if (!D.on || D.stop) return false;
    if (D.busy) { D.again = true; return false; }
    const { cur, changed, removed } = collect(), full = !D.synced;
    const ups = [...jDirty.values()], dels = [...jDel], clr = jClear;
    if (!full && !Object.keys(changed).length && !removed.length && !ups.length && !dels.length && !clr) return true;
    if (Object.keys(changed).length || removed.length) { try { localStorage.setItem(AT, String(Date.now())); } catch (e) { /* full */ } }
    const body = JSON.stringify({ full, keys: full ? cur : changed, removed: full ? [] : removed, journal: ups.map(noSnap), journalDel: dels, journalClear: clr, savedAt: +D.lsGet(AT) || Date.now() });
    if (keepalive && body.length > 60000) return false; // the browser caps requests sent while the page closes
    D.busy = true;
    try {
      const r = await fetch('/api/state', { method: 'POST', keepalive: !!keepalive, cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-ExTerm': tok() }, body });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
      if (full) sent.clear();
      for (const k of removed) sent.delete(k);
      for (const [k, v] of Object.entries(full ? cur : changed)) sent.set(k, v);
      for (const e of ups) if (jDirty.get(e.id) === e) jDirty.delete(e.id);
      for (const id of dels) jDel.delete(id);
      if (clr) jClear = false;
      D.synced = true; D.last = Date.now(); D.err = ''; D.fails = 0; D.summary = j;
      return true;
    } catch (e) {
      D.err = String(e.message || e).slice(0, 120); D.fails++;
      return false;
    } finally {
      D.busy = false;
      if (D.again) { D.again = false; D.touch(); }
    }
  };
  // debounce: save 1.5 s after the last change, but at least every 8 s while changes keep coming; back off on errors
  D.touch = () => {
    if (!D.on) return;
    const now = Date.now(); if (!firstDirty) firstDirty = now;
    clearTimeout(timer);
    const wait = D.fails ? Math.min(60000, 2000 * 2 ** Math.min(5, D.fails)) : Math.max(0, Math.min(1500, 8000 - (now - firstDirty)));
    timer = setTimeout(() => { firstDirty = 0; D.push(); }, wait);
  };

  /* 3. wire up after boot: journal merge + change tracking */
  D.start = async () => {
    if (!D.on) return;
    if (typeof Journal !== 'undefined') {
      try { await (Journal.initP || Journal.init()); } catch (e) { /* journal unavailable */ }
      const onDisk = new Set(D.journal.map((e) => e && e.id));
      D.merged = Journal.merge(D.journal, D.restored);
      for (const e of Journal.entries) if (!onDisk.has(e.id)) jDirty.set(e.id, e); // trades this browser has that the disk copy lacks
      Journal.onChange = (op, x) => {
        if (op === 'put') { jDirty.set(x.id, x); jDel.delete(x.id); }
        else if (op === 'del') { jDirty.delete(x); jDel.add(x); }
        else if (op === 'clear') { jDirty.clear(); jDel.clear(); jClear = true; }
        D.touch();
      };
      D.journal = []; // merged: free the memory
      if (D.merged && typeof curTab !== 'undefined' && curTab === 'journal' && Journal.render) Journal.render();
    }
    if (typeof saveState === 'function') { const prev = saveState; saveState = function () { const r = prev.apply(this, arguments); D.touch(); return r; }; }
    setInterval(() => { if (!D.busy) D.push(); }, 20000); // other modules (layouts, builder, challenge…) write storage directly
    addEventListener('pagehide', () => { D.push(true); }); // what is already in storage (saveState runs on every change)
    document.addEventListener('visibilitychange', () => { if (document.hidden) D.push(); });
    await D.push();
    if (D.restored && typeof toast === 'function') toast(`Restored your terminal from this computer (saved ${new Date(D.disk.savedAt).toLocaleString()}) ✓`, 'up');
  };
  // "Reset everything" in Settings: mirror the storage without the main state now, before the page reloads
  D.forgetMain = async () => { if (!D.on) return; D.synced = false; D.stop = false; for (let i = 0; i < 20 && D.busy; i++) await new Promise((r) => setTimeout(r, 100)); await D.push(); D.stop = true; };
  D.status = () => (!D.available() ? 'Open ExTerm with the launcher to save to this computer.' : !D.on ? 'Not available: ' + (D.err || 'launcher too old') : D.err ? 'Last save failed: ' + D.err + ' (retrying)' : D.last ? 'Saved ' + new Date(D.last).toLocaleTimeString() + (D.summary ? ` · ${D.summary.keys} items, ${D.summary.journal} journal entries on disk` : '') : 'Connecting…');
  D.restore();
  return D;
})();
