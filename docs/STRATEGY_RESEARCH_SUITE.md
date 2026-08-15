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

## Acceptance gates before paper-forward trading

These are research-quality gates, not parameters to optimize against the historical data.

1. **Data integrity:** no unresolved timestamp, corporate-action, expiry-selection, strike-selection, look-ahead, or missing-session defect can materially affect the measured result.
2. **Real instruments:** option strategies must use the actual historical contract and actual option candles. Synthetic Black-Scholes premiums cannot establish profitability.
3. **Costs included:** expectancy must remain positive after brokerage, statutory charges, bid/ask or slippage assumptions, and the actual historical lot size where available.
4. **Cost stress:** the conclusion must not reverse under a deliberately worse fill/slippage scenario. A strategy whose edge disappears with modest execution friction is rejected for live use.
5. **Out-of-sample survival:** a positive development result is insufficient. The frozen strategy must remain economically positive in the 2025 validation period and must not be materially contradicted by the available 2026 period.
6. **Breadth / regime robustness:** profits must not be explained almost entirely by one stock, one direction, one isolated month, or one exceptional volatility episode unless that concentration was part of a predeclared strategy hypothesis.
7. **Sample adequacy:** no live recommendation is made from a handful of trades. The report must show enough independent sessions to make loss streak, drawdown, and expectancy estimates meaningful; confidence intervals/bootstraps will be reported rather than relying on win rate alone.
8. **Risk profile:** maximum drawdown, worst trade, consecutive losses, exposure, and capital required must fit the defined learning account before paper-forward approval.
9. **Paper-forward gate:** after historical acceptance, the exact frozen rules must run prospectively with no manual cherry-picking. Any rule change restarts the affected validation stage.
10. **Live gate:** live automation is considered only after the paper-forward ledger agrees materially with historical assumptions and operational controls (stale-data no-trade, max daily loss, kill switch, reconciliation, no averaging) are tested.

High win rate is not an acceptance criterion. Positive expectancy after costs, robustness, and bounded downside are.

## S1 — Quick Flip Scalper V1

Status: **implemented for 5-minute confirmation; ATR data-quality defect fixed; corrected full-history rerun in progress; 1m/3m confirmation pending**.

Frozen rules:

1. Build opening box from 09:15 through 09:30.
2. Compute Wilder ATR(14) from completed prior **regular NSE cash sessions (09:15-15:30)** only; pre-open/auction prints are excluded.
3. Day qualifies only if opening-range size is at least 25% of prior ATR(14).
4. Price must trade outside the opening box.
5. Reversal confirmation outside the box: hammer/inverted-hammer-style rejection or directional engulfing.
6. Enter only after the reversal candle closes, on a later break of its reversal-direction extreme.
7. Stop at the reversal candle wick extreme.
8. Target the opposite side of the opening box.
9. No new entry after 10:45.
10. One trade per symbol/session. If stop and target are both touched within the same unresolved bar, score stop first.

The regular-session ATR requirement was added as a data-correctness fix after Groww 09:00 pre-open candles were found to create impossible ATR values in 2026. It does not change the intended 25%-ATR strategy rule.

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

Status: **selector/execution specification frozen; actual Groww FNO pipeline implemented; five-session real-contract smoke test running before wider history**.

Frozen baseline rules:

1. Use the contemporaneous nearest weekly NIFTY expiry from the historical expiry list; do not assume a fixed weekday across history.
2. At 09:25, use the NIFTY 09:25 candle **open** to identify genuinely ITM CE and ITM PE contracts without using future information.
3. On each side select the ITM contract whose 09:25 option-candle open is closest to ₹180. Do not use future candles to choose the strike.
4. From 09:30 onward, the first selected contract with a completed 1-minute candle closing above ₹180 triggers the trade. This is the frozen mechanical definition of “breaks and sustains”.
5. Baseline entry price is the next 1-minute candle open after that confirming close; this deliberately avoids filling retrospectively at the ₹180 threshold.
6. Stop = ₹160; target = ₹220.
7. If neither is hit, exit by 09:45 at the executable market price.
8. No trailing stop in V1. Cost-to-cost trailing is a later, separately validated variant.
9. Only one side/trade per day; if both confirm in the same minute, mark the day ambiguous rather than choosing with hindsight.
10. Candidate selection searches outward from nearest ITM. If the closest-to-₹180 contract is the deepest contract fetched, mark the day `CANDIDATE_BOUNDARY` and enlarge the search rather than assuming the selected strike is correct.
11. Preserve historical option volume and open interest in the raw test data. Liquidity/OI filters are not retrofitted into V1 after inspecting its result; any such filter is a separately frozen variant.
12. Report actual option premium P&L including historical lot size, brokerage/statutory charges, and slippage assumptions before any trading conclusion.

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

## Evidence-guided ORB research track (separate from video strategies)

Published ORB/intraday-momentum research motivates a separate hypothesis in which opening breakouts are conditioned on abnormal activity/volatility. This track is deliberately not used to rewrite Quick Flip after seeing its results.

Candidate predeclared features for a future development-only study:

- first 5-minute opening direction/range;
- opening relative volume versus the same opening interval over prior sessions;
- prior ATR-normalized range/volatility;
- broad liquid-stock universe and a predeclared “stocks in play” ranking;
- breakout in the opening direction;
- fixed ATR-normalized risk and end-of-day/time exit.

Any thresholds are frozen from external literature or a development sample before a fresh holdout is touched. If the underlying-stock edge survives, the option overlay is then tested on actual option candles.

## Existing simplified opening-range baseline

The earlier 5-minute sweep/re-entry baseline is retained as a negative control, not renamed as Quick Flip. It omitted the 25%-ATR qualification and therefore tested a materially different strategy. Its broad unseen-stock holdout did not show a durable edge.
