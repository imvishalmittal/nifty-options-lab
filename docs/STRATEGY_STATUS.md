# Strategy status and evidence ledger

Last updated: 1 September 2026

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
| 170/210 comparison | V9, V10-5, V10-10, V11 | Reuse the BASE contract and signal; participate only when executable entry is strictly between ₹170 and ₹210 | ₹170 stop with ₹210-activated continuous trail, entry-anchored stepped trails, plus fixed 2R |
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
| V9 | ₹170 initial stop; continuous 20-point trail activates at ₹210 |
| V10-5 | ₹170 initial stop; V3-5 entry-anchored 5-point stepped trail with a 20-point gap |
| V10-10 | ₹170 initial stop; V3-10 entry-anchored 10-point stepped trail with a 20-point gap |
| V11 | Fixed 2R using ₹170 as initial stop |

Important accounting rule: variants are counterfactual outcomes, not independent accounts. Do not add their P&L together. V9–V11 use the same signal but have the narrower ₹170–₹210 executable-entry band, so sessions outside that band are explicitly ineligible for that cohort. All trades are intraday and no position is held overnight.

The latest published paper session is 31 August 2026. The BASE thread closed a CE signal; the NIFTY-confirmed thread recorded no trade. V9–V11 start prospectively on 1 September 2026 and are not backfilled into earlier paper dates. See `public/paper/sessions.json` for the auditable session ledger.

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
| Quick Flip Scalper V1 clean discovery | 2020–2024, 7,277 trades | −349.84R, PF 0.935 | Not modeled by frozen protocol | Not modeled by frozen protocol | **REJECTED** — negative before costs; PF, profitability, yearly-stability, clustered-confidence, and data-quality gates failed |
| NIFTY ₹180 six-variant entry-risk discovery | 2020–2024, 1,243 sessions, 641 shared entries per variant | Best: +₹5,366.43, PF 1.003 (5-point stepped) | Best: −₹188,114.69 | Best: −₹381,595.80 | **REJECTED** — no variant passed; no 2025/2026 run |

### Remaining strategy research — terminal verdicts

Quick Flip's clean discovery produced 7,277 trades, a 25.48% win rate, −349.84R total (−0.0481R/trade), PF 0.935, 388.54R maximum drawdown, 1/5 profitable years, and 20/60 profitable months. Its clustered 95% mean-R interval was −0.0946 to +0.0003. Largest gross-positive-symbol concentration was 7.56%, which passed, but the audit found 75 invalid days across 6/15 symbols and two structural breaks. Evidence: [run 33370182911](https://github.com/imvishalmittal/nifty-options-lab/actions/runs/33370182911).

The definitive NIFTY ₹180 entry-risk discovery merged 60 monthly shards with valid causal/rule integrity: 1,243 sessions, 641 shared entries per variant, 12 missing days, one ambiguous day handled stop-first, and no retry beyond the recovered infrastructure shard. Normal / 0.5-point / 1-point results were:

| Frozen variant | Win rate | Normal P&L / PF / drawdown | 0.5-point P&L | 1-point P&L / PF / drawdown | Positive normal months |
|---|---:|---:|---:|---:|---:|
| Fixed ₹160 / ₹220 current control | 39.00% | −₹238,856.17 / 0.915 / ₹400,948.39 | −₹432,337.29 | −₹625,818.41 / 0.794 / ₹734,109.63 | 25/60 |
| Fixed ₹170 / ₹210 requested comparator | 35.41% | −₹28,472.94 / 0.983 / ₹151,989.58 | −₹221,954.05 | −₹415,435.17 / 0.784 / ₹474,728.85 | 26/60 |
| Entry-relative fixed 2R | 34.63% | −₹11,187.52 / 0.996 / ₹299,859.99 | −₹204,668.64 | −₹398,149.76 / 0.860 / ₹586,366.80 | 28/60 |
| Entry-relative continuous trail | 34.63% | −₹89,030.54 / 0.966 / ₹379,518.42 | −₹282,511.66 | −₹475,992.78 / 0.833 / ₹667,778.54 | 30/60 |
| Entry-relative 5-point stepped trail | 33.85% | +₹5,366.43 / 1.003 / ₹191,274.93 | −₹188,114.69 | −₹381,595.80 / 0.800 / ₹491,529.24 | 33/60 |
| Entry-relative 10-point stepped trail | 30.11% | −₹90,177.66 / 0.950 / ₹271,101.38 | −₹283,658.78 | −₹477,139.90 / 0.770 / ₹572,405.58 | 28/60 |

Every variant failed normalized PF, stress profitability, 1-point PF, yearly stress, and clustered-bootstrap lower-bound gates, except that the 5-point trail was marginally positive at normal costs. Maximum absolute year contribution was 22.9%–33.9%, safely below the 50% concentration ceiling, so concentration was not the reason for rejection. The exact ₹170/₹210 comparator materially reduced the current control's normal loss and drawdown, but remained unprofitable and became worse under either slippage stress. Evidence: [repaired run 33439891121](https://github.com/imvishalmittal/nifty-options-lab/actions/runs/33439891121).

The rejected label applies to the frozen tested rule set. It does not establish that every possible strategy in the same broad family is unprofitable.

### Directional credit-spread yearly robustness

| Year | Trades | Normal P&L | 0.5-point P&L | 1-point P&L |
|---|---:|---:|---:|---:|
| 2020 | 36 | +₹417.07 | −₹4,980.31 | −₹10,377.69 |
| 2021 | 39 | +₹2,534.84 | −₹2,512.71 | −₹7,560.26 |
| 2022 | 51 | +₹2,379.60 | −₹2,717.93 | −₹7,815.46 |
| 2023 | 50 | −₹11,782.88 | −₹16,780.46 | −₹21,778.03 |
| 2024 | 51 | −₹7,263.08 | −₹10,811.36 | −₹14,359.64 |

## Completed diagnostic extension

### Morning Tea stock-options proxy — rejected

Frozen rules: point-in-time 09:15 ranking, top gainer→ATM call and top loser→ATM put, opening-candle filters, causal 09:16 entry, opening-option-candle stop, 10% target, 09:30 time exit, and stop-first handling for ambiguous bars.

The repaired 2025 diagnostic passed integrity after adding dated TATAMOTORS lot sizes:

- 248 sessions, 281 signals, 226 trades
- 141 wins (62.39%); 126 targets, 57 stops, 43 time exits
- 1 missing session (0.40%), within the 2% integrity limit
- normal: +₹79,072.68, PF 1.521, maximum drawdown ₹21,917
- 0.10 point per leg: +₹52,870.40, PF 1.325; 9/12 profitable months
- 0.25 point per leg: +₹13,566.97, PF 1.075; 6/12 profitable months
- 0.50 point per leg: −₹51,938.74, PF 0.756; 4/12 profitable months
- 1.00 point per leg: −₹182,261.15, PF 0.384; 1/12 profitable months

Integrity is now clean and the supplementary 0.10/0.25 cases are profitable. They do not replace the predeclared acceptance scenarios. The frozen rule set still fails 0.5-point and 1-point profitability and monthly robustness, so its final status is **REJECTED**. No 2026 confirmation run is justified and it is not added to paper trading.

Evidence: [repaired Morning Tea diagnostic run](https://github.com/imvishalmittal/nifty-options-lab/actions/runs/33349456840).

## Implemented or reviewed but unverified

| Strategy family | Current state | What is missing |
|---|---|---|
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
