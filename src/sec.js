/* ExTerm stocks insider tracker — SEC EDGAR Form 4 filings (officers, directors, 10% owners).
   Needs serve.py (SEC has no CORS and requires a contact User-Agent, which the local proxy adds). */
const SEC = (() => {
  const X = { WWW: 'https://www.sec.gov', DATA: 'https://data.sec.gov', map: null, trades: [], ids: new Set(), scanned: {}, st: 'idle', err: null, ts: 0, progress: '', listeners: [], sim: false, streamTs: 0, contact: '' };
  const CODES = { P: 'Buy', S: 'Sale', A: 'Award', M: 'Option exercise', X: 'Option exercise', F: 'Tax withholding', G: 'Gift', D: 'Return to issuer', C: 'Conversion', J: 'Other', W: 'Will/inheritance', I: 'Discretionary' };
  const hdr = () => (X.contact ? { 'X-Contact': X.contact } : {});
  const get = (u) => J.get(u, { timeout: 20000, proxy: true, headers: hdr() });
  const text = (u) => J.text(u, { timeout: 20000, proxy: true, headers: hdr() });
  X.label = (c) => CODES[c] || c || '?';
  async function cikMap() {
    if (X.map) return X.map;
    const r = await get(X.WWW + '/files/company_tickers.json'), m = {};
    for (const v of Object.values(r)) m[String(v.ticker).toUpperCase()] = { cik: v.cik_str, name: v.title };
    X.map = m; return m;
  }
  const q = (el, sel) => { const x = el && el.querySelector(sel); return x ? x.textContent.trim() : ''; };
  const num = (s) => { const v = parseFloat(String(s).replace(/,/g, '')); return Number.isFinite(v) ? v : null; };
  // Parse one Form 4 XML document into transactions
  X.parse4 = (xml, meta) => {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) return [];
    const ticker = (q(doc, 'issuer > issuerTradingSymbol') || meta.ticker || '').toUpperCase(), company = q(doc, 'issuer > issuerName') || meta.company || '';
    const owners = [...doc.querySelectorAll('reportingOwner')].map((o) => {
      const rel = o.querySelector('reportingOwnerRelationship'), yes = (s) => /^(1|true)$/i.test(q(rel, s));
      const roles = []; if (yes('isOfficer')) roles.push(q(rel, 'officerTitle') || 'Officer'); if (yes('isDirector')) roles.push('Director'); if (yes('isTenPercentOwner')) roles.push('10% owner'); if (yes('isOther')) roles.push(q(rel, 'otherText') || 'Other');
      return { name: q(o, 'reportingOwnerId > rptOwnerName'), role: roles.join(', ') };
    });
    const who = owners[0] || { name: '?', role: '' };
    const out = [];
    [...doc.querySelectorAll('nonDerivativeTable > nonDerivativeTransaction')].forEach((t, k) => {
      const code = q(t, 'transactionCoding > transactionCode'), shares = num(q(t, 'transactionAmounts > transactionShares > value')), price = num(q(t, 'transactionAmounts > transactionPricePerShare > value'));
      out.push({
        id: meta.acc + ':' + k, acc: meta.acc, ticker, company, insider: who.name, role: who.role, others: owners.length - 1,
        date: q(t, 'transactionDate > value'), filed: meta.filed || '', code, type: CODES[code] || code, ad: q(t, 'transactionAmounts > transactionAcquiredDisposedCode > value'),
        shares, price, value: shares != null && price != null ? shares * price : null, after: num(q(t, 'postTransactionAmounts > sharesOwnedFollowingTransaction > value')),
        security: q(t, 'securityTitle > value'), url: meta.url, ts: Date.parse(q(t, 'transactionDate > value') || meta.filed) || Date.now(),
      });
    });
    return out;
  };
  function add(rows) {
    let n = 0;
    for (const r of rows) { if (X.ids.has(r.id)) continue; X.ids.add(r.id); X.trades.push(r); n++; X.listeners.forEach((f) => { try { f(r); } catch (e) { } }); }
    if (n) { X.trades.sort((a, b) => b.ts - a.ts || (b.filed > a.filed ? 1 : -1)); if (X.trades.length > 1500) X.trades.length = 1500; }
    return n;
  }
  const docUrl = (cik, acc, doc) => `${X.WWW}/Archives/edgar/data/${+cik}/${acc.replace(/-/g, '')}/${String(doc).replace(/^xsl[^/]+\//, '')}`;
  const idxUrl = (cik, acc) => `${X.WWW}/Archives/edgar/data/${+cik}/${acc.replace(/-/g, '')}/${acc}-index.htm`;
  async function fetch4(cik, acc, doc, meta) {
    if (X.scanned[acc]) return 0; X.scanned[acc] = 1;
    const xml = await text(docUrl(cik, acc, doc));
    return add(X.parse4(xml, Object.assign({ acc, url: idxUrl(cik, acc) }, meta)));
  }
  // Scan the latest Form 4s for a list of tickers
  X.scan = async (tickers, perTicker = 6) => {
    if (X.sim) { simBatch(tickers, 12); X.st = 'sim'; return; }
    if (X.st === 'scanning') return;
    X.st = 'scanning'; X.err = null;
    try {
      const m = await cikMap(); let done = 0;
      await pool(tickers, 2, async (tk) => {
        const e = m[tk.toUpperCase().replace('.', '-')] || m[tk.toUpperCase()]; if (!e) { done++; return; }
        const sub = await get(`${X.DATA}/submissions/CIK${String(e.cik).padStart(10, '0')}.json`), r = sub.filings && sub.filings.recent;
        if (r) {
          const idx = []; for (let i = 0; i < r.form.length && idx.length < perTicker; i++) if (r.form[i] === '4' || r.form[i] === '4/A') idx.push(i);
          for (const i of idx) { try { await fetch4(e.cik, r.accessionNumber[i], r.primaryDocument[i], { ticker: tk, company: e.name, filed: r.filingDate[i] }); } catch (x) { /* skip one filing */ } }
        }
        done++; X.progress = `${done}/${tickers.length}`;
      });
      X.st = 'live'; X.ts = Date.now();
    } catch (e) { X.st = 'error'; X.err = e.message; }
  };
  // Market-wide stream: newest Form 4 filings from EDGAR's "current events" feed
  X.stream = async (max = 25) => {
    if (X.sim) { simBatch(null, 4); return; }
    try {
      const atom = await text(`${X.WWW}/cgi-bin/browse-edgar?action=getcurrent&type=4&company=&dateb=&owner=include&count=100&output=atom`);
      const doc = new DOMParser().parseFromString(atom, 'text/xml'), seen = new Set(), jobs = [];
      for (const en of doc.querySelectorAll('entry')) {
        const link = (en.querySelector('link') || {}).getAttribute ? en.querySelector('link').getAttribute('href') : '';
        const m = /edgar\/data\/(\d+)\/(\d{18})\//.exec(link || ''); if (!m) continue;
        const acc = m[2].replace(/^(\d{10})(\d{2})(\d{6})$/, '$1-$2-$3'); if (seen.has(acc) || X.scanned[acc]) continue; seen.add(acc);
        jobs.push({ cik: m[1], acc, filed: q(en, 'updated').slice(0, 10) });
      }
      await pool(jobs.slice(0, max), 2, async (j) => {
        const idx = await get(`${X.WWW}/Archives/edgar/data/${+j.cik}/${j.acc.replace(/-/g, '')}/index.json`);
        const f = ((idx.directory && idx.directory.item) || []).map((x) => x.name).find((n) => /\.xml$/i.test(n) && !/^xsl/i.test(n) && !/FilingSummary/i.test(n));
        if (f) await fetch4(j.cik, j.acc, f, { filed: j.filed });
      });
      X.streamTs = Date.now(); if (X.st !== 'scanning') X.st = 'live'; X.err = null;
    } catch (e) { X.err = e.message; if (X.st !== 'scanning') X.st = 'error'; }
  };
  X.clusters = (days = 30) => {
    const cut = Date.now() - days * 864e5, g = {};
    for (const t of X.trades) { if (t.code !== 'P' || t.ts < cut) continue; const x = g[t.ticker] || (g[t.ticker] = { ticker: t.ticker, company: t.company, insiders: new Map(), value: 0, n: 0, last: 0 }); x.insiders.set(t.insider, t.role); x.value += t.value || 0; x.n++; x.last = Math.max(x.last, t.ts); }
    return Object.values(g).sort((a, b) => b.insiders.size - a.insiders.size || b.value - a.value);
  };
  // simulated filings (only when stock data is simulated)
  const NAMES = ['J. Smith', 'M. Chen', 'A. Patel', 'R. Johnson', 'L. Garcia', 'K. Müller', 'S. Okafor', 'D. Kim', 'E. Rossi', 'T. Nguyen'], ROLES = ['CEO', 'CFO', 'Director', 'COO', '10% owner', 'General Counsel', 'Director'];
  function simBatch(tickers, n) {
    const tk = tickers && tickers.length ? tickers : Object.keys(STOCK_INFO).filter((s) => STOCK_INFO[s].shares);
    const rows = [];
    for (let i = 0; i < n; i++) {
      const t = tk[Math.floor(Math.random() * tk.length)], info = STOCK_INFO[t] || { name: t, demo: 100 }, code = Math.random() < 0.3 ? 'P' : Math.random() < 0.7 ? 'S' : ['A', 'M', 'F'][Math.floor(Math.random() * 3)];
      const sh = Math.round(500 + Math.random() * Math.random() * 60000), px = (StockDemo.px[t] || info.demo) * (1 + (Math.random() - 0.5) * 0.04), d = new Date(Date.now() - Math.random() * 20 * 864e5);
      rows.push({ id: 'sim' + NT.uid(), acc: 'sim', ticker: t, company: info.name, insider: NAMES[Math.floor(Math.random() * NAMES.length)], role: ROLES[Math.floor(Math.random() * ROLES.length)], others: 0, date: d.toISOString().slice(0, 10), filed: d.toISOString().slice(0, 10), code, type: CODES[code], ad: code === 'P' || code === 'A' || code === 'M' ? 'A' : 'D', shares: sh, price: code === 'A' ? 0 : px, value: code === 'A' ? 0 : sh * px, after: sh * (3 + Math.random() * 20), security: 'Common Stock', url: '', ts: d.getTime(), sim: true });
    }
    add(rows);
  }
  return X;
})();

