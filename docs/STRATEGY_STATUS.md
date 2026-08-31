# Strategy status and evidence ledger

Last updated: 31 August 2026

This is the repository's single status index for strategies that were reviewed, implemented, backtested, rejected, or placed in paper observation. Detailed frozen rules remain in the individual specifications; this file records outcomes and promotion status.

## Status definitions

- **PAPER** — simulated forward observation only. No broker order is placed.
- **DIAGNOSTIC** — a run is repairing or measuring execution/data integrity; no promotion decision yet.
- **REJECTED** — completed evidence failed at least one predeclared acceptance gate.
- **UNVERIFIED** — code or a hypothesis exists, but no clean, consolidated result supports a decision.
- **INCOMPLETE SPEC** — the source idea lacks enough deterministic rules for a defensible backtest.

A strategy is never promoted because its zero-slippage result alone is positive. Its frozen acceptance gates, costs, stress scenarios, data completeness, robustness, and drawdown must all pass.

## What is in paper trading now

The scheduled paper workflow observes the NIFTY weekly-option premium-entry family. It is a simulator and does not send broker orders.

| Thread | Variants | Shared entry | Difference measured |
|---|---|---|---|
| BASE | V2, V3-5, V3-10, V6, V7, V8 | Select nearest weekly ITM CE and PE near ₹180 at 09:25; completed cross above ₹180 from 09:30 to before 09:45; enter next bar if premium is above ₹160 and below ₹220 | Exit/risk overlays |
| NIFTY-confirmed | V4, V5 | Same option setup, with matching NIFTY confirmation and fail-fast below ₹180 | V2 versus V3-10 exit after confirmed entry |

Variant meanings:

| Variant | Paper rule |
|---|---|
| V2 | Original ₹220-activated continuous 20-point trailing stop |
| V3-5 | 5-point stepped trail with a 20-point gap |
| V3-10 | 10-point stepped trail with a 20-point gap |
| V4 | NIFTY-confirmed entry, fail-fast below ₹180, V2 exit |
| V5 | NIFTY-confirmed entry, fail-fast below ₹180, V3-10 exit |
| V6 | Fixed conservative 2R exit |
| V7 | V3-10 plus a causal 15-bar failure exit |
| V8 | V3-10 with initial stop max(₹160, entry minus 20 points) |

Important accounting rule: variants are counterfactual outcomes on the same entry cohort. Do not add their P&L together or interpret them as eight independent accounts. The ledger records one outcome per variant so exits can be compared fairly. All trades are intraday and no position is held overnight.

The latest published paper session is 28 August 2026. The BASE thread closed a PE signal; the NIFTY-confirmed thread recorded no trade. See `public/paper/sessions.json` for the auditable session ledger.

## Completed backtests

Amounts below include the repository's normal cost model. “0.5” and “1.0” are the strategy's adverse slippage stress scenarios unless otherwise stated.

| Strategy | Evidence window and sample | Normal | 0.5 stress | 1.0 stress | Outcome |
|---|---|---:|---:|---:|---|
| NIFTY ₹180 Premium V1 fixed stop/target | 153 sessions, 72 trades | +₹199.84 | −₹4,477.22 | −₹9,154.28 | **REJECTED** — negligible normal edge vanished under stress; 11 sessions missing |
| Opening-range sweep/reversal negative control | 2020–Aug 2026, best 15-minute variant, 604 trades | +13.62R (+0.023R/trade) | Not applicable | Not applicable | **REJECTED** — unstable; 2025 was −16.08R while 2026 was +19.25R |
| Defined-risk Batman | 2025, 47 sessions/trades | −₹44,330.11, PF 0.652 | −₹67,286.80, PF 0.536 | −₹89,122.08, PF 0.452 | **REJECTED** |
| HAI 1:3:2 ratio replication | 2025, 50 trades | +₹32,070, PF 2.435 | +₹11,562, PF 1.366 | −₹8,945.92, PF 0.793 | **REJECTED** — failed 1-point profitability, drawdown, and winner-concentration gates |
| Intraday iron condor | 2020–2024, 1,243 sessions, 269 trades | −₹53,486.88, PF 0.362 | −₹108,360.26, PF 0.099 | −₹163,158.74, PF 0.023 | **REJECTED** — all five stress years negative |
| Intraday iron butterfly | 2020–2024, 1,243 sessions, 146 trades | −₹33,333.00, PF 0.269 | −₹64,218.01, PF 0.069 | −₹95,103.02, PF 0.017 | **REJECTED** — no targets and all five stress years negative |
| Directional defined-credit spread | 2020–2024, 1,243 sessions, 227 trades | −₹13,714.46, PF 0.873 | −₹37,802.77, PF 0.681 | −₹61,891.08, PF 0.523 | **REJECTED** — every profitability and yearly-stress gate failed |

The rejected label applies to the frozen tested rule set. It does not establish that every possible strategy in the same broad family is unprofitable.

