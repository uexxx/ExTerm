/* ExTerm strategy pack 4 (v15 phase 3): 40 rule-based strategies, 10 per category, written as no-code specs.
   Because they are specs (not code) every one of them: backtests here and in the worker, runs in the 17-test validation
   lab, runs 24/7 as a launcher background bot (serve.py interprets the same JSON, parity-tested) and exports to
   Pine Script v5 (NT.Spec.toPine). Each is a well-known market behaviour, not a promise of profit. */
(function (NT) {
  'use strict';
  const SP = NT.Spec, S = NT.strategies;
  const o = (k, n, tf) => { const x = { k }; if (n != null) x.n = n; if (tf > 1) x.tf = tf; return x; };
  const v = (x) => ({ k: 'const', v: x });
  const c = (a, op, b) => ({ a, op, b });
  const all = (...x) => ({ all: x }), any = (...x) => ({ any: x });
  const P = o('price'), VOL = o('volume');
  // [id, category, tf hint, spec]
  const L = [
    /* ── Crypto spot / perps ── */
    ['cr_trendpb', 'Crypto Spot/Perps', '1h', { name: 'Trend pullback, 4x filter', desc: 'Buys an RSI recovery above 40 while the 4x-timeframe close sits above its EMA 50.', entry: all(c(o('price', null, 4), '>', o('ema', 50, 4)), c(o('rsi', 14), 'crossAbove', v(40))), exit: any(c(o('rsi', 14), '>', v(75)), c(o('price', null, 4), '<', o('ema', 50, 4))), risk: { sl: 3, trail: 5 } }],
    ['cr_donchadx', 'Crypto Spot/Perps', '4h', { name: 'Donchian 55 breakout + ADX', desc: 'Turtle-style 55-bar breakout, only when ADX shows a real trend.', entry: all(c(P, '>', o('highest', 55)), c(o('adx', 14), '>', v(20))), exit: any(c(P, '<', o('lowest', 20))), risk: { sl: 6 } }],
    ['cr_bbvol', 'Crypto Spot/Perps', '1h', { name: 'Bollinger breakout on volume', desc: 'Close through the upper band on above-average volume; out below the middle band.', entry: all(c(P, 'crossAbove', o('bbUpper', 20)), c(VOL, '>', o('volSma', 20))), exit: any(c(P, '<', o('bbMid', 20))), risk: { sl: 4 } }],
    ['cr_macdzero', 'Crypto Spot/Perps', '4h', { name: 'MACD zero-line momentum', desc: 'MACD crosses above zero above the 200 EMA.', entry: all(c(o('macd'), 'crossAbove', v(0)), c(P, '>', o('ema', 200))), exit: any(c(o('macd'), 'crossBelow', o('macdSignal'))), risk: { trail: 5 } }],
    ['cr_rsi2', 'Crypto Spot/Perps', '1h', { name: 'RSI-2 dip above SMA 200', desc: 'Connors-style short-term oversold dip inside a long-term uptrend.', entry: all(c(o('rsi', 2), '<', v(10)), c(P, '>', o('sma', 200))), exit: any(c(o('rsi', 2), '>', v(70))), risk: { sl: 5 } }],
    ['cr_perpshort', 'Crypto Spot/Perps', '1h', { name: 'Perp breakdown short', dir: 'short', desc: 'Shorts a 20-bar low under the 200 EMA when ADX confirms a trend.', entry: all(c(P, '<', o('lowest', 20)), c(P, '<', o('ema', 200)), c(o('adx', 14), '>', v(20))), exit: any(c(P, '>', o('highest', 10))), risk: { sl: 4 } }],
    ['cr_fadeshort', 'Crypto Spot/Perps', '1h', { name: 'Downtrend rally fade (short)', dir: 'short', desc: 'Shorts RSI rolling over from overbought while under the 200 SMA.', entry: all(c(o('rsi', 14), 'crossBelow', v(70)), c(P, '<', o('sma', 200))), exit: any(c(o('rsi', 14), '<', v(35))), risk: { sl: 3, tp: 6 } }],
    ['cr_volsurge', 'Crypto Spot/Perps', '15m', { name: 'Volume-surge momentum', desc: '+2% in 3 bars on heavy volume above VWAP.', entry: all(c(o('change', 3), '>', v(2)), c(VOL, '>', o('volSma', 50)), c(P, '>', o('vwap'))), exit: any(c(P, 'crossBelow', o('ema', 20))), risk: { sl: 3, trail: 4 } }],
    ['cr_stochup', 'Crypto Spot/Perps', '1h', { name: 'Stochastic reversal in uptrend', desc: '%K turns up from oversold while price holds the 100 EMA.', entry: all(c(o('stochK', 14), 'crossAbove', v(20)), c(P, '>', o('ema', 100))), exit: any(c(o('stochK', 14), '>', v(85))), risk: { sl: 3 } }],
    ['cr_mtfmacd', 'Crypto Spot/Perps', '15m', { name: 'MACD alignment, 8x timeframe', desc: 'MACD signal cross while the 8x-timeframe histogram is positive.', entry: all(c(o('macdHist', null, 8), '>', v(0)), c(o('macd'), 'crossAbove', o('macdSignal'))), exit: any(c(o('macdHist', null, 8), '<', v(0))), risk: { trail: 4 } }],
    /* ── US equities / stocks ── */
    ['eq_vwap', 'US Equities/Stocks', '5m', { name: 'Intraday VWAP reclaim', desc: 'Reclaims VWAP with RSI above 50 in an uptrend.', entry: all(c(P, 'crossAbove', o('vwap')), c(o('rsi', 14), '>', v(50)), c(P, '>', o('ema', 50))), exit: any(c(P, 'crossBelow', o('vwap'))), risk: { sl: 1.5, tp: 3 } }],
    ['eq_golden', 'US Equities/Stocks', '1d', { name: 'Golden cross 50/200', desc: 'The classic long-term trend switch.', entry: all(c(o('sma', 50), 'crossAbove', o('sma', 200))), exit: any(c(o('sma', 50), 'crossBelow', o('sma', 200))), risk: { sl: 10 } }],
    ['eq_rsi2', 'US Equities/Stocks', '1d', { name: 'Connors RSI-2 (stocks)', desc: 'RSI(2) under 5 above the 200 SMA; out on a close above the 5 SMA.', entry: all(c(o('rsi', 2), '<', v(5)), c(P, '>', o('sma', 200))), exit: any(c(P, '>', o('sma', 5))), risk: { sl: 8 } }],
    ['eq_52wk', 'US Equities/Stocks', '1d', { name: '52-week-high breakout', desc: 'New 250-day high on above-average volume (momentum anomaly).', entry: all(c(P, '>', o('highest', 250)), c(VOL, '>', o('volSma', 50))), exit: any(c(P, '<', o('lowest', 50))), risk: { sl: 8 } }],
    ['eq_bbrev', 'US Equities/Stocks', '1h', { name: 'Lower-band reversion in uptrend', desc: 'Below the lower band with RSI under 30, above the 200 SMA.', entry: all(c(P, '<', o('bbLower', 20)), c(o('rsi', 14), '<', v(30)), c(P, '>', o('sma', 200))), exit: any(c(P, '>', o('bbMid', 20))), risk: { sl: 6 } }],
    ['eq_macdadx', 'US Equities/Stocks', '1h', { name: 'MACD cross with ADX trend', desc: 'MACD signal cross in a strong (ADX > 25) uptrend.', entry: all(c(o('macd'), 'crossAbove', o('macdSignal')), c(o('adx', 14), '>', v(25)), c(P, '>', o('sma', 50))), exit: any(c(o('macd'), 'crossBelow', o('macdSignal'))), risk: { trail: 6 } }],
    ['eq_drive', 'US Equities/Stocks', '5m', { name: 'Opening-drive momentum', desc: '+1% in 6 bars above VWAP on heavy volume.', entry: all(c(o('change', 6), '>', v(1)), c(P, '>', o('vwap')), c(VOL, '>', o('volSma', 20))), exit: any(c(P, 'crossBelow', o('ema', 9))), risk: { sl: 1.2, tp: 2.5 } }],
    ['eq_fadeshort', 'US Equities/Stocks', '1h', { name: 'Overextended stock fade (short)', dir: 'short', desc: 'Shorts RSI rolling over from 75 while price is still above the middle band; covers at the middle band.', entry: all(c(o('rsi', 14), 'crossBelow', v(75)), c(P, '>', o('bbMid', 20))), exit: any(c(P, '<', o('bbMid', 20))), risk: { sl: 4, tp: 8 } }],
    ['eq_ema21', 'US Equities/Stocks', '1h', { name: 'EMA 21 pullback in uptrend', desc: 'Tags the 21 EMA intrabar and closes above it while EMA 21 > SMA 50.', entry: all(c(o('low'), '<', o('ema', 21)), c(P, '>', o('ema', 21)), c(o('ema', 21), '>', o('sma', 50))), exit: any(c(P, '<', o('sma', 50))), risk: { sl: 5, trail: 7 } }],
    ['eq_stochadx', 'US Equities/Stocks', '1h', { name: 'Stochastic dip in strong trend', desc: '%K under 20 while ADX > 25 and price above the 50 EMA.', entry: all(c(o('stochK', 14), '<', v(20)), c(o('adx', 14), '>', v(25)), c(P, '>', o('ema', 50))), exit: any(c(o('stochK', 14), '>', v(80))), risk: { sl: 4 } }],
    /* ── on-chain Solana / DEX ── */
    ['dx_ignite', 'On-Chain Solana/DEX', '1m', { name: 'DEX volume ignition', desc: '+3% in one bar on volume above its 50-bar average, above EMA 9.', entry: all(c(o('change', 1), '>', v(3)), c(VOL, '>', o('volSma', 50)), c(P, '>', o('ema', 9))), exit: any(c(P, 'crossBelow', o('ema', 9))), risk: { sl: 8, tp: 25, trail: 10 } }],
    ['dx_newhigh', 'On-Chain Solana/DEX', '5m', { name: 'DEX new-high momentum', desc: 'Breaks the 30-bar high with fast RSI above 60.', entry: all(c(P, '>', o('highest', 30)), c(o('rsi', 7), '>', v(60))), exit: any(c(P, '<', o('lowest', 10))), risk: { sl: 10, trail: 12 } }],
    ['dx_dip', 'On-Chain Solana/DEX', '5m', { name: 'DEX dip in 6x uptrend', desc: 'Fast RSI under 25 while the 6x-timeframe close holds its EMA 20.', entry: all(c(o('price', null, 6), '>', o('ema', 20, 6)), c(o('rsi', 7), '<', v(25))), exit: any(c(o('rsi', 7), '>', v(70))), risk: { sl: 12, tp: 30 } }],
    ['dx_ema921', 'On-Chain Solana/DEX', '5m', { name: 'DEX EMA 9/21 cross on volume', desc: 'Fast EMA cross confirmed by above-average volume.', entry: all(c(o('ema', 9), 'crossAbove', o('ema', 21)), c(VOL, '>', o('volSma', 20))), exit: any(c(o('ema', 9), 'crossBelow', o('ema', 21))), risk: { sl: 10, trail: 12 } }],
    ['dx_vwap', 'On-Chain Solana/DEX', '1m', { name: 'DEX VWAP bounce', desc: 'Wicks below VWAP and closes back above it with RSI > 45.', entry: all(c(o('low'), '<', o('vwap')), c(P, '>', o('vwap')), c(o('rsi', 14), '>', v(45))), exit: any(c(P, 'crossBelow', o('vwap'))), risk: { sl: 8, tp: 20 } }],
    ['dx_bbrip', 'On-Chain Solana/DEX', '5m', { name: 'DEX Bollinger rip', desc: 'Upper-band breakout in a trending (ADX > 25) pool.', entry: all(c(P, 'crossAbove', o('bbUpper', 20)), c(o('adx', 14), '>', v(25))), exit: any(c(P, '<', o('bbMid', 20))), risk: { sl: 10, trail: 15 } }],
    ['dx_range', 'On-Chain Solana/DEX', '5m', { name: 'DEX consolidation breakout', desc: 'Closes above the 60-bar high on volume above its 60-bar average.', entry: all(c(P, 'crossAbove', o('highest', 60)), c(VOL, '>', o('volSma', 60))), exit: any(c(P, '<', o('ema', 30))), risk: { sl: 12, trail: 15 } }],
    ['dx_macdflip', 'On-Chain Solana/DEX', '5m', { name: 'DEX MACD histogram flip', desc: 'Histogram turns positive above the 50 EMA.', entry: all(c(o('macdHist'), 'crossAbove', v(0)), c(P, '>', o('ema', 50))), exit: any(c(o('macdHist'), 'crossBelow', v(0))), risk: { sl: 10, tp: 30 } }],
    ['dx_snap', 'On-Chain Solana/DEX', '5m', { name: 'DEX oversold snapback', desc: 'After a 20%+ dump over 20 bars, RSI recovers through 30.', entry: all(c(o('rsi', 14), 'crossAbove', v(30)), c(o('change', 20), '<', v(-20))), exit: any(c(o('rsi', 14), '>', v(65))), risk: { sl: 15, tp: 35 } }],
    ['dx_stoch', 'On-Chain Solana/DEX', '1m', { name: 'DEX stochastic momentum', desc: '%K through 50 above VWAP with EMA 9 above EMA 21.', entry: all(c(o('stochK', 14), 'crossAbove', v(50)), c(P, '>', o('vwap')), c(o('ema', 9), '>', o('ema', 21))), exit: any(c(o('stochK', 14), 'crossBelow', v(50))), risk: { sl: 10, trail: 12 } }],
    /* ── multi-asset quant / scalping (built for 1s / 5s / 15s / 1m bars too) ── */
    ['qs_ema513', 'Multi-Asset Quant/Scalping', '5s', { name: 'Micro EMA 5/13 scalp', desc: 'EMA 5/13 cross above VWAP with a tight bracket.', entry: all(c(o('ema', 5), 'crossAbove', o('ema', 13)), c(P, '>', o('vwap'))), exit: any(c(o('ema', 5), 'crossBelow', o('ema', 13))), risk: { sl: 0.3, tp: 0.6 } }],
    ['qs_rsi2', 'Multi-Asset Quant/Scalping', '1s', { name: 'RSI-2 scalp fade', desc: 'RSI(2) under 5 above the 50 EMA, out on RSI(2) > 60.', entry: all(c(o('rsi', 2), '<', v(5)), c(P, '>', o('ema', 50))), exit: any(c(o('rsi', 2), '>', v(60))), risk: { sl: 0.5, tp: 0.8 } }],
    ['qs_bbrange', 'Multi-Asset Quant/Scalping', '15s', { name: 'Range band reversion scalp', desc: 'Below the lower band only while ADX < 20 (ranging tape).', entry: all(c(P, '<', o('bbLower', 20)), c(o('adx', 14), '<', v(20))), exit: any(c(P, '>', o('bbMid', 20))), risk: { sl: 0.6 } }],
    ['qs_burst', 'Multi-Asset Quant/Scalping', '5s', { name: 'Momentum burst scalp', desc: '+0.3% in 5 bars on volume above its 30-bar average.', entry: all(c(o('change', 5), '>', v(0.3)), c(VOL, '>', o('volSma', 30))), exit: any(c(o('change', 5), '<', v(0))), risk: { sl: 0.4, tp: 0.8 } }],
    ['qs_tsmom', 'Multi-Asset Quant/Scalping', '1d', { name: 'Time-series momentum 200', desc: 'Long while the 200-bar return is positive and price holds the 100 SMA.', entry: all(c(o('change', 200), '>', v(0)), c(P, '>', o('sma', 100))), exit: any(c(o('change', 200), '<', v(0))), risk: { trail: 8 } }],
    ['qs_dualma', 'Multi-Asset Quant/Scalping', '4h', { name: 'Dual EMA 20/100 trend', desc: 'Plain trend-following crossover, any asset.', entry: all(c(o('ema', 20), 'crossAbove', o('ema', 100))), exit: any(c(o('ema', 20), 'crossBelow', o('ema', 100))), risk: { trail: 5 } }],
    ['qs_volbrk', 'Multi-Asset Quant/Scalping', '1m', { name: 'Volatility breakout scalp', desc: '10-bar high breakout when ADX > 30.', entry: all(c(P, '>', o('highest', 10)), c(o('adx', 14), '>', v(30))), exit: any(c(P, '<', o('lowest', 5))), risk: { sl: 0.8, tp: 1.6 } }],
    ['qs_mtf', 'Multi-Asset Quant/Scalping', '5s', { name: 'MTF trend scalp, 12x filter', desc: 'Fast RSI recovers through 30 while the 12x-timeframe close is above its EMA 20.', entry: all(c(o('price', null, 12), '>', o('ema', 20, 12)), c(o('rsi', 7), 'crossAbove', v(30))), exit: any(c(o('rsi', 7), '>', v(80))), risk: { sl: 0.5, tp: 1 } }],
    ['qs_stochshort', 'Multi-Asset Quant/Scalping', '15s', { name: 'Stochastic scalp short', dir: 'short', desc: '%K rolls over from 80 under the 50 EMA.', entry: all(c(o('stochK', 14), 'crossBelow', v(80)), c(P, '<', o('ema', 50))), exit: any(c(o('stochK', 14), '<', v(20))), risk: { sl: 0.5, tp: 1 } }],
    ['qs_macd', 'Multi-Asset Quant/Scalping', '1m', { name: 'MACD trend scalp', desc: 'MACD signal cross above the 200 EMA.', entry: all(c(o('macd'), 'crossAbove', o('macdSignal')), c(P, '>', o('ema', 200))), exit: any(c(o('macd'), 'crossBelow', o('macdSignal'))), risk: { sl: 0.6, tp: 1.2 } }],
  ];
  const CATS = ['Crypto Spot/Perps', 'US Equities/Stocks', 'On-Chain Solana/DEX', 'Multi-Asset Quant/Scalping'];
  NT.PACK4 = [];
  for (const [id, cat, tf, raw] of L) {
    const val = SP.validate(Object.assign({ v: 1, author: '' }, raw));
    if (!val.ok) throw new Error('pack 4 ' + id + ': ' + val.errors[0]); // a broken built-in spec is a build bug, never shipped silently
    S['q4_' + id] = Object.assign(SP.compile(val.spec), { name: '★ ' + val.spec.name + (val.spec.dir === 'short' ? ' (short)' : ''), cat, pack: 4, pro: true, custom: false, tfHint: tf, pine: true });
    NT.PACK4.push('q4_' + id);
  }
  NT.PACK4_CATS = CATS;
  if (Array.isArray(NT.STRAT_CATS)) for (const k of CATS) if (!NT.STRAT_CATS.includes(k)) NT.STRAT_CATS.push(k);
  return NT;
})(typeof module === 'object' && module.exports ? require('./strategies3.js') : self.NT);
if (typeof module === 'object' && module.exports) module.exports = require('./core.js');
