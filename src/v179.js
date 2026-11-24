/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v17.9 UI (maths in V179 + the launcher's Lanes 9–19). Listeners only, text through textContent, strict CSP; 4-tab rail kept.
   · candles  every 1s–1M timeframe pill asks Lane 9 (crypto / DEX) or Lane 10 (US equities) first; only real, warm, deep-enough
              answers replace the existing loader (offline samples never touch the chart)
   · picks    Co-Pilot / Paper → ◆ Picks drawer: Lane 16 recommendations (S-TIER 92–100 / A / B+ / Watchlist), 6-bot consensus,
              1,000-path Monte Carlo verdict and Passed / Pending / Failed criteria badges; never empty
   · strip    24/7 Optional Live Bot → one tabular-nums execution / firewall telemetry strip (Lanes 17–19), PIN-gated PAPER | LIVE
              switch (the Arm wizard stays locked until LIVE is unlocked with the PIN) and FLATTEN ALL (Shift+Esc)
   · orders   every ticket order → Lane 18 firewall (LIVE orders that fail are blocked, PAPER orders get the report), Lane 19
              SHA-256 audit ledger, Lane 17 RAM-only shadow brackets checked on live ticks */
const V179UI = (() => {
  const U = { mounted: false, ver: '17.9', mode: 'PAPER', pinSet: false, tele: {}, candles: { asked: 0, used: 0, fell: 0, last: null }, orders: 0, blocked: 0, warned: 0 };
  const $1 = (s, r) => (r || document).querySelector(s), $$1 = (s, r) => [...(r || document).querySelectorAll(s)];
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const escT = (s) => (typeof esc === 'function' ? esc(String(s)) : String(s).replace(/[&<>"']/g, ''));
  const T = (m, k) => { if (typeof toast === 'function') toast(escT(m), k); };
  const tab = () => (typeof curTab !== 'undefined' ? curTab : 'markets');
  const sel = () => (typeof ST !== 'undefined' && ST.sel) || '';
  const tok = () => { try { if (typeof J !== 'undefined' && J.token) return J.token(); } catch (e) { /* no helper */ } const m = document.querySelector('meta[name="exterm-token"]'); return m ? m.content : ''; };
  const api = async (path, body, ms) => { const c = new AbortController(), tm = setTimeout(() => c.abort(), ms || 4000); try { const r = await fetch(path, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: Object.assign({ 'X-ExTerm': tok() }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined, signal: c.signal }); const j = await r.json(); if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status); return j; } finally { clearTimeout(tm); } };
  U.api = api;

  /* ══ 1. Lane 9 / 10 candles behind every timeframe pill ══ */
  const Candles = U.candlesWrap = {
    wrap() {
      if (typeof TFX === 'undefined' || !TFX.candles || TFX._x179) return; TFX._x179 = true; const orig = TFX.candles.bind(TFX);
      TFX.candles = async function (sym, tf, n) {
        const ln = V179.candleLane(sym, tf), name = V179.tfOf(tf);
        if (ln && name) {
          U.candles.asked++;
          try {
            const last = typeof chart !== 'undefined' && chart && chart.data && chart.data.length ? chart.data[chart.data.length - 1].c : 0;
            const j = await api('/api/lane' + ln + '/candles?sym=' + encodeURIComponent(sym) + '&tf=' + name + '&px=' + (+last || 0), null, 250);
            U.candles.last = { sym, tf: name, n: (j.rows || []).length, src: j.src, sample: !!j.sample, warming: !!j.warming };
            if (V179.accept(j, n)) { U.candles.used++; const c = V179.toCandles(j.rows).slice(-(n || 300)); c.src = 'Lane ' + ln + ' · ' + j.src; return c; }
          } catch (e) { /* lane busy / launcher absent: the existing loader answers */ }
          U.candles.fell++;
        }
        return orig(sym, tf, n);
      };
    },
  };

  /* ══ 2. ◆ Picks drawer (Lane 16) ══ */
  const Picks = U.picks = {
    open: false, data: null, at: 0, err: '',
    mount() {
      const bar = $1('#tab-markets .toolbar'); if (!bar || $1('#x179PickB')) return;
      const b = el('button', 'btn sm x178-trkb', '◆ Picks'); b.type = 'button'; b.id = 'x179PickB'; b.title = '24/7 recommendations: Lanes 11–16 (scanners → consensus → Monte Carlo → confluence)'; b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', 'x179Picks');
      const tb = $1('#x178TrkB', bar); if (tb) tb.after(b); else bar.appendChild(b);
      const d = el('aside', 'x178-trk x179-picks'); d.id = 'x179Picks'; d.hidden = true; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', '24/7 recommendations');
      const hd = el('div', 'x178-th'); const t = el('b', null, '24/7 Picks · Lanes 11–16'); const src = el('span', 'x178-src mono'); src.id = 'x179PickSrc'; const x = el('button', 'btn xs ghost', '✕'); x.type = 'button'; x.dataset.x179a = 'close'; x.setAttribute('aria-label', 'Close picks'); hd.append(t, src, x);
      const tiers = el('div', 'x178-subs x179-tiers'); tiers.id = 'x179Tiers'; const body = el('div', 'x178-tb'); body.id = 'x179PickBody'; d.append(hd, tiers, body); document.body.appendChild(d);
      b.addEventListener('click', () => this.toggle());
      d.addEventListener('click', (e) => { const a = e.target.closest('[data-x179a]'); if (!a) return; if (a.dataset.x179a === 'close') this.toggle(false); else if (a.dataset.x179a === 'load') { try { setMode(a.dataset.ctx, a.dataset.v); if (typeof V177UI !== 'undefined') V177UI.go('copilot'); } catch (x2) { T('Could not load ' + a.dataset.v, 'amb'); } } });
    },
    toggle(on) { const d = $1('#x179Picks'), b = $1('#x179PickB'); if (!d) return; this.open = on == null ? d.hidden : !!on; d.hidden = !this.open; if (b) b.setAttribute('aria-expanded', String(this.open)); if (this.open) this.refresh(true); },
    async refresh(force) { if (!force && Date.now() - this.at < 3000) return; this.at = Date.now(); try { const t0 = performance.now(); this.data = await api('/api/lane16/recs'); this.ms = performance.now() - t0; this.err = ''; } catch (e) { this.err = 'Picks need the ExTerm launcher (serve.py): ' + e.message; } if (this.open) this.paint(); },
    paint() {
      const body = $1('#x179PickBody'); if (!body) return; body.textContent = ''; const D = this.data, rows = (D && D.rows) || [];
      $1('#x179PickSrc').textContent = D ? (D.sample ? 'SAMPLE · offline launcher' : 'LIVE') + ' · ' + rows.length + ' picks · journal ' + (D.journal || 0) : '';
      const tg = $1('#x179Tiers'); tg.textContent = ''; for (const t of V179.TIERS) tg.appendChild(el('span', 'x179-tier ' + V179.tierCls(t), t + ' ' + ((D && D.tiers && D.tiers[t]) || 0)));
      if (!rows.length) { body.appendChild(el('p', 'note', this.err || 'Warming the scanners…')); return; }
      for (const r of rows) {
        const c = el('div', 'x179-pick'); const h = el('div', 'x179-ph');
        h.append(el('span', 'x179-tier ' + V179.tierCls(r.tier), r.tier + ' ' + r.tierScore), el('b', 'mono', r.mkt === 'onchain' ? (r.name || r.sym.split(':')[2].slice(0, 8) + '…') : r.sym), el('span', r.side === 'buy' ? 'up' : 'dn', r.side.toUpperCase()), el('span', null, r.setup));
        const ld = el('button', 'btn xs', 'Load'); ld.type = 'button'; ld.dataset.x179a = 'load'; ld.dataset.v = r.sym; ld.dataset.ctx = r.mkt === 'stocks' ? 'stocks' : r.mkt === 'onchain' ? 'onchain' : 'crypto'; h.appendChild(ld);
        const mc = r.mc || {}, m = el('div', 'x179-pm num'); m.textContent = 'consensus ' + (r.consensus != null ? r.consensus.toFixed(2) : '–') + ' · ' + (r.agree || 0) + '/6 bots · MC P(TP) ' + (mc.pTP != null ? (mc.pTP * 100).toFixed(0) + '%' : '–') + ' · EV ' + (mc.evR != null ? mc.evR.toFixed(2) + 'R' : '–') + ' · slip ' + (mc.slipPct != null ? mc.slipPct.toFixed(2) + '%' : '–') + ' · MTF ' + (r.mtf || '–') + (r.journalWin != null ? ' · journal ' + r.journalWin + '% (' + r.journalN + ')' : '');
        const bd = el('div', 'x179-badges'); for (const [n, s] of r.criteria || []) bd.appendChild(el('span', 'x179-b ' + V179.badgeCls(s), V179.BADGE[s] + ' ' + n));
        c.append(h, m, bd); body.appendChild(c);
      }
    },
  };

  /* ══ 3. Live Bot telemetry strip + PIN-gated PAPER | LIVE + FLATTEN ALL ══ */
  const Strip = U.strip = {
    mount() {
      const s = $1('#tab-fleet'); if (!s || $1('#x179Strip')) return; const ctl = $1('#x177Ctl', s); if (!ctl) return;
      const st = el('div', 'x179-strip'); st.id = 'x179Strip'; st.setAttribute('role', 'status'); st.setAttribute('aria-live', 'off');
      const cells = el('div', 'x179-cells'); cells.id = 'x179Cells'; for (const [k] of V179.strip({})) { const c = el('span', 'x179-c'); c.dataset.x179k = k; c.append(el('i', null, k), el('b', null, '–')); cells.appendChild(c); }
      const sw = el('div', 'x179-sw'); sw.setAttribute('role', 'radiogroup'); sw.setAttribute('aria-label', 'Execution mode'); for (const m of ['PAPER', 'LIVE']) { const b = el('button', 'x179-m', m); b.type = 'button'; b.dataset.x179m = m; b.setAttribute('role', 'radio'); sw.appendChild(b); }
      const pin = el('input', 'in x179-pin'); pin.id = 'x179Pin'; pin.type = 'password'; pin.inputMode = 'numeric'; pin.autocomplete = 'off'; pin.maxLength = 12; pin.placeholder = 'PIN'; pin.setAttribute('aria-label', 'PIN (4–12 digits)');
      const setp = el('button', 'btn xs ghost', 'Set PIN'); setp.type = 'button'; setp.id = 'x179SetPin';
      const flat = el('button', 'btn xs x179-flat', '⏻ FLATTEN ALL'); flat.type = 'button'; flat.id = 'x179Flat'; flat.title = 'Close every position, cancel every order, stop every bot (Shift+Esc)';
      const msg = el('span', 'x179-msg'); msg.id = 'x179Msg';
      st.append(cells, sw, pin, setp, flat, msg); ctl.after(st);
      sw.addEventListener('click', (e) => { const b = e.target.closest('[data-x179m]'); if (b) this.setMode(b.dataset.x179m); });
      setp.addEventListener('click', () => this.setPin());
      flat.addEventListener('click', () => this.flatten());
      pin.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.setMode('LIVE'); });
      /* the 5-step Arm wizard opens only after LIVE was unlocked with the PIN (capture phase: before the v17.7 handler) */
      const arm = $1('#x177Arm'); if (arm && !arm._x179) { arm._x179 = true; arm.addEventListener('click', (e) => { const m = (typeof V17App !== 'undefined' && V17App.cfg && V17App.cfg.mode) || 'paper'; if (m !== 'live' && U.mode !== 'LIVE') { e.stopImmediatePropagation(); e.preventDefault(); this.say('Unlock LIVE with your PIN first (PAPER | LIVE switch)', true); T('Unlock LIVE with your PIN first', 'amb'); } }, true); }
      this.paint();
    },
    say(m, bad) { const e = $1('#x179Msg'); if (e) { e.textContent = m; e.classList.toggle('bad', !!bad); } },
    async setPin() { const p = ($1('#x179Pin') || {}).value || ''; if (!V179.pinOk(p)) return this.say('PIN must be 4–12 digits', true); try { await api('/api/lane18/pin', { pin: p }); U.pinSet = true; $1('#x179Pin').value = ''; this.say('PIN saved (PBKDF2, on this computer only) · mode PAPER'); } catch (e) { this.say(e.message, true); } this.poll(); },
    async setMode(m) {
      if (m === U.mode) return; const pin = $1('#x179Pin');
      if (m === 'LIVE' && !V179.pinOk(pin && pin.value)) { this.say(U.pinSet ? 'Enter your PIN to unlock LIVE' : 'Set a PIN first (4–12 digits)', true); if (pin) pin.focus(); return; }
      try { const j = await api('/api/lane18/arm', { mode: m, pin: m === 'LIVE' ? pin.value : '' }); U.mode = j.out.mode; if (pin) pin.value = ''; this.say(U.mode === 'LIVE' ? 'LIVE unlocked: the Arm wizard is now available' : 'PAPER: simulated fills only'); if (U.mode === 'PAPER' && typeof V17App !== 'undefined' && V17App.cfg && V17App.cfg.mode === 'live') { const b = $1('[data-x17f="mode"][data-v="paper"]'); if (b) b.click(); } } catch (e) { this.say(e.message, true); }
      this.paint();
    },
    flatten() { try { if (typeof V171UI !== 'undefined' && V171UI.flattenAll) V171UI.flattenAll(); U.flattened = (U.flattened || 0) + 1; api('/api/lane19/order', { id: 'flatten-' + Date.now(), sym: '*', side: 'flatten', type: 'FLATTEN_ALL', mode: U.mode }).catch(() => {}); } catch (e) { T('Flatten failed: ' + e.message, 'amb'); } },
    async poll() {
      try {
        const [a, b, c] = await Promise.all([api('/api/lane17/status'), api('/api/lane18/status'), api('/api/lane19/status')]);
        U.mode = b.out.mode; U.pinSet = b.out.pinSet; const f = (typeof V178UI !== 'undefined' && V178UI.fast) || [], l17 = f.find((x) => x.lane === 17) || {};
        Object.assign(U.tele, { mode: U.mode, brackets: a.brackets, avgBps: c.avgBps, ledgerN: c.ledger && c.ledger.n, ledgerOk: c.ledger && c.ledger.ok, routeMs: U.tele.routeMs != null ? U.tele.routeMs : l17.callP50, lock: typeof V178UI !== 'undefined' && V178UI.lock.on });
      } catch (e) { /* launcher absent */ }
      this.paint();
    },
    paint() {
      const cells = $1('#x179Cells'); if (!cells) return; for (const [k, v] of V179.strip(U.tele)) { const c = $1(`[data-x179k="${k}"] b`, cells); if (c && c.textContent !== v) c.textContent = v; const p = c && c.parentElement; if (p) p.classList.toggle('bad', (k === 'MODE' && v === 'LIVE') || (k === 'FEED' && v !== 'LIVE') || (k === 'LEDGER' && /BROKEN/.test(v))); }
      for (const b of $$1('[data-x179m]')) { const on = b.dataset.x179m === U.mode; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
      const sp = $1('#x179SetPin'); if (sp) sp.textContent = U.pinSet ? 'Change PIN' : 'Set PIN';
    },
  };

  /* ══ 4. ticket orders → Lane 18 firewall · Lane 19 ledger · Lane 17 shadow brackets ══ */
  const Orders = U.ordersHook = {
    req() {
      const s = sel(), p0 = typeof px === 'function' ? px(s) : (typeof chart !== 'undefined' && chart && chart.data.length ? chart.data[chart.data.length - 1].c : 0);
      const usd = typeof tkAmount === 'function' ? tkAmount() : 0, atr = (typeof V178UI !== 'undefined' && V178UI.pipe.atr.v) || p0 * 0.01;
      const eq = typeof ACC !== 'undefined' && ACC.equity ? (typeof ACC.equity === 'function' ? ACC.equity() : ACC.equity) : 10000, age = typeof V178UI !== 'undefined' ? V178UI.lock.age / 1000 : 0;
      return V179.checkReq({ sym: s, usd, px: p0, atr, equity: eq, feedAgeSec: age });
    },
    after(id, rq) {
      const side = typeof tkSide !== 'undefined' ? tkSide : 'buy', type = typeof tkType !== 'undefined' ? tkType : 'market';
      api('/api/lane19/order', { id, sym: rq.sym, side, usd: rq.usd, type, mode: U.mode, verdict: U.lastVerdict || 'n/a' }).then((j) => { U.ledger = j.out.ledger; }).catch(() => {});
      const fillPx = typeof px === 'function' ? px(rq.sym) : rq.px; api('/api/lane19/fill', { id, sym: rq.sym, side, expected: rq.px, fill: fillPx, qty: rq.px ? rq.usd / rq.px : 0, mode: U.mode }).then((j) => { U.tele.avgBps = j.out.avgBps; }).catch(() => {});
      const slp = parseFloat(($1('#tkSl') || {}).value) / 100 || 0, tpp = parseFloat(($1('#tkTp') || {}).value) / 100 || 0, s = side === 'sell' ? -1 : 1;
      if ((slp || tpp) && rq.px > 0) api('/api/lane17/bracket', { id, sym: rq.sym, side, sl: slp ? rq.px * (1 - s * slp) : 0, tp: tpp ? rq.px * (1 + s * tpp) : 0, qty: rq.usd / rq.px }).then(() => { U.tele.brackets = (U.tele.brackets || 0) + 1; }).catch(() => {});
      api('/api/lane17/route', { sym: rq.sym, usd: rq.usd, px: rq.px, liq: 5e6 }).then((j) => { U.tele.best = j.out.best; U.tele.routeMs = j.ms; U.route = j.out; }).catch(() => {});
    },
    wrap() {
      if (typeof submitOrder !== 'function' || submitOrder._x179) return; const o = submitOrder;
      submitOrder = function () { // eslint-disable-line no-func-assign
        const self = this, args = arguments, rq = Orders.req(), id = 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); U.orders++;
        if (U.mode !== 'LIVE') { // PAPER: the order goes through synchronously, exactly as before; the firewall report follows
          const r = o.apply(self, args); api('/api/lane18/check', rq).then((j) => { U.lastVerdict = j.out.verdict; U.tele.allow = (U.tele.allow || 0) + (j.out.ok ? 1 : 0); U.tele.block = (U.tele.block || 0) + (j.out.ok ? 0 : 1); if (!j.out.ok) { U.warned++; const f = j.out.checks.filter((c) => c.state === 'fail').map((c) => c.name).join(', '); T('Firewall (PAPER, not blocked): ' + f, 'amb'); } }).catch(() => {}); Orders.after(id, rq); return r;
        }
        api('/api/lane18/check', rq, 1500).then((j) => { // LIVE: nothing is sent until Lane 18 says ALLOW
          U.lastVerdict = j.out.verdict; const g = V179.gate('LIVE', j.out.verdict);
          if (g === 'block') { U.blocked++; U.tele.block = (U.tele.block || 0) + 1; const f = j.out.checks.filter((c) => c.state === 'fail').map((c) => c.name + ' (' + c.detail + ')').join(', '); T('Firewall BLOCKED this LIVE order: ' + f, 'amb'); return; }
          U.tele.allow = (U.tele.allow || 0) + 1; o.apply(self, args); Orders.after(id, rq);
        }, () => { U.blocked++; T('Firewall unreachable: LIVE order not sent', 'amb'); });
      };
      submitOrder._x179 = true; submitOrder._x178 = o._x178;
    },
    async ticks() { if (!(U.tele.brackets > 0)) return; const s = sel(), p = typeof px === 'function' ? px(s) : 0; if (!(p > 0)) return; try { const j = await api('/api/lane17/tick', { sym: s, px: p }); U.tele.brackets = j.out.open; for (const h of j.out.triggered || []) T('Shadow bracket ' + h.exit + ' hit at ' + h.px + ' (IOC exit)', 'amb'); } catch (e) { /* launcher absent */ } },
  };

  /* ══ boot ══ */
  const tick = () => { try { Candles.wrap(); Picks.mount(); Strip.mount(); Orders.wrap(); if (tab() === 'fleet') Strip.paint(); } catch (e) { console.warn('v179', e); } };
  U.start = () => {
    if (U.mounted) return; U.mounted = true; document.body.classList.add('x179'); tick(); Strip.poll();
    setInterval(tick, 1000); setInterval(() => { if (tab() === 'fleet') Strip.poll(); Orders.ticks(); }, 1500); setInterval(() => { if (Picks.open) Picks.refresh(); }, 4000);
  };
  U.tick = tick;
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b179 = boot; boot = async function () { await _b179.apply(this, arguments); try { V179UI.start(); } catch (e) { console.warn('v179 init', e); } }; }
