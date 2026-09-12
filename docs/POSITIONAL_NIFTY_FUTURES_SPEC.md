# P1 — positional NIFTY futures trend benchmark

Status: **REJECT_DISCOVERY — terminal**  
Frozen: 12 September 2026, before discovery results

## Terminal result — 12 September 2026

The unchanged 2016–2022 discovery completed in [run 34687277815](https://github.com/imvishalmittal/nifty-options-lab/actions/runs/34687277815).

- 117 completed segments; normal net P&L **+₹494,416.22**, PF **1.4051**, and maximum drawdown **₹309,966.01**.
- Net P&L remained positive at 1-point (**+₹486,391.64**) and 2-point (**+₹470,342.49**) execution stress.
- The candidate nevertheless failed the frozen drawdown gate, profitable-year gate (4/7), year-concentration gate (53.79%), and monthly-clustered bootstrap lower bound (**−₹2,777.06**).
- Coverage passed with 1 missing session out of 1,724 (0.0580%).

The 2023–2024 validation and 2025–2026 holdout remain sealed. Nothing from P1 was added to paper or live trading. See [the consolidated new-generation results](NEW_GENERATION_RESULTS.md) for complete annual, stability, concentration, and integrity evidence.

## Question

Does a low-turnover, multi-day NIFTY futures trend rule survive actual dated
contracts, rolls, charges, adverse slippage, missing-data controls, and a
sealed validation boundary?

This is an aggregate-evidence hypothesis motivated by SEBI's higher profitable
incidence and lower cost share for index-futures traders relative to
index-options traders. It is not claimed to reproduce the profitable cohort's
unknown strategy.

## Frozen rules

| Component | Rule |
|---|---|
| Signal data | Completed daily NIFTY cash OHLC |
| Trend | 100-session simple moving average |
| Hysteresis | 0.5 × 20-session ATR around the SMA |
| Long | Close strictly above SMA100 + 0.5 ATR20 |
| Short | Close strictly below SMA100 − 0.5 ATR20 |
| Neutral band | Retain the current direction; do not churn |
| Timing | Act only at the next NSE session open |
| Contract | Nearest actual NIFTY `FUTIDX` contract with at least seven calendar days remaining; otherwise next listed expiry |
| Size | One historical NIFTY futures lot; no pyramiding |
| Roll | Close old and open new contract at the same next-session open |
| Terminal exit | Final decision-period settlement |
| Normal execution | 0.5 futures point adverse slippage per side plus charges |
| Stress | 1 and 2 futures points adverse slippage per side plus charges |

The engine uses official NSE daily derivatives bhavcopies for futures
contracts and Yahoo's NIFTY daily series only for the underlying signal.
Bhavcopy sessions without the required old/new contract are missing data, not
zero-return observations.

## Period boundary

| Stage | Dates | Access rule |
|---|---|---|
| Warm-up | 2015 | Indicators only |
| Discovery | 2016–2022 | Current run |
| Validation | 2023–2024 | Sealed unless every discovery gate passes |
| Holdout | 2025–11 Sep 2026 | Sealed unless validation passes |

## Frozen discovery gates

- at least 60 completed contract segments;
- at most 2% missing eligible sessions;
- normal net P&L above zero and profit factor at least 1.20;
- 1-point stress net P&L above zero and profit factor at least 1.05;
- 2-point stress net P&L above zero;
- normal maximum drawdown at most ₹2.5 lakh for the one-lot track;
- at least five profitable discovery years;
- no year above 50% of gross positive yearly P&L;
- monthly-clustered 95% bootstrap lower mean above zero.

Failure of any decisive gate freezes the verdict as `REJECT_DISCOVERY` and
keeps validation and holdout sealed. Passing discovery permits an unchanged
2023–2024 validation run; it does not authorize paper or live trading.

## Integrity constraints

- completed-bar signal and next-session execution;
- actual dated futures and date-correct lot sizes;
- old and new contract opens required for every roll;
- explicit normal/1-point/2-point execution scenarios;
- no parameter changes after seeing discovery results;
- no broker orders and no change to the existing paper suite.