### Directional credit-spread yearly robustness

| Year | Trades | Normal P&L | 0.5-point P&L | 1-point P&L |
|---|---:|---:|---:|---:|
| 2020 | 36 | +₹417.07 | −₹4,980.31 | −₹10,377.69 |
| 2021 | 39 | +₹2,534.84 | −₹2,512.71 | −₹7,560.26 |
| 2022 | 51 | +₹2,379.60 | −₹2,717.93 | −₹7,815.46 |
| 2023 | 50 | −₹11,782.88 | −₹16,780.46 | −₹21,778.03 |
| 2024 | 51 | −₹7,263.08 | −₹10,811.36 | −₹14,359.64 |

## Diagnostic in progress

### Morning Tea stock-options proxy

Frozen rules: rank the prior session's NIFTY losers, match the 09:15 stock opening candle, apply the specified CE/PE mapping and bullish option-candle filter, enter at 09:16, use the opening-candle stop, 10% target, 09:30 time exit, and stop-first handling for ambiguous bars.

The first 2025 run produced useful but non-decision-grade evidence:

- 248 sessions, 281 signals, 208 trades
- 62.98% win rate; 118 targets, 50 stops, 40 time exits
- +1.937 option points per trade before lot sizing and costs
- normal: +₹83,106.92, PF 1.589, maximum drawdown ₹20,987
- 0.5 point per leg: −₹36,510.04, PF 0.813
- 1.0 point per leg: −₹155,437.98, PF 0.421
- 19 missing sessions, or 7.66%, which failed the 2% integrity gate

That run is **not accepted**: the normal case was profitable, but the original stress cases were not and missing-data integrity failed. Most missing sessions came from absent historical TATAMOTORS lot-size provenance.

The current diagnostic rerun adds dated TATAMOTORS lot sizes and supplementary 0.10/0.25-point-per-leg scenarios. It does not change ranking, signal, entry, exit, costs, original 0/0.5/1.0 scenarios, or acceptance gates. Final status remains **DIAGNOSTIC** until the run completes and every gate is evaluated.

Evidence: [current Morning Tea diagnostic run](https://github.com/imvishalmittal/nifty-options-lab/actions/runs/33349456840).

## Implemented or reviewed but unverified

| Strategy family | Current state | What is missing |
|---|---|---|
| Quick Flip Scalper V1 | **UNVERIFIED** | Earlier outputs were invalidated by pre-open/closing-auction defects; a clean consolidated rerun is required |
| Stocks-in-Play ORB | **UNVERIFIED** | Underlying-selection hypothesis is implemented, but no clean final outcome is documented |
| Late breakout and retest | **UNVERIFIED** | Research module exists; no accepted consolidated result |
| VWAP pullback continuation | **UNVERIFIED** | Research module exists; no accepted consolidated result |
| Failed opening-range break | **UNVERIFIED** | Research module exists; no accepted consolidated result |
| Afternoon compression breakout | **UNVERIFIED** | Research module exists; no accepted consolidated result |
| 30-minute breakout with ATM option selling | **INCOMPLETE SPEC** | Source rules do not fully define selection, timing, risk, and exit behavior |
| Williams %R plus 5/15/50 EMA bear-call spread | **INCOMPLETE SPEC** | Needs final deterministic contract selection, entry, risk, and exit rules |
| Monthly “Ramesh–Suresh” strangle/iron condor | **INCOMPLETE SPEC** | Entry timing and stop/adjustment rules are incomplete |
| Smart strangle near 0.08 delta | **INCOMPLETE SPEC** | Educational strike-selection idea lacks complete entry, stop, adjustment, and exit rules |

Unverified and incomplete ideas are not paper traded and must not be represented as selected strategies.

## Promotion policy

1. Freeze deterministic rules and acceptance gates before viewing the decision sample.
2. Validate source data, lot-size provenance, session coverage, timestamps, expiry mapping, and causal bar use.
3. Include all modeled costs and run adverse slippage scenarios.
4. Require robustness across years or months; reject one-period or one-winner dependence.
5. Advance discovery to validation only if every discovery gate passes.
6. Advance validation to holdout only if every validation gate passes.
7. Paper-observe only after the appropriate evidence stage, and keep paper outcomes isolated by variant.
8. Live execution remains out of scope unless separately authorized and engineered with broker-level risk controls.

## Detailed references

- `docs/STRATEGY_SPEC.md` — NIFTY premium-entry baseline
- `docs/MORNING_TEA_SPEC.md` — frozen Morning Tea rules and gates
- `docs/OPENING_RANGE_BASELINE_RESULTS.md` — negative-control results
- `docs/IRON_CONDOR_RESEARCH.md` — iron-condor design
- `docs/STRATEGY_RESEARCH_SUITE.md` — research implementations
- `docs/OPPORTUNITY_RESEARCH.md` — isolated intraday opportunity modules
- `docs/PAPER_V3_FORWARD_OBSERVATION.md` — paper-variant operating model
