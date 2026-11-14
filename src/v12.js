/* ExTerm v12 glue: wires the new modules (safety scanner, strategy builder, workspaces, order flow, journal,
   challenges, local AI, background alerts) into the existing tabs, Copilot and settings. */
(() => {
  /* ---- Copilot: new commands, checked before the existing router ---- */
  const prevHandle = aiHandle;
  aiHandle = async (q) => {
    const s = String(q || '').trim(), lq = s.toLowerCase();
    let m;
    if ((m = /^__safety (solana|eth|base|bsc|arbitrum)\|([A-Za-z0-9]{20,64})$/.exec(s))) { labSec = 'safety'; showTab('lab'); $$('#labNav button').forEach((x) => x.classList.toggle('on', x.dataset.v === 'safety')); await renderLab(); const i = $('#safeAddr'), c = $('#safeChain'); if (i) { i.value = m[2]; if (c) c.value = m[1]; $('#safeForm').requestSubmit(); } return { txt: 'Opened the full safety report in 🧪 Lab → Token safety.' }; }
    if (/^__tab (workspace|journal|challenge)$/.test(s)) { showTab(s.slice(6)); return { txt: 'Opened.' }; }
    if (/\b(rug ?check|honeypot|is .{2,60} (safe|a scam|a rug)|safety (check|score|report|grade)|check .{0,30}safety|token safety)\b/.test(lq)) { const r = await Safety.copilot(s); if (r) return r; }
    if (/\b(review|analy[sz]e) (my )?(trades|trading|journal|week)\b|\btrading (habits|mistakes)\b|\bwhat am i doing wrong\b/.test(lq)) {
      if (!Journal.ready) await (Journal.initP || Journal.init());
      const R = Journal.review(Journal.entries.filter((e) => Date.now() - e.ts < 30 * 864e5));
      return { txt: R.note ? R.note : `**Your last 30 days:** ${R.n} closed trades, ${R.winRate.toFixed(0)}% wins, ${NT.fmtUSD(R.pnl)}.\n\n` + (R.insights.length ? R.insights.slice(0, 5).map((x) => `- ${x.sev === 'good' ? '✅' : '⚠️'} **${x.title}**: ${x.detail}`).join('\n') : '- No clear bad habits found. Keep adding notes and moods to your journal.'), acts: [{ l: 'Open journal', c: '__tab journal' }] };
    }
    if (/\b(replay|trading) challenge\b|\bplay (a |the )?(daily )?challenge\b|\bdaily challenge\b/.test(lq)) { Challenge.mode = /random|pick/.test(lq) ? 'random' : /blind/.test(lq) ? 'blind' : 'daily'; showTab('challenge'); Challenge.newGame(); return { txt: `Started a ${Challenge.mode} replay challenge. Beat buy-and-hold to win. Keys: B buy, S sell, → next candle.` }; }
    if (/\b(open|show) (the |my )?workspace\b|\bmulti.?chart\b|\b(2|4|four|two) charts\b/.test(lq)) { showTab('workspace'); return { txt: 'Opened Workspaces: up to 4 synced charts. Save layouts with "＋ Save as…".' }; }
    if (/\b(strategy builder|build (a|my own) strategy|no.?code strategy|create (a|my own) strategy)\b/.test(lq)) { showTab('bots'); setTimeout(() => { const b = $('#builder'); if (b) b.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 120); return { txt: 'Opened the ✎ Strategy builder in Bots & Backtest. Pick a template, change the rules, then backtest, validate or export it as Pine Script v5.' }; }
    if (/\b(volume profile|order ?flow|liquidation (levels|map|heatmap)|delta)\b/.test(lq) && /\b(show|turn on|enable|add)\b/.test(lq)) { const k = /profile/.test(lq) ? 'vp' : /liquidation/.test(lq) ? 'liq' : 'delta'; ST.ind[k] = true; if (chart) Object.assign(chart.o, ST.ind); chartRefresh(true); saveState(); showTab('markets'); return { txt: `Turned on **${{ vp: 'Volume profile', liq: 'Estimated liquidation levels', delta: 'Buy/sell delta' }[k]}** on the chart. Order-flow layers are estimates from candle data.` }; }
    return prevHandle(q);
  };

  /* ---- tabs ---- */
  const botsShow = TABS.bots.show; TABS.bots.show = function () { botsShow.apply(this, arguments); Builder.render(); };
  const aiShow = TABS.ai.show; TABS.ai.show = function () { aiShow.apply(this, arguments); const h = $('#laBanner'); if (h) { h.innerHTML = Launcher.aiBanner(); Launcher.bindBanner(); } };
  const setRender = renderSettings; renderSettings = function () { setRender.apply(this, arguments); const host = $('#setBody'); if (host && typeof Launcher !== 'undefined') { const d = document.createElement('div'); d.innerHTML = Launcher.settingsHTML(); host.prepend(d); Launcher.bindSettings(); } if (typeof Themes !== 'undefined') Themes.mountPicker(); };

  /* ---- keep the launcher's background alert list in step with the page ---- */
  const ss = saveState; saveState = function () { const r = ss.apply(this, arguments); if (typeof Launcher !== 'undefined' && Launcher.bgOn()) Launcher.queueSync(); return r; };

  /* ---- start launcher features once the app has booted ---- */
  const wait = setInterval(() => { if (window.__exterm_ready) { clearInterval(wait); Launcher.start(); const tb = $('#btnTheme'); if (tb) { tb.onclick = (e) => Themes.popover(e.currentTarget); tb.title = 'Theme'; tb.setAttribute('aria-haspopup', 'menu'); } } }, 300);
})();
