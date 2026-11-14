# Community strategy library

Strategies here ship inside ExTerm and show up in **Bots & Backtest → Strategy builder → Community library**,
where anyone can rank them by validation grade on any market.

## Add yours

1. Build it in ExTerm's **Strategy builder** (no code needed) and press **Share JSON**.
2. Add the file to `community/strategies/` with a lower-case-dashed name, e.g. `rsi-dip-buyer.json`.
3. Add an `"author"` field with your GitHub name.
4. Open a pull request. A GitHub Action checks every file automatically.

## Rules

- Files are data, not code: they are validated against a strict schema and interpreted. Anything else is rejected.
- Long-only, spot, paper trading. No promises of returns in names or descriptions.
- Must close trades: every strategy needs an exit rule or a stop / target.
- Run `node tools/validate-strategies.js` locally before opening the pull request.
