# Remaining Option-Selling Discovery Protocol

Status: FROZEN BEFORE DATA ACCESS  
Frozen: 2026-09-01  
Scope: research only; no paper or live promotion

These are assumption-explicit hypotheses. The source videos omit deterministic timing, stop, adjustment, hedge, or exit rules, and no unique source was recovered for the 30-minute breakout. Results must not be described as exact replications.

## Shared methodology

- Discovery: 2020-01-01 through 2024-12-31.
- Untouched validation: 2025 only when every discovery gate for that strategy passes.
- Untouched holdout: 2026 only when 2025 validation passes.
- One-minute Groww candles; decisions use completed bars and fills use the next synchronized bar open.
- Actual listed contracts only. No synthetic option prices or gap-filled strikes.
- Nearest eligible expiry at entry.
- Normal Groww charges plus adverse slippage of 0.5 and 1.0 option point on every leg at both entry and exit.
- Synchronized timestamps are required for all legs. A missing leg invalidates that candidate, never the market result.
- When a one-minute bar can touch both target and stop, the stop is applied first.
- Corporate-action and discontinuity skips are reported, never silently removed.
- No parameter may change after any historical result is viewed.

## A. Thirty-minute opening-range ATM credit spread

Hypothesis: a confirmed break of the first 30-minute NIFTY cash range can be expressed with bounded-risk ATM option selling.

- Underlying: NIFTY 50 cash.
- Opening range: 09:15:00 through 09:44:59 IST.
- Confirmation: first completed five-minute candle from 09:45 onward closing strictly outside the range.
- Entry: next synchronized one-minute option-bar open after confirmation.
- Upward break: short nearest ATM put; long put 300 points lower.
- Downward break: short nearest ATM call; long call 300 points higher.
- Expiry: nearest listed expiry with at least one calendar day remaining.
- Maximum one trade per session; no re-entry.
- Profit target: close when spread debit is at or below 50% of initial credit.
- Stop: close when spread debit is at or above 200% of initial credit.
- Time exit: 15:15 IST same day.
- No adjustment or discretionary filter.

## B. Monthly large-cap RSI iron condor

Hypothesis: weak daily and weekly RSI conditions in very large liquid stocks may support a delta-selected, defined-risk monthly condor.

- Frozen watchlist: SBIN, RELIANCE, TCS, INFY, WIPRO, CIPLA, DRREDDY, SUNPHARMA, BAJAJ-AUTO, ASIANPAINT.
- Signal data: RSI(14) from completed daily and weekly underlying bars only.
- Eligibility: both daily RSI and weekly RSI are below 50 at the decision time.
- Entry schedule: first trading day after the preceding monthly expiry, decision at 09:44 and entry at the 09:45 open.
- Expiry: next monthly expiry.
- Short call: listed contract closest to +0.10 delta.
- Short put: listed contract closest to -0.12 delta.
- Long call: listed contract closest to +0.05 delta, farther OTM than the short call.
- Long put: listed contract closest to -0.06 delta, farther OTM than the short put.
- Delta is calculated causally from entry-time underlying and option data; selection error is recorded.
- Discontinuity proxy: skip when the absolute underlying gap from prior close to entry open exceeds 12%; report separately. This is not claimed to identify every corporate action.
- Profit target: close at 50% of initial net credit.
- Stop: close at 200% of initial net credit.
- Time exit: 15:15 on the trading day before expiry, or last synchronized bar if earlier.
- No adjustment, rolling, or re-entry.

## C. Weekly 0.08-delta NIFTY smart condor

Hypothesis: a low-delta weekly NIFTY short strangle can survive realistic costs only when converted to bounded risk with disaster hedges.

- Entry schedule: first trading session after the preceding weekly expiry, decision at 09:44 and entry at 09:45.
- Expiry: next listed weekly NIFTY expiry.
- Short legs: listed call closest to +0.08 delta and put closest to -0.08 delta.
- Long disaster hedges: listed call closest to +0.03 delta and put closest to -0.03 delta, each farther OTM than its short.
- Profit target: close at 50% of initial net credit.
- Stop: close at 200% of initial net credit.
- Time exit: 15:15 on the trading day before expiry, or last synchronized bar if earlier.
- No adjustment, rolling, or re-entry.
- Report return on defined maximum-loss capital. The video's approximate 1% weekly ROI is descriptive, not an acceptance gate.

## Frozen discovery gates

Each strategy is evaluated independently.

1. Strict causal and structural integrity passes.
2. At least 100 trades for daily/weekly strategies; at least 40 trades for the monthly stock-condor aggregate.
3. Positive net P&L and profit factor at least 1.20 under normal costs.
4. Positive net P&L and profit factor at least 1.05 at 0.5-point-per-leg stress.
5. Positive net P&L at 1-point-per-leg stress.
6. Positive result in at least three of five discovery years.
7. Positive result in at least 55% of active months.
8. Clustered-by-month 95% bootstrap lower bound of mean trade P&L is above zero under normal costs.
9. No calendar year supplies more than 50% of gross positive P&L.
10. Missing or structurally invalid eligible sessions do not exceed 2%.

Failure of any decisive gate rejects the strategy and keeps 2025/2026 sealed. Passing discovery permits only untouched 2025 validation with the same rules and gates. Passing validation permits only untouched 2026 holdout. Nothing is promoted automatically.
