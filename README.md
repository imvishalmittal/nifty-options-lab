# NIFTY Options Lab

A conservative NIFTY options research and paper-trading lab built around deterministic rules, historical actual-contract backtests, and forward paper observation.

**Hosted root dashboard:** https://nifty-options-lab.imvishalmittal.chatgpt.site/

> The project is for research, education, and paper trading. It does not place broker orders or guarantee profitable outcomes.

## Current system

The repository contains two user-facing paths:

1. **Legacy learning dashboard (V0.1)** at `/` — manual/screenshot-based chart-fact learning UI.
2. **Paper/research dashboard** at `/paper` — historical V2 rows plus prospective V2–V11 paper outcomes and stepped-trail fields.

The hosted Sites build can lag GitHub `main`; source readiness and public deployment are separate states.

## Strategy status at a glance

- **Paper observation:** twelve NIFTY ₹180-premium outcomes (V2 through V11, including V3/V10 step alternatives) running as non-additive shadows on shared signals; no broker orders.
- **Completed and rejected:** NIFTY ₹180 V1 fixed stop/target, opening-range negative control, defined-risk Batman, HAI 1:3:2 ratio, intraday iron condor, intraday iron butterfly, and directional defined-credit spread.
- **Completed and rejected:** Morning Tea one-minute proxy failed its frozen execution gates in both the repaired 2025 diagnostic and the Jan–Aug 2026 validation.
- **Completed and rejected:** Quick Flip clean discovery and the six-variant 2020–2024 entry-risk discovery.
- **Terminal diagnostic:** the Jan–Aug 2026 V2/V9, V3/V10 and V6/V11 matched comparison was negative for every variant at normal costs and both stresses. It does not alter prospective paper observation.
- **Completed/rejected:** Stocks-in-Play ORB, late breakout/retest, VWAP pullback, failed opening-range break, and afternoon compression after its untouched 2025 validation.
- **Inconclusive:** the assumption-explicit Williams %R/EMA bear-call replication produced only one 2025 trade and no post-publication 2026 trades.
- **Incomplete specifications:** the 30-minute ATM-selling breakout, monthly “Ramesh–Suresh”, and 0.08-delta smart-strangle ideas.

See [Strategy status and evidence ledger](docs/STRATEGY_STATUS.md) for samples, P&L, profit factors, failure reasons, and the exact paper suite.

## Forward paper suite — V2 through V11

V3 keeps the V2 entry family but changes stop management so risk begins reducing before a fixed ₹220 activation.

| Parameter | Paper rule |
| --- | --- |
| Underlying | NIFTY only |
| Direction | Buy CE or PE only |
| Contract source | Actual nearest weekly NIFTY option contracts from Groww historical/current data |
| Selection reference | ITM CE/PE premium closest to ₹180 at 09:25, using progressive bounded search |
| Signal window | Completed 1-minute crossing above ₹180 from 09:30 until before 09:45 |
| Entry | Next executable 1-minute bar open; entry must be > ₹160 and < ₹220 |
| Starting stop | ₹160 for V2–V8; ₹170 for the V9–V11 cohort |
| Trail gap | 20 premium points |
| Paper trail step | 10 premium points |
| Research comparison | 5-point step vs 10-point step, both with the same 20-point gap |
| Trail update | Based only on completed-bar peak; stop moves in step increments and becomes effective from the next bar |
| Gross breakeven | Reached when the stepped stop rises to the actual entry premium; charges can still make net P/L slightly negative |
| Ambiguity | Same-minute CE and PE signal is rejected |
| Overnight | Never; final intraday fallback is 15:29 |
| Model capital | ₹60,000 |
| Position sizing | Whole lots affordable from model capital and date-correct lot size |
| Execution | Paper only; no broker order placement |

V2 remains preserved as a historical strategy version. Its 110 validated 2025 ledger rows are not rewritten to pretend they used V3 mechanics.

The forward session now records twelve named counterfactual outcomes from shared signals. V9–V11 participate only when the executable entry is strictly between ₹170 and ₹210 and began prospectively on 1 September 2026; they are not backfilled.

| Variant | Frozen forward hypothesis |
| --- | --- |
| V2 | Original ₹220-activated continuous 20-point trail |
| V3-5 | 5-point stepped trail with a 20-point gap |
| V3-10 | 10-point stepped trail with a 20-point gap |
| V4 | NIFTY-confirmed entry, fail-fast below ₹180, then V2 trail |
| V5 | Same NIFTY-confirmed entry as V4, with V3-10 exit mechanics |
| V6 | Same base entry, ₹160 stop, fixed conservative 2R target |
| V7 | Same base entry and V3-10 trail, plus a causal 15-bar failure exit |
| V8 | Same base entry and V3-10 trail, with initial stop at the higher of ₹160 or entry minus 20 points |
| V9 | V2 mirror with ₹170 initial stop and continuous trail activation at ₹210 |
| V10-5 | V3-5 mirror with ₹170 initial stop and entry-anchored 5-point steps |
| V10-10 | V3-10 mirror with ₹170 initial stop and entry-anchored 10-point steps |
| V11 | V6 mirror using ₹170 as the fixed-2R initial stop |

