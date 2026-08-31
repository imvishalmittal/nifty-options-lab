# Intraday options research suite

## Current outcome snapshot

The detailed evidence ledger is `docs/STRATEGY_STATUS.md`. Current decisions are:

- **Paper:** V2, V3-5, V3-10, V4, V5, V6, V7, and V8, as non-additive shadow outcomes.
- **Rejected after completed testing:** NIFTY ₹180 V1 fixed stop/target, opening-range negative control, Batman, HAI 1:3:2, intraday iron condor, intraday iron butterfly, and directional defined-credit spread.
- **Diagnostic:** Morning Tea 2025 one-minute proxy. The initial result was profitable only at zero slippage and failed both missing-data and original stress gates; a repaired diagnostic run is in progress.
- **Unverified:** Quick Flip, Stocks-in-Play ORB, and the four isolated opportunity modules.
- **Incomplete specification:** 30-minute breakout/ATM selling, Williams/EMA bear-call, monthly “Ramesh–Suresh”, and 0.08-delta smart-strangle ideas.

No rejected, unverified, or incomplete strategy is in paper trading.

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

1. **Data integrity:** no unresolved timestamp, corporate-action, expiry-selection, strike-selection, look-ahead, missing-session, auction-session, or API-rate-limit defect can materially affect the measured result.
2. **API completeness:** a period affected by HTTP 429/rate-limit exhaustion, partial contract search, or incomplete candle retrieval is invalid evidence. It must be rerun; missing API data must never silently become a no-trade day.
3. **Real instruments:** option strategies must use the actual historical contract and actual option candles. Synthetic Black-Scholes premiums cannot establish profitability.
4. **Costs included:** expectancy must remain positive after brokerage, statutory charges, bid/ask or slippage assumptions, and the actual historical lot size where available.
5. **Cost stress:** the conclusion must not reverse under a deliberately worse fill/slippage scenario. A strategy whose edge disappears with modest execution friction is rejected for live use.
6. **Out-of-sample survival:** a positive development result is insufficient. The frozen strategy must remain economically positive in the 2025 validation period and must not be materially contradicted by the available 2026 period.
7. **Breadth / regime robustness:** profits must not be explained almost entirely by one stock, one direction, one isolated month, or one exceptional volatility episode unless that concentration was part of a predeclared strategy hypothesis.
8. **Sample adequacy:** no live recommendation is made from a handful of trades. The report must show enough independent sessions to make loss streak, drawdown, and expectancy estimates meaningful; confidence intervals/bootstraps will be reported rather than relying on win rate alone.
9. **Risk profile:** maximum drawdown, worst trade, consecutive losses, exposure, and capital required must fit the defined learning account before paper-forward approval.
10. **Paper-forward gate:** after historical acceptance, the exact frozen rules must run prospectively with no manual cherry-picking. Any rule change restarts the affected validation stage.
11. **Live gate:** live automation is considered only after the paper-forward ledger agrees materially with historical assumptions and operational controls (stale-data no-trade, max daily loss, kill switch, reconciliation, no averaging) are tested.

High win rate is not an acceptance criterion. Positive expectancy after costs, robustness, and bounded downside are.

### Shared Groww research infrastructure

All Groww-heavy GitHub Actions jobs use the repository-wide `groww-backtest-api` concurrency group with `queue: max`, so API jobs execute one at a time instead of racing a single token. Matrix data jobs use `max-parallel: 1`. Legacy runs started before this queue existed are not mixed with not yet supported by a clean consolidated result-methodology results.

Stock-candle fetches already use retry/backoff and a pause between chunks. The option backtester additionally spaces Groww calls, records request/rate-limit diagnostics, and uses progressive strike selection to reduce historical API load.

## S1 — Quick Flip Scalper V1

Status: **implemented for 5-minute confirmation; pre-open and closing-auction data defects corrected; fresh full-history rerun not yet supported by a clean consolidated result; 1m/3m confirmation pending**.

Frozen rules:

1. Build opening box from 09:15 through 09:30.
2. Compute Wilder ATR(14) from completed prior **continuous NSE cash sessions 09:15-15:15** only. Groww 09:00 pre-open/auction prints and 15:15+ closing-auction prints are excluded.
3. Day qualifies only if opening-range size is at least 25% of prior ATR(14).
4. Price must trade outside the opening box.
5. Reversal confirmation outside the box: hammer/inverted-hammer-style rejection or directional engulfing.
6. Enter only after the reversal candle closes, on a later break of its reversal-direction extreme.
7. Stop at the reversal candle wick extreme.
8. Target the opposite side of the opening box.
9. No new entry after 10:45.
10. One trade per symbol/session. If stop and target are both touched within the same unresolved bar, score stop first.
11. An unresolved trade ignores 15:15+ closing-auction bars and exits from the last eligible continuous-session five-minute bar.

