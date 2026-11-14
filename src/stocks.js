/* ExTerm stocks — Yahoo Finance (keyless; needs serve.py proxy in most browsers) + simulated fallback */
// [ticker, name, sector, approx. shares outstanding (billions, used only to size the heat map), demo price]
const STOCKS = [
  ['AAPL', 'Apple', 'Technology', 14.8, 270], ['MSFT', 'Microsoft', 'Technology', 7.43, 500], ['NVDA', 'NVIDIA', 'Technology', 24.3, 190], ['AVGO', 'Broadcom', 'Technology', 4.7, 340],
  ['ORCL', 'Oracle', 'Technology', 2.8, 250], ['CRM', 'Salesforce', 'Technology', 0.96, 240], ['ADBE', 'Adobe', 'Technology', 0.42, 340], ['AMD', 'AMD', 'Technology', 1.62, 240],
  ['CSCO', 'Cisco', 'Technology', 3.96, 70], ['INTC', 'Intel', 'Technology', 4.37, 38], ['QCOM', 'Qualcomm', 'Technology', 1.1, 170], ['IBM', 'IBM', 'Technology', 0.93, 300],
  ['TXN', 'Texas Instruments', 'Technology', 0.91, 160], ['NOW', 'ServiceNow', 'Technology', 0.207, 900], ['PLTR', 'Palantir', 'Technology', 2.36, 180], ['MU', 'Micron', 'Technology', 1.12, 210],
  ['MSTR', 'Strategy', 'Technology', 0.28, 250],
  ['GOOGL', 'Alphabet', 'Communication', 12.1, 280], ['META', 'Meta Platforms', 'Communication', 2.52, 640], ['NFLX', 'Netflix', 'Communication', 0.425, 1100], ['DIS', 'Disney', 'Communication', 1.8, 112],
  ['TMUS', 'T-Mobile', 'Communication', 1.13, 220], ['VZ', 'Verizon', 'Communication', 4.2, 40],
  ['AMZN', 'Amazon', 'Consumer Disc.', 10.6, 245], ['TSLA', 'Tesla', 'Consumer Disc.', 3.22, 440], ['HD', 'Home Depot', 'Consumer Disc.', 0.995, 380], ['MCD', "McDonald's", 'Consumer Disc.', 0.715, 300],
  ['NKE', 'Nike', 'Consumer Disc.', 1.48, 65], ['SBUX', 'Starbucks', 'Consumer Disc.', 1.14, 85], ['BKNG', 'Booking', 'Consumer Disc.', 0.033, 5200], ['LOW', "Lowe's", 'Consumer Disc.', 0.56, 240],
  ['BRK-B', 'Berkshire Hathaway', 'Financials', 2.16, 490], ['JPM', 'JPMorgan Chase', 'Financials', 2.78, 310], ['V', 'Visa', 'Financials', 1.95, 340], ['MA', 'Mastercard', 'Financials', 0.91, 560],
  ['BAC', 'Bank of America', 'Financials', 7.6, 52], ['WFC', 'Wells Fargo', 'Financials', 3.25, 85], ['GS', 'Goldman Sachs', 'Financials', 0.31, 790], ['MS', 'Morgan Stanley', 'Financials', 1.6, 160],
  ['AXP', 'American Express', 'Financials', 0.7, 360], ['BLK', 'BlackRock', 'Financials', 0.155, 1080], ['C', 'Citigroup', 'Financials', 1.87, 100], ['SCHW', 'Charles Schwab', 'Financials', 1.81, 95],
  ['COIN', 'Coinbase', 'Financials', 0.254, 320], ['HOOD', 'Robinhood', 'Financials', 0.88, 130],
  ['LLY', 'Eli Lilly', 'Health Care', 0.948, 900], ['UNH', 'UnitedHealth', 'Health Care', 0.905, 330], ['JNJ', 'Johnson & Johnson', 'Health Care', 2.41, 190], ['ABBV', 'AbbVie', 'Health Care', 1.77, 220],
  ['MRK', 'Merck', 'Health Care', 2.5, 90], ['PFE', 'Pfizer', 'Health Care', 5.67, 25], ['TMO', 'Thermo Fisher', 'Health Care', 0.38, 560], ['ABT', 'Abbott', 'Health Care', 1.74, 130],
  ['AMGN', 'Amgen', 'Health Care', 0.537, 300], ['ISRG', 'Intuitive Surgical', 'Health Care', 0.358, 560],
  ['WMT', 'Walmart', 'Consumer Staples', 8.0, 103], ['PG', 'Procter & Gamble', 'Consumer Staples', 2.34, 150], ['KO', 'Coca-Cola', 'Consumer Staples', 4.3, 70], ['PEP', 'PepsiCo', 'Consumer Staples', 1.37, 150],
  ['COST', 'Costco', 'Consumer Staples', 0.443, 920], ['PM', 'Philip Morris', 'Consumer Staples', 1.56, 150],
  ['XOM', 'Exxon Mobil', 'Energy', 4.3, 115], ['CVX', 'Chevron', 'Energy', 1.75, 155], ['COP', 'ConocoPhillips', 'Energy', 1.26, 90],
  ['GE', 'GE Aerospace', 'Industrials', 1.06, 300], ['CAT', 'Caterpillar', 'Industrials', 0.47, 560], ['BA', 'Boeing', 'Industrials', 0.76, 210], ['HON', 'Honeywell', 'Industrials', 0.64, 200],
  ['UNP', 'Union Pacific', 'Industrials', 0.6, 230], ['RTX', 'RTX', 'Industrials', 1.34, 175], ['UPS', 'UPS', 'Industrials', 0.85, 95], ['LMT', 'Lockheed Martin', 'Industrials', 0.234, 480],
  ['LIN', 'Linde', 'Materials', 0.47, 420], ['NEE', 'NextEra Energy', 'Utilities', 2.06, 82], ['PLD', 'Prologis', 'Real Estate', 0.93, 125],
];
const ETFS = [['SPY', 'SPDR S&P 500 ETF', 'ETF', 0, 680], ['QQQ', 'Invesco QQQ (Nasdaq-100)', 'ETF', 0, 620], ['DIA', 'SPDR Dow Jones ETF', 'ETF', 0, 470], ['IWM', 'iShares Russell 2000', 'ETF', 0, 245], ['GLD', 'SPDR Gold Shares', 'ETF', 0, 370], ['TLT', 'iShares 20+ Yr Treasury', 'ETF', 0, 90]];
const STOCK_INFO = {};
for (const r of STOCKS.concat(ETFS)) STOCK_INFO[r[0]] = { sym: r[0], name: r[1], sector: r[2], shares: r[3] * 1e9, demo: r[4] };
const STOCK_SET = new Set(Object.keys(STOCK_INFO));
const STOCK_NAMES = { apple: 'AAPL', microsoft: 'MSFT', nvidia: 'NVDA', tesla: 'TSLA', amazon: 'AMZN', google: 'GOOGL', alphabet: 'GOOGL', meta: 'META', facebook: 'META', netflix: 'NFLX', palantir: 'PLTR', amd: 'AMD', intel: 'INTC', berkshire: 'BRK-B', jpmorgan: 'JPM', walmart: 'WMT', costco: 'COST', disney: 'DIS', boeing: 'BA', coinbase: 'COIN', microstrategy: 'MSTR', robinhood: 'HOOD', spy: 'SPY', qqq: 'QQQ', nasdaq: 'QQQ', broadcom: 'AVGO', oracle: 'ORCL', salesforce: 'CRM', visa: 'V', mastercard: 'MA', exxon: 'XOM', lilly: 'LLY' };

