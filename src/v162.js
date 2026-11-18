/* Copyright (c) 2026 ExTerm Labs (@exterm.labs) · Licensed under GNU AGPL-3.0 · https://github.com/uexxx/ExTerm */
/* ExTerm v16.2 UI: launch safety briefing (every start), Max Daily Loss ($) auto-flatten, live-only workspace
   (body.live-bot-armed) and the MARKET CLOSED · LAST SESSION badge. Logic in V162 (v162core.js); routing, kill and the
   receipt ledger stay in V160UI. Strict CSP: listeners attached here, every dynamic string through esc(). */
const V162UI = (() => {
  const U = { tripped: false, briefShown: 0, armed: null };
  const $1 = (s, r) => (r || document).querySelector(s);
  const B = () => (typeof V160UI !== 'undefined' && V160UI.st ? V160UI : null);
  const isLive = () => { const b = B(); return !!(b && b.live()); };

  /* ══ 1. launch safety & critical updates briefing ══ */
  const closeBrief = () => { const m = $1('#v162Brief'); if (m) { m.remove(); document.removeEventListener('keydown', briefKey, true); if (U.prevFocus && U.prevFocus.focus) U.prevFocus.focus({ preventScroll: true }); } };
  const briefKey = (e) => {
    const m = $1('#v162Brief'); if (!m) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); safe(); }
    else if (e.key === 'Tab') { const f = [...m.querySelectorAll('button')]; const i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
  };
  /* Continue in Safe Mode = PAPER: an armed session is flattened and disarmed through the normal kill path */
  const safe = () => { closeBrief(); const b = B(); if (b && b.live()) b.kill('Launch briefing: continued in Safe Mode (PAPER)'); };
  const openBridge = () => { closeBrief(); const b = B(); if (b) b.openPanel(); };
  const brief = () => {
    closeBrief(); U.prevFocus = document.activeElement; U.briefShown++;
    const live = isLive(), m = document.createElement('div'); m.id = 'v162Brief'; m.className = 'v160-ov v162-ov'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-labelledby', 'v162BriefT');
    m.innerHTML = `<div class="v162-modal"><div class="v162-mh"><svg viewBox="0 0 24 24" aria-hidden="true" class="v162-ic"><path d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 12l2.5 2.5 4.5-5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg><div><h2 id="v162BriefT">Launch Safety &amp; Critical Updates</h2><span class="v162-mode ${live ? 'live' : 'paper'}">${live ? 'LIVE BOT ARMED' : 'PAPER'}</span></div></div>
      <section><h3>Zero-custody local routing</h3><p>ExTerm holds no funds and no keys. Live signals go only to a bot you run yourself on <code>127.0.0.1</code> (or an allow-listed private LAN host over HTTPS), signed per session and expiring after 3 seconds.</p></section>
      <section><h3>5-Point Live Safety Checklist</h3><ol class="v162-list">${V162.CHECKLIST.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></section>
      <section><h3>${esc(typeof V166 !== 'undefined' ? 'v16.6' : typeof V165 !== 'undefined' ? 'v16.5' : typeof V164 !== 'undefined' ? 'v16.4' : typeof V163 !== 'undefined' ? 'v16.3' : 'v16.2')} Release Highlights</h3><ul class="v162-list">${(typeof V166 !== 'undefined' ? V166.HIGHLIGHTS : typeof V165 !== 'undefined' ? V165.HIGHLIGHTS : typeof V164 !== 'undefined' ? V164.HIGHLIGHTS : typeof V163 !== 'undefined' ? V163.HIGHLIGHTS : V162.HIGHLIGHTS).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>
      <div class="v162-acts"><button type="button" class="btn pri" data-v162="safe">Continue in Safe Mode (PAPER)</button><button type="button" class="btn" data-v162="bridge">Open Execution Bridge &amp; Safety Settings</button></div>
      <p class="note">Esc continues in Safe Mode.${live ? ' Live routing is armed: Safe Mode flattens and disarms all six slots.' : ''}</p></div>`;
    m.addEventListener('click', (e) => { const b = e.target.closest('[data-v162]'); if (!b) return; if (b.dataset.v162 === 'safe') safe(); else openBridge(); });
    document.body.appendChild(m); document.addEventListener('keydown', briefKey, true);
    const f = $1('[data-v162="safe"]', m); if (f) f.focus({ preventScroll: true });
    return m;
  };

  /* ══ 2. Max Daily Loss ($) circuit breaker → CANCEL_ALL_AND_FLATTEN on every armed slot, then all six slots to PAPER ══ */
  const breaker = () => {
    const b = B(); if (!b) return false;
    if (!b.live()) { U.tripped = false; return false; }
    const cap = +b.st.caps.maxLoss, dl = b.dayLoss(); if (U.tripped || !V162.breached(dl, cap)) return false;
    U.tripped = true;
    b.led('breaker', { status: 'daily-loss', detail: `Max Daily Loss breached: session drawdown $${dl.toFixed(2)} ≥ cap $${cap}` });
    b.kill(`Max Daily Loss $${cap} breached`);
    lossAlert(dl, cap); return true;
  };
  const lossAlert = (dl, cap) => {
    const old = $1('#v162Loss'); if (old) old.remove();
    const m = document.createElement('div'); m.id = 'v162Loss'; m.className = 'v160-ov v162-ov'; m.setAttribute('role', 'alertdialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-labelledby', 'v162LossT');
    m.innerHTML = `<div class="v162-modal v162-alert"><div class="v162-mh"><svg viewBox="0 0 24 24" aria-hidden="true" class="v162-ic"><path d="M12 3l10 18H2z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 10v5M12 17.5v.5" stroke="currentColor" stroke-width="1.8"/></svg><h2 id="v162LossT">Daily-Loss Circuit Breaker Tripped</h2></div>
      <p>Session drawdown <b class="dn">$${esc(dl.toFixed(2))}</b> reached your Max Daily Loss of <b>$${esc(cap.toLocaleString('en-US'))}</b>.</p>
      <p><b>CANCEL_ALL_AND_FLATTEN</b> was broadcast to every armed local bot and all six slots are back to <b>PAPER</b>. The breach is in the Signed Signal Receipt Ledger.</p>
      <div class="v162-acts"><button type="button" class="btn pri" data-v162l="ok">Understood</button><button type="button" class="btn" data-v162l="ledger">Review Receipt Ledger</button></div></div>`;
    m.addEventListener('click', (e) => { const x = e.target.closest('[data-v162l]'); if (!x) return; m.remove(); if (x.dataset.v162l === 'ledger') { const b = B(); if (b) b.openPanel(); } });
    m.addEventListener('keydown', (e) => { if (e.key === 'Escape') m.remove(); });
    document.body.appendChild(m); const f = $1('[data-v162l="ok"]', m); if (f) f.focus({ preventScroll: true });
    try { toast('🛑 Max Daily Loss breached: flattened and disarmed', 'dn'); } catch (e) { /* toast not ready */ }
  };

  /* ══ 3. live-only workspace + daily-loss gauge ══ */
  const gauge = () => {
    const host = $1('#tab-port'); if (!host) return; let g = $1('#v162Gauge');
    if (!g) { g = document.createElement('div'); g.id = 'v162Gauge'; g.className = 'panel v162-gauge'; g.setAttribute('role', 'status'); host.insertBefore(g, host.firstChild); }
    const b = B(); if (!b || !b.live()) { g.hidden = true; return; }
    const G = V162.lossGauge(b.dayLoss(), b.st.caps.maxLoss), k = [G.used.toFixed(2), G.cap].join('|'); g.hidden = false; if (g._k === k) return; g._k = k;
    g.innerHTML = `<div class="pb"><span>Live session · Max Daily Loss ($)</span><meter min="0" max="100" low="60" high="85" optimum="0" value="${G.pct.toFixed(1)}" aria-label="Daily loss used"></meter><b class="num">$${esc(G.used.toFixed(2))} / $${esc(G.cap.toLocaleString('en-US'))}</b><span class="note">${G.left == null ? 'no cap set' : '$' + esc(G.left.toFixed(2)) + ' left before auto-flatten'}</span></div>`;
  };
  const learnBanner = (on) => {
    const w = $1('.lx-wrap'); let x = $1('#v162Learn');
    if (!on || !w) { if (x) x.remove(); return; }
    if (!x) { x = document.createElement('div'); x.id = 'v162Learn'; x.className = 'v162-learn'; x.setAttribute('role', 'status'); x.textContent = V162.LEARN_BANNER; }
    if (x.parentNode !== w) w.prepend(x);
  };
  const liveMode = () => { const on = isLive(); if (on !== U.armed) { U.armed = on; document.body.classList.toggle('live-bot-armed', on); } learnBanner(on); };

  /* ══ 4. MARKET CLOSED · LAST SESSION badge (US equities outside regular hours) ══ */
  const badge = () => {
    const src = $1('#srcPill'); if (!src || !src.parentNode) return; let el = $1('#v162Mkt');
    if (!el) { el = document.createElement('span'); el.id = 'v162Mkt'; el.className = 'pill v162-mkt'; el.textContent = 'MARKET CLOSED · LAST SESSION'; el.title = 'US regular session is closed: the chart shows the last session'; src.after(el); }
    const s = typeof ST !== 'undefined' ? ST.sel : '', stk = s && typeof isStock === 'function' && isStock(s);
    const fl = stk && typeof StockFeed !== 'undefined' ? StockFeed.session[s] : null, closed = stk && (fl === false || (fl == null && !V162.usOpen(Date.now())));
    el.hidden = !closed;
  };

  const tick = () => { try { liveMode(); breaker(); gauge(); badge(); } catch (e) { console.warn('v162', e); } };
  U.start = () => {
    tick(); setInterval(tick, 1000);
    /* automation runs skip the start-up modal so the regression suites can drive the page; the v16.2 suite opts back in */
    if (!navigator.webdriver) brief();
  };
  Object.assign(U, { brief, closeBrief, safe, breaker, lossAlert, liveMode, badge, gauge, tick });
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b162 = boot; boot = async function () { await _b162.apply(this, arguments); try { V162UI.start(); } catch (e) { console.warn('v162 init', e); } }; }
