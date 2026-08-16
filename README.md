# NIFTY Options Lab

A conservative NIFTY options research and paper-trading lab built around deterministic rules, historical actual-contract backtests, and forward paper observation.

**Hosted root dashboard:** https://nifty-options-lab.imvishalmittal.chatgpt.site/

> The project is for research, education, and paper trading. It does not place broker orders or guarantee profitable outcomes.

## Current system

The repository now contains two distinct paths:

1. **Legacy learning dashboard (V0.1)** at `/` — manual/screenshot-based chart-fact learning UI.
2. **Momentum paper system (V2)** at `/paper` — historical trade ledger plus forward paper-trading journal. The route is present in `main`; the hosted Sites build may require republishing before the public `/paper` URL reflects the newest code.

## Current paper strategy — NIFTY ₹180 Momentum V2

The forward paper rule is frozen for observation; it must not be tuned based on tomorrow's outcome or one known historical trade.

| Parameter | Paper rule |
| --- | --- |
| Underlying | NIFTY only |
| Direction | Buy CE or PE only |
| Contract source | Actual nearest weekly NIFTY option contracts from Groww historical/current data |
| Selection reference | ITM CE/PE premium closest to ₹180 at 09:25, using progressive bounded search |
| Signal window | Completed 1-minute crossing above ₹180 from 09:30 until before 09:45 |
| Entry | Next completed/executable 1-minute bar open; entry must be > ₹160 and < ₹220 |
| Starting stop | ₹160 |
| Trail activation | Completed 1-minute bar peak reaches ₹220 |
| Trail | 20 premium points below completed-bar peak; stop only moves upward and becomes effective from the next bar |
| Ambiguity | Same-minute CE and PE signal is rejected |
| Overnight | Never; final intraday fallback is 15:29 |
| Model capital | ₹60,000 |
| Position sizing | Whole lots affordable from model capital and date-correct lot size |
| Execution | Paper only; no broker order placement |
| Costs | Date-sensitive transaction costs plus explicit slippage stress in research |

Historical results use real historical option candles and contracts but simulated causal execution. They are not actual fills.

## Paper dashboard

The `/paper` table includes:

- row number;
- date;
- index/stock name;
- weekly expiry;
- number of lots;
- CE/PE call type;
- strike price;
- starting target/trail activation;
- starting stop loss;
- ending stop loss;
- trade entry time;
- trade exit time;
- stop-loss adjustment count;
- total net profit/loss.

Filters: **year, month, CE/PE, profit/loss**. Every displayed column is sortable and rows use alternating shading.

The ledger currently contains **110 integrity-passed 2025 momentum trades** from Jan–Sep and Nov. October and December 2025 are intentionally excluded because their monthly completeness checks failed. A 2026 Jan–Aug holdout is being generated separately and only integrity-passed 20-point rows are eligible for the paper ledger.

## Automation

Key active GitHub Actions workflows include:

- `CI` — lint, build, rendered-site tests, and paper-engine regression tests.
- `NIFTY 180 Momentum 2025` — monthly development research.
- `NIFTY 180 Momentum 2026` — holdout validation.
- `NIFTY Paper Session` — weekday continuous paper session starting around 09:20 IST.
- `Paper Ledger Backfill` — converts validated research artifacts into the dashboard ledger.
- Existing opening-range, quick-flip, stocks-in-play, and V1 ₹180 workflows remain as research history/negative controls.

Groww-heavy research jobs share a serialized API concurrency group to reduce rate-limit conflicts.

## Important methodology controls

- No same-bar look-ahead for trailing-stop updates.
- New stops become effective only after the source 1-minute bar has completed.
- Invalid, partial, authentication-failed, rate-limited, CI-failed, or integrity-failed artifacts are not accepted as evidence.
- 2025 is development evidence for V2; 2026 is treated as holdout evidence.
- The paper rule is not changed merely because another trail gap matches a known winning trade more closely.
- Live-money automation is out of scope until historical validation and forward paper evidence are both credible.

## Repository map

```text
app/
  page.tsx                 legacy learning dashboard
  paper/page.tsx           paper dashboard route
  paper-ledger.tsx         sortable/filterable trade ledger
paper/
  paper-engine.mjs         deterministic paper strategy mechanics
  run-session.mjs          Groww-backed continuous paper session
  build-ledger.mjs         research-artifact → dashboard ledger conversion
public/paper/
  trades.json              historical + forward paper trade ledger
  session-status.json      paper-session status snapshot
research/                   historical strategy engines/backtests
.github/workflows/          CI, research, backfill, and paper workflows
docs/                       current strategy, architecture, safety, roadmap, decisions
.openai/hosting.json        existing ChatGPT Sites project identity
```

## Validation

```bash
npm ci
npm run lint
npm test
node --test tests/paper-engine.test.mjs
```

Research workflows also run their strategy-specific tests and monthly integrity gates.

## Documentation

- [Current strategy specification](docs/STRATEGY_SPEC.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Safety and limitations](docs/SAFETY_AND_LIMITATIONS.md)
- [Development](docs/DEVELOPMENT.md)
- [Roadmap](docs/ROADMAP.md)
- [Architecture decisions](docs/DECISIONS.md)
- [Changelog](CHANGELOG.md)

## Project boundary

This repository remains separate from `global-trading-lab`. NIFTY Options Lab is the focused options research/paper environment; the broader repository remains the India/US systematic research platform.