The 09:15-15:15 session definition is a data-comparability rule, not a strategy optimization. It was added after Groww pre-open prints created impossible 2026 ATRs and after NSE introduced the closing-auction session for eligible F&O stocks in August 2026.

Earlier 2025/2026 Quick Flip outputs produced before the continuous-session correction are retained only as diagnostics and are stale for strategy acceptance. A separate corporate-action audit checks structural overnight discontinuities before those periods are judged.

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

Status: **actual Groww FNO pipeline implemented; execution/clock defects found by smoke testing and fixed; throttled cost-aware validation not yet supported by a clean consolidated result**.

Frozen baseline rules:

1. Use the contemporaneous nearest weekly NIFTY expiry from the historical expiry list; do not assume a fixed weekday across history.
2. At 09:25, use the NIFTY 09:25 candle **open** to identify genuinely ITM CE and ITM PE contracts without using future information.
3. On each side select the ITM contract whose 09:25 option-candle open is closest to ₹180. Do not use future candles to choose the strike.
4. Candidate search proceeds from nearest ITM toward deeper ITM and fetches only 09:25 selection data until ₹180 is bracketed. Full 09:25-09:45 candles are then fetched only for the selected CE and PE. If the maximum search depth still does not bracket ₹180, mark `CANDIDATE_BOUNDARY`; do not score the day.
5. From 09:30 onward, a signal requires an actual completed 1-minute **cross from a previous close at/below ₹180 to a close above ₹180**. A contract already above ₹180 before 09:30 does not qualify merely by remaining above it.
6. Baseline entry price is the next 1-minute candle open after the crossing candle; this deliberately avoids filling retrospectively at ₹180.
7. If the confirming candle has already closed at/above ₹220, reject the setup because the advertised move has completed before the trade can be executed.
8. The executable entry must be strictly between ₹160 and ₹220. An entry at/above the fixed target or at/below the fixed stop is a no-trade, never a retroactive win.
9. Stop = ₹160; target = ₹220.
10. A one-minute timestamp is treated as the start of that interval. A 09:44 signal cannot create a 09:45 entry because no holding interval remains before the forced exit.
11. Stops/targets are evaluated only on bars beginning before 09:45. If still open at 09:45, exit at the **09:45 bar open**; do not use that bar's later high/low/close.
12. No trailing stop in V1. Cost-to-cost trailing is a later, separately validated variant.
13. Only one side/trade per day; if CE and PE cross in the same minute, mark the day ambiguous rather than choosing with hindsight.
14. Preserve historical option volume and open interest at selection time. Liquidity/OI filters are not retrofitted into V1 after inspecting its result; any such filter is a separately frozen variant.
15. For 2026 NIFTY contracts use the applicable 65-unit market lot. Older periods must use date-appropriate lot sizes rather than back-applying 65.
16. Report actual option premium P&L plus Groww brokerage/statutory charges and explicit 0.5/1.0 premium-point-per-leg slippage stress before any trading conclusion.
17. Record API request count and rate-limit retries. Any run ending in 429 exhaustion is operationally invalid and cannot be interpreted as a strategy result.

The earlier five-session smoke outputs found important implementation defects and therefore served their purpose as pipeline tests. Performance from any smoke/monthly run predating the exact 09:45 clock model or current throttled selector is stale and is not used for acceptance.

Groww historical FNO expiries, contracts, candles, volume and open interest are the intended source. No synthetic option pricing will be used to claim performance.

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

## S5 — Evidence-guided Stocks-in-Play ORB

Status: **implemented as a separate literature-motivated hypothesis; fresh continuous-session historical study not yet supported by a clean consolidated result**.

This is deliberately not a rewrite of Quick Flip. Its rules were declared before performance was inspected:

1. Liquid 15-stock F&O universe fixed in advance.
2. First 5-minute candle (09:15-09:20) establishes opening direction and breakout level.
3. Relative opening volume compares that first 5-minute volume with the same interval over the prior 14 sessions only.
4. Report externally motivated RVOL variants separately: `>=1.0`, `>=1.2`, `>=1.5`; do not select the historical winner and call it proven.
5. Trade only a later breakout in the opening candle's direction.
6. Stop distance = 10% of prior ATR(14).
7. Use the same 09:15-15:15 continuous-session definition for ATR.
8. No new entry after the 15:10 five-minute bar; unresolved positions exit on the 15:10 bar close, which represents the 15:15 end of continuous cash trading and avoids the newer closing auction.

If an underlying-stock variant survives development and validation, only then is an actual historical stock-option overlay tested with real contracts, lot sizes, spreads/slippage and costs.

## Existing simplified opening-range baseline

The earlier 5-minute sweep/re-entry baseline is retained as a negative control, not renamed as Quick Flip. It omitted the 25%-ATR qualification and therefore tested a materially different strategy. Its broad unseen-stock holdout did not show a durable edge.