function isStock(sym) { return !!sym && !/-USD$/.test(sym) && !/^oc:/.test(sym); }
const isOnchain = (sym) => typeof OC !== 'undefined' && OC.is(sym);
function modeOf(sym) { return isOnchain(sym) ? 'onchain' : isStock(sym) ? 'stocks' : 'crypto'; }
function providerFor(sym) { return isOnchain(sym) ? OC : isStock(sym) ? Stocks.active : Providers.active; }
const isSimProv = (p) => p === Demo || p === StockDemo;

/* ── Yahoo Finance ── */
function yMeta(sym, meta) {
  const prev = meta.chartPreviousClose != null ? meta.chartPreviousClose : meta.previousClose, p = meta.regularMarketPrice;
  const reg = meta.currentTradingPeriod && meta.currentTradingPeriod.regular, now = Date.now() / 1000;
  return { sym, price: p, prev, ch: prev ? (p / prev - 1) * 100 : null, time: meta.regularMarketTime, open: reg ? now >= reg.start && now < reg.end : null, name: meta.shortName || meta.longName || sym, exch: meta.fullExchangeName || meta.exchangeName || '' };
}
const YF = {
  id: 'yahoo', name: 'Yahoo Finance', H: 'https://query1.finance.yahoo.com',
  async chartP(sym, interval, p1, p2) { return YF.chart(sym, interval, null, `period1=${Math.floor(p1)}&period2=${Math.floor(p2)}`); },
  async chart(sym, interval, range, period) {
    const r = await J.get(`${YF.H}/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&${period || 'range=' + range}&includePrePost=false`, { timeout: 20000 });
    const res = r.chart && r.chart.result && r.chart.result[0];
    if (!res) throw new Error((r.chart && r.chart.error && r.chart.error.description) || 'no data for ' + sym);
    const ts = res.timestamp || [], q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {}, rows = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
      if (o == null || h == null || l == null || c == null) continue;
      rows.push({ t: ts[i], o, h, l, c, v: q.volume[i] || 0 });
    }
    return { meta: res.meta || {}, rows };
  },
  async candles(sym, tf, n = 300) {
    const m = { 60: ['1m', '5d'], 300: ['5m', '1mo'], 900: ['15m', '1mo'], 3600: ['60m', '6mo'], 14400: ['60m', '2y'], 86400: ['1d', '5y'] }[tf] || ['1d', '1y'];
    const { rows } = await YF.chart(sym, m[0], m[1]);
    return (tf === 14400 ? NT.aggregate(rows, 14400) : rows).slice(-n);
  },
  async quote(sym) { const { meta } = await YF.chart(sym, '1m', '1d'); return yMeta(sym, meta); },
  async quotes(syms) {
    const out = [];
    for (let i = 0; i < syms.length; i += 20) {
      const ch = syms.slice(i, i + 20);
      try {
        const r = await J.get(`${YF.H}/v7/finance/spark?symbols=${ch.map(encodeURIComponent).join(',')}&range=1d&interval=1d`, { timeout: 12000 });
        if (r.spark && r.spark.result) { for (const x of r.spark.result) if (x.response && x.response[0]) out.push(yMeta(x.symbol, x.response[0].meta)); }
        else for (const x of Object.values(r)) { if (!x || !x.symbol) continue; const c = (x.close || []).filter((v) => v != null), p = c[c.length - 1], prev = x.chartPreviousClose || x.previousClose; if (p) out.push({ sym: x.symbol, price: p, prev, ch: prev ? (p / prev - 1) * 100 : null }); }
      } catch (e) {
        const rows = await pool(ch, 6, (s) => YF.quote(s)); rows.forEach((q) => q && out.push(q));
      }
    }
    return out;
  },
  async book() { throw new Error('Free Level-2 order book data isn’t available for stocks'); },
};

