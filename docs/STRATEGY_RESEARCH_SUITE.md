# Intraday options research suite

The project keeps each video-derived idea as a separate hypothesis. Rules are frozen before results are inspected; strategies are not blended to rescue weak backtests.

## Validation policy

All strategies must report at least:

- trade count and trade frequency;
- win rate and target/stop/time-exit rates;
- average and total R where an underlying-risk definition exists;
- rupee P&L after realistic costs for option strategies;
- maximum drawdown and loss streak before any paper/live recommendation;
- year/period splits: 2020-2024 research, 2025 validation, 2026 recent validation;
- symbol/direction/pattern breakdown where applicable.

A strategy that works only in one recent slice is not treated as validated. Post-hoc winners (a stock, direction, pattern, time window, or strike discovered after inspecting results) become new hypotheses and require a fresh holdout.

## S1 — Quick Flip Scalper V1

Status: **implemented for 5-minute confirmation; 1m/3m confirmation pending**.

Frozen rules:

1. Build opening box from 09:15 through 09:30.
2. Compute Wilder ATR(14) from completed prior sessions only.
3. Day qualifies only if opening-range size is at least 25% of prior ATR(14).
4. Price must trade outside the opening box.
5. Reversal confirmation outside the box: hammer/inverted-hammer-style rejection or directional engulfing.
6. Enter only after the reversal candle closes, on a later break of its reversal-direction extreme.
7. Stop at the reversal candle wick extreme.
8. Target the opposite side of the opening box.
9. No new entry after 10:45.
10. One trade per symbol/session. If stop and target are both touched within the same unresolved bar, score stop first.

Next refinement is not parameter tuning: fetch 1-minute raw data, construct 1m/3m/5m confirmations from the same raw feed, and compare them as predeclared variants.

## S2 — 30-minute breakout / option-selling strategy

Status: **specification pending before implementation**.

Known rules from the supplied summary:

- opening range is the first 30-minute candle (09:15-09:45);
- act after a breakout of that range;
- ATM option is sold;
- cited option-premium target is 20-30 points and stop is 50 points.

Still unresolved and therefore not guessed:

- exact option side sold after an upside/downside breakout;
- whether breakout requires touch, close, or sustained close;
- exact target value (20 vs 30) and whether it is fixed or conditional;
- re-entry and forced-exit rules.

## S3 — NIFTY ₹180 Premium Momentum V1

Status: **selector/execution specification frozen; historical FNO data pipeline pending**.

Frozen baseline rules:

1. Use the contemporaneous nearest weekly NIFTY expiry.
2. At 09:25, use NIFTY spot to identify genuinely ITM CE and ITM PE contracts.
3. On each side select the ITM contract whose contemporaneous premium is closest to ₹180. Do not use future candles to choose the strike.
4. From 09:30 onward, the first selected contract with a completed 1-minute candle closing above ₹180 triggers the trade. This is the mechanical definition of “breaks and sustains”.
5. Baseline entry price is the next executable price after that confirming close; backtests must include conservative slippage.
6. Stop = ₹160; target = ₹220.
7. If neither is hit, exit by 09:45 at the executable market price.
8. No trailing stop in V1. Cost-to-cost trailing is a later, separately validated variant.
9. Only one side/trade per day; if both confirm in the same minute, mark the day ambiguous rather than choosing with hindsight.
10. Report actual option premium P&L including lot size, brokerage/statutory charges, and slippage assumptions before any trading conclusion.

Groww historical FNO expiries, contracts, and candles are the intended source. No synthetic option pricing will be used to claim performance.

## S4 — Morning Tea stock-option strategy

Status: **specification pending; do not backtest guessed rules**.

Known rules:

- F&O stocks rather than index options;
- preselection from top F&O gainers/losers;
- trading only from 09:15 to 09:30;
- ATM options only;
- price-action/open-low or open-high matching is important;
- strict stop and stop trading after the morning opportunity.

Missing mechanical details:

- observation time for ranking top gainers/losers;
- exact open≈low/open≈high tolerance;
- confirmation/entry trigger;
- stop and target formula;
- tie-breaking if multiple stocks qualify.

These must be recovered from the source material before implementation.

## Existing simplified opening-range baseline

The earlier 5-minute sweep/re-entry baseline is retained as a negative control, not renamed as Quick Flip. It omitted the 25%-ATR qualification and therefore tested a materially different strategy. Its broad unseen-stock holdout did not show a durable edge.
