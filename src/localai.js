/* ExTerm launcher features: local AI (Ollama through the launcher, no CORS setup) and background price alerts
   (the launcher keeps watching after the tab is closed and messages you on Telegram / Discord).
   Both need the Python launcher; the page detects them and hides the controls when they're missing. */
const Launcher = (() => {
  const L = { caps: null, models: [], bg: null, syncT: 0, lastSync: '', seenHits: new Set() };
  L.detect = async () => {
    if (!J.proxy) { L.caps = { alerts: false, ollama: false }; return L.caps; }
    try { L.caps = await J.get('/api/caps', { timeout: 3000 }); } catch (e) { L.caps = { alerts: false, ollama: false }; }
    if (L.caps.ollama) { try { const t = await J.get('/ollama/api/tags', { timeout: 4000 }); L.models = ((t && t.models) || []).map((m) => String(m.name || '').replace(/[^A-Za-z0-9_.:\/-]/g, '').slice(0, 60)).filter(Boolean).slice(0, 30); } catch (e) { L.models = []; } }
    return L.caps;
  };
  L.useLocal = (model) => {
    const m = model && L.models.includes(model) ? model : L.models[0] || 'llama3.1';
    Object.assign(ST.ai, { preset: 'ollamab', base: '/ollama/v1', model: m, key: '' }); saveState();
    toast(`Copilot now uses <b>${esc(m)}</b> on your computer. Nothing leaves your machine.`, 'up', 6000);
    if (typeof renderAI === 'function' && curTab === 'ai') renderAI();
  };
  // banner shown in the AI tab when a local model is available but not in use
  L.aiBanner = () => {
    if (!L.caps || !L.caps.ollama || ST.ai.preset === 'ollamab') return '';
    return `<div class="la-banner"><b>🖥 Local AI found</b><span>Ollama is running on this computer${L.models.length ? ' with ' + L.models.length + ' model' + (L.models.length > 1 ? 's' : '') : ''}. Use it for free, private Copilot answers.</span>${L.models.length > 1 ? `<select class="in sm" id="laModel" aria-label="Local model">${L.models.map((m) => `<option>${esc(m)}</option>`).join('')}</select>` : ''}<button type="button" class="btn sm pri" id="laUse">Use local AI</button></div>`;
  };
  L.bindBanner = () => { const b = $('#laUse'); if (b) b.onclick = () => L.useLocal(($('#laModel') || {}).value); };

  /* ---- background alerts ---- */
  L.bgOn = () => !!(L.caps && L.caps.alerts && ST.settings.bgAlerts);
  const payload = () => (ST.alerts || []).filter((a) => a && a.sym && a.price > 0).slice(0, 50).map((a) => ({ id: String(a.id || NT.uid()).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || NT.uid(), sym: a.sym, dir: a.dir, price: +a.price, active: !!a.active, note: a.note || '' }));
  L.sync = async (force) => {
    if (!L.bgOn()) return false;
    for (const a of ST.alerts || []) if (!a.id) a.id = NT.uid();
    const body = JSON.stringify(payload()); if (!force && body === L.lastSync) return true;
    try { await J.post('/api/alerts', { alerts: payload() }, { timeout: 6000 }); L.lastSync = body; return true; } catch (e) { console.warn('alert sync', e.message); return false; }
  };
  L.queueSync = () => { clearTimeout(L.syncT); L.syncT = setTimeout(() => L.sync(), 800); };
  L.poll = async () => {
    if (!L.bgOn()) return;
    try {
      const r = await J.get('/api/alerts', { timeout: 6000 }); L.bg = r;
      for (const h of r.hits || []) {
        const k = h.id + ':' + h.ts; if (L.seenHits.has(k)) continue; L.seenHits.add(k);
        const a = (ST.alerts || []).find((x) => x.id === h.id); if (a && a.active) { a.active = false; a.hitAt = h.ts; saveState(); }
        if (Date.now() - h.ts < 10 * 60000 && a) toast(`🔔 <b>${esc(baseOf(h.sym))}</b> ${esc(h.dir)} ${NT.fmtPrice(h.price)} (now ${NT.fmtPrice(h.at)}) · caught by the launcher${(h.sent || []).length ? ', sent to ' + esc(h.sent.join(' + ')) : ''}`, 'amb', 10000);
      }
    } catch (e) { /* launcher gone */ }
  };
  L.settingsHTML = () => {
    if (!L.caps) return '';
    if (!L.caps.alerts) return `<div class="panel"><h3>🔔 Background alerts</h3><div class="pb note">Start ExTerm with the launcher (start-exterm.bat / .command / .sh) to keep alerts running after you close this tab and get them on Telegram or Discord.</div></div>`;
    const b = L.bg || {};
    return `<div class="panel" id="bgPanel"><h3>🔔 Background alerts <span class="sp"></span><label class="chk"><input type="checkbox" id="bgOn" ${ST.settings.bgAlerts ? 'checked' : ''}> Watch my alerts even when this tab is closed</label></h3><div class="pb">
      <p class="note">The launcher checks your price alerts every 20 seconds while its window is open, and messages you when one hits. Your bot token and webhook are saved only on this computer (~/.exterm, owner-only).</p>
      <form id="bgForm" class="bg-grid" autocomplete="off"><label class="f">Telegram bot token<input class="in mono" id="bgTg" placeholder="${esc(b.tgToken || '123456:ABC…  from @BotFather')}" spellcheck="false"></label><label class="f">Telegram chat ID<input class="in mono" id="bgChat" placeholder="${esc(b.tgChat || 'e.g. 123456789')}" spellcheck="false"></label>
      <label class="f" style="grid-column:1/-1">Discord webhook URL<input class="in mono" id="bgDc" placeholder="${esc(b.discord || 'https://discord.com/api/webhooks/…')}" spellcheck="false"></label>
      <div class="row" style="gap:8px;grid-column:1/-1"><button class="btn pri" type="submit">Save</button><button class="btn" type="button" id="bgTest" ${b.telegram || b.discord ? '' : 'disabled'}>Send test message</button><button class="btn ghost" type="button" id="bgClear">Remove saved details</button><span class="note" id="bgMsg">${b.error ? '⚠ ' + esc(b.error) : (b.alerts || []).filter((a) => a.active).length + ' alert(s) being watched'}</span></div></form></div></div>`;
  };
  L.bindSettings = () => {
    const on = $('#bgOn'); if (!on) return;
    on.onchange = async (e) => { ST.settings.bgAlerts = e.target.checked; saveState(); if (e.target.checked) { await L.sync(true); toast('Background alerts on. Keep the launcher window open.', 'up'); } else { try { await J.post('/api/alerts', { alerts: [] }); } catch (x) { /* ignore */ } L.lastSync = ''; } };
    const msg = (t, c) => { const m = $('#bgMsg'); if (m) { m.textContent = t; m.className = 'note ' + (c || ''); } };
    $('#bgForm').onsubmit = async (e) => {
      e.preventDefault();
      try { L.bg = await J.post('/api/alerts/config', { enabled: true, tgToken: $('#bgTg').value.trim(), tgChat: $('#bgChat').value.trim(), discord: $('#bgDc').value.trim() }); msg('Saved ✓', 'up'); $('#bgTg').value = ''; $('#bgDc').value = ''; if (typeof renderSettings === 'function') setTimeout(renderSettings, 600); }
      catch (err) { msg('⚠ ' + err.message.replace(/^HTTP \d+ /, ''), 'dn'); }
    };
    $('#bgTest').onclick = async () => { msg('Sending…'); try { const r = await J.post('/api/alerts/test', {}); msg(r.ok ? 'Sent to ' + r.sent.join(' + ') + ' ✓' : 'Nothing configured yet', r.ok ? 'up' : 'amb'); } catch (err) { msg('⚠ ' + err.message.replace(/^HTTP \d+ /, ''), 'dn'); } };
    // removed means removed: the vault copy of the webhooks goes too, so a later unlock can't re-send them
    $('#bgClear').onclick = async () => { try { L.bg = await J.post('/api/alerts/config', { enabled: true, tgToken: '-', tgChat: '-', discord: '-' }); if (ST.hooks) { ST.hooks = { discord: '', tgToken: '', tgChat: '' }; saveState(); } msg('Removed', 'acc'); if (typeof renderSettings === 'function') setTimeout(renderSettings, 400); } catch (err) { msg('⚠ ' + err.message, 'dn'); } };
  };
  L.start = async () => {
    await L.detect();
    if (L.caps.alerts) { await L.poll(); await L.sync(true); setInterval(() => { L.sync(); L.poll(); }, 15000); }
    if (curTab === 'ai' && typeof renderAI === 'function') renderAI();
  };
  return L;
})();