/* ── simulated stocks (used when Yahoo is unreachable) ── */
const StockDemo = {
  id: 'stockdemo', name: 'Simulated stocks', px: {}, prev: {},
  init(s) {
    const list = s ? [s] : Object.keys(STOCK_INFO);
    for (const k of list) if (!StockDemo.px[k]) {
      const base = STOCK_INFO[k] ? STOCK_INFO[k].demo : 20 + (hash(k) % 300), r = prng(hash(k) ^ Math.floor(Date.now() / 8.64e7));
      StockDemo.prev[k] = base * (1 + (r() - 0.5) * 0.04); StockDemo.px[k] = StockDemo.prev[k] * (1 + (r() - 0.5) * 0.035);
    }
  },
  async candles(sym, tf, n = 300) { StockDemo.init(sym); return simCandles(sym, StockDemo.px[sym], tf, n, 0.55); },
  async quote(sym) { StockDemo.init(sym); const p = StockDemo.px[sym], prev = StockDemo.prev[sym]; return { sym, price: p, prev, ch: (p / prev - 1) * 100, open: true, name: STOCK_INFO[sym] ? STOCK_INFO[sym].name : sym, exch: 'SIM' }; },
  async quotes(syms) { return Promise.all(syms.map((s) => StockDemo.quote(s))); },
  async book() { throw new Error('No order book for stocks (simulated mode)'); },
};

const Stocks = {
  active: StockDemo, probe: null,
  async pick(mode) {
    if (mode === 'demo') { Stocks.active = StockDemo; Stocks.probe = { ok: false, err: 'demo selected' }; return; }
    try {
      const t0 = performance.now();
      const c = await Promise.race([YF.candles('SPY', 86400, 5), sleep(J.proxy ? 9000 : 20000).then(() => { throw new Error('timeout'); })]);
      if (!c.length) throw new Error('no data');
      Stocks.active = YF; Stocks.probe = { ok: true, ms: Math.round(performance.now() - t0) };
    } catch (e) { Stocks.active = StockDemo; Stocks.probe = { ok: false, err: e.message }; }
  },
};

/* polls quotes for subscribed stock symbols and feeds them into the shared live feed */
const StockFeed = {
  subs: new Set(), last: {}, session: {}, names: {}, timer: null, busy: false, ts: 0,
  start() { clearInterval(StockFeed.timer); StockFeed.timer = setInterval(StockFeed.poll, Stocks.active === StockDemo ? 2000 : 15000); StockFeed.poll(); },
  subscribe(syms) { let n = 0; for (const s of syms) if (s && !StockFeed.subs.has(s)) { StockFeed.subs.add(s); n++; } if (n) setTimeout(StockFeed.poll, 50); },
  async poll() {
    if (StockFeed.busy || !StockFeed.subs.size) return; StockFeed.busy = true;
    try {
      const list = [...StockFeed.subs];
      if (Stocks.active === StockDemo) {
        for (const s of list) { StockDemo.init(s); const p = StockDemo.px[s] * (1 + (Math.random() - 0.5) * 0.0012); StockDemo.px[s] = p; StockFeed.session[s] = true; Feed.tick(s, p, { open24: StockDemo.prev[s] }); }
      } else {
        await pool(list, 4, async (s) => {
          const q = await YF.quote(s), L = StockFeed.last[s];
          StockFeed.session[s] = q.open; StockFeed.names[s] = q.name;
          if (!L || L.price !== q.price || L.time !== q.time) Feed.tick(s, q.price, { open24: q.prev, ts: q.time });
          else if (Feed.live[s]) Feed.live[s].ts = Date.now();
          StockFeed.last[s] = q;
        });
      }
      StockFeed.ts = Date.now();
    } catch (e) { console.warn('stock poll', e); }
    StockFeed.busy = false;
  },
};