/* stock news (Yahoo Finance RSS) and a stock-market Fear & Greed gauge (CNN, falling back to VIX) */
const StockExt = {
  async news(tickers) {
    if (Stocks.active === StockDemo) throw new Error('stock news needs real stock data (run serve.py)');
    const xml = await J.text(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(tickers.slice(0, 15).join(','))}&region=US&lang=en-US`, { proxy: true });
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    return [...doc.querySelectorAll('item')].slice(0, 40).map((it, k) => {
      const g = (s) => { const e = it.querySelector(s); return e ? e.textContent.trim() : ''; };
      return { id: 'y' + k + g('guid'), title: g('title'), body: g('description').replace(/<[^>]+>/g, ''), source: 'Yahoo Finance', url: g('link'), t: (Date.parse(g('pubDate')) || Date.now()) / 1000, cats: [] };
    });
  },
  async fng() {
    if (Stocks.active === StockDemo) { const out = Array.from({ length: 30 }, (_, i) => { const v = Math.round(50 + 25 * Math.sin(i / 5) + (Math.random() - 0.5) * 8); return { v, label: v < 25 ? 'Extreme Fear' : v < 45 ? 'Fear' : v <= 55 ? 'Neutral' : v <= 75 ? 'Greed' : 'Extreme Greed', t: Date.now() / 1000 - i * 86400 }; }); out.src = 'simulated'; return out; }
    try {
      const r = await J.get('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', { proxy: true, timeout: 12000 });
      const f = r.fear_and_greed, hist = ((r.fear_and_greed_historical && r.fear_and_greed_historical.data) || []).slice(-30).reverse();
      const lab = (v) => (v < 25 ? 'Extreme Fear' : v < 45 ? 'Fear' : v <= 55 ? 'Neutral' : v <= 75 ? 'Greed' : 'Extreme Greed');
      const out = hist.length ? hist.map((x) => ({ v: Math.round(x.y), label: lab(x.y), t: x.x / 1000 })) : [{ v: Math.round(f.score), label: lab(f.score), t: Date.now() / 1000 }];
      out[0] = { v: Math.round(f.score), label: lab(f.score), t: Date.now() / 1000 };
      out.src = 'CNN Fear & Greed Index'; return out;
    } catch (e) {
      const c = await providerFor('^VIX').candles('^VIX', 86400, 40), lab = (v) => (v < 25 ? 'Extreme Fear' : v < 45 ? 'Fear' : v <= 55 ? 'Neutral' : v <= 75 ? 'Greed' : 'Extreme Greed');
      const sc = (vix) => Math.round(NT.clamp(100 - (vix - 11) * 4, 0, 100));
      const out = c.slice(-30).reverse().map((k) => ({ v: sc(k.c), label: lab(sc(k.c)), t: k.t, vix: k.c })); out.src = 'VIX-based estimate (CNN unavailable)'; return out;
    }
  },
};