These are alternative simulations of the same opportunities. Their P/L must never be added together as one account result. V5 adds no market-data requests because it shares the V4 candle stream; V6–V11 share the base candle stream.

## Paper dashboard

The `/paper` ledger includes the original trade fields plus V3 diagnostics: strategy version, entry/peak/exit premium, max favorable move, trail step, trail gap, breakeven reached, final stop, exit reason, stop-adjustment count, gross P/L, charges, and net P/L. Missing fields on older V2 rows display as `—` rather than being reconstructed without evidence.

Filters include **year, month, CE/PE, strategy, and profit/loss**. Displayed columns are sortable.

## Historical evidence

The ledger currently contains **110 integrity-passed V2 trades from 2025 Jan–Sep and Nov**. October and December 2025 remain excluded because their completeness gates failed.

V3 is a separately named hypothesis. Its 5-point and 10-point trail outcomes are kept separate from V2 and from one another. Historical and forward rows must not be pooled as if they are the same strategy.

## Automation

Active GitHub Actions workflows are intentionally limited to:

- `CI` — lint, build, rendered-site tests, and strategy regression tests.
- `NIFTY Paper Session` — weekday continuous paper suite starting at about **09:20 IST**, producing V2–V11 shadow outcomes.
- `NIFTY Paper Post-Close Recovery` — at **15:40 IST**, causally replays only an incomplete data/infrastructure session, verifies it, and persists it without overwriting a terminal live outcome.
- `NIFTY Paper Smoke` — manually checks paper mechanics, Groww authentication, and a small historical-data request.
- `Research - NIFTY ...` opportunity workflows — four isolated strategy backtests, their suite chain, and comparison report.

Completed or superseded one-time studies remain preserved as code, tests, documentation, artifacts, and Git history. Quick Flip, Stocks-in-Play, the rejected opportunity modules, afternoon compression after validation, and the six-variant entry-risk discovery are terminally closed. The Williams replication remains inconclusive because its executable sample was effectively empty. Groww-heavy research jobs share a serialized API group to reduce rate-limit conflicts.

## Methodology controls

- No same-bar look-ahead for trailing-stop updates.
- A new stop derived from a completed one-minute bar is effective only from the following bar.
- Stops never move lower.
- Invalid, partial, authentication-failed, rate-limited, CI-failed, or integrity-failed artifacts are not accepted as evidence.
- V3 is explicitly versioned rather than retroactively modifying V2 results.
- The 5-vs-10 comparison is predeclared; selection should consider the full clean sample, costs, drawdown, and robustness rather than one known trade.
- Historical V2–V11 comparisons report both actual participation bands and a strict common-entry cohort, so cohort selection is not confused with exit-rule performance.
- Live-money automation remains out of scope until historical and forward paper evidence are credible.

## Repository map

```text
app/
  page.tsx                         legacy learning dashboard
  paper/page.tsx                   paper dashboard route
  paper-ledger.tsx                 sortable/filterable trade ledger
paper/
  paper-engine.mjs                 current forward paper mechanics
  run-session.mjs                  Groww-backed continuous paper session
  replay-session.mjs               Deterministic post-close recovery
  paper-contract-selection.mjs     Complete 50-point near-spot strike ladder
  build-ledger.mjs                 research-artifact → dashboard ledger conversion
public/paper/
  trades.json                      historical + forward paper trade ledger
  session-status.json              paper-session status snapshot
research/
  nifty-180-momentum-trail.mjs     preserved V2 engine
  nifty-180-stepped-trail.mjs      V3 stepped-trail engine
  groww-backtest-nifty-180-stepped.mjs
.github/workflows/                  CI, research, backfill, and paper workflows
docs/                               strategy, architecture, safety, roadmap, decisions
.openai/hosting.json                existing ChatGPT Sites project identity
```

## Validation

```bash
npm ci
npm run lint
npm test
node --test tests/paper-engine.test.mjs tests/nifty-180-stepped-trail.test.mjs
```

Research workflows also run monthly integrity gates.

## Documentation

- [Strategy status and evidence ledger](docs/STRATEGY_STATUS.md)
- [Current paper-family specification](docs/STRATEGY_SPEC.md)
- [Stepped-trail research](docs/STEPPED_TRAIL_RESEARCH.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Safety and limitations](docs/SAFETY_AND_LIMITATIONS.md)
- [Development](docs/DEVELOPMENT.md)
- [Roadmap](docs/ROADMAP.md)
- [Architecture decisions](docs/DECISIONS.md)
- [Changelog](CHANGELOG.md)

## Project boundary

This repository remains separate from `global-trading-lab`. NIFTY Options Lab is the focused options research/paper environment; the broader repository remains the India/US systematic research platform.
