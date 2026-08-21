# Isolated NIFTY opportunity research

This research lane looks for intraday opportunities after the existing morning premium-crossing strategies decline to trade. It is intentionally disconnected from paper and live execution.

## Isolation guarantees

- Every file in this change is new. Existing paper workflows, V2-V8 strategy code, journals, dashboards, and `/paper` are not changed.
- The four strategy workflows have no schedule and no broker-order path. They support manual dispatch and isolated run-request files on the dedicated `research/opportunity-runs` branch.
- Each strategy has its own workflow and artifacts. The comparison workflow only reads consolidated artifacts from four explicitly supplied run IDs.
- Passing a comparison gate does not promote, merge, schedule, or paper-trade a strategy.

## Strategy families

1. **Late breakout and retest** — after 09:45, require an opening-range break, EMA alignment, rising ADX, and a completed retest/reclaim within ten bars.
2. **VWAP trend pullback** — after 09:45, require EMA/ADX trend alignment, a pullback to VWAP/EMA, and a completed close back in the trend direction.
3. **Failed opening-range break** — fade a sweep outside the opening range only after price closes back inside, with low or falling ADX.
4. **Afternoon compression breakout** — require an 11:00-13:15 range no wider than 65% of the opening range, then trade a 13:15-14:30 breakout with EMA alignment and expanding ADX.

All four use the same execution model so the first experiment measures entry quality rather than mixing entry and exit changes:

- underlying signal from completed NIFTY cash one-minute candles;
- nearest-expiry ITM option on the signalled side, selected at the signal-candle close nearest to ₹180;
- entry at the next option candle open;
- 20 premium-point stop, 40 premium-point target, 15:20 exit;
- one trade per strategy per session;
- conservative stop-first handling if stop and target occur in the same one-minute candle;
- no trade when no option candle exists at the exact signal minute; the backtest never substitutes a stale quote;
- net results at zero, 0.5, and 1.0 adverse premium points per leg using the repository's Groww cost helper.

## Backtest protocol

Run each of the four workflows separately for the same scope:

1. `discovery-2020-2024` — inspect behavior and failure modes. If parameters are changed, document and lock them before validation.
2. `validation-2025` — one untouched validation pass after parameter lock.
3. `holdout-2026` — final untouched holdout through the current date.

Each workflow splits the scope into monthly jobs, serializes its API use, applies historically changing NIFTY lot sizes from the selected option's expiry (so transition months are not treated as one regime), uploads raw monthly artifacts, applies a strict integrity gate, and produces one consolidated artifact. A month fails consolidation if any observed session has missing underlying/option data, reaches the maximum contract-search boundary, uses a same-candle entry, has incomplete cost scenarios, or overlaps another partition.

After all four runs for one scope finish, launch **Research - compare NIFTY opportunity strategies** with their four run IDs. The comparison refuses unequal periods and requires, per strategy:

- at least 30 trades;
- gross profit factor at least 1.2;
- positive total and average net P&L at one adverse premium point per leg.

The gate is necessary, not sufficient. A candidate still needs stable monthly results, acceptable drawdown, parameter-neighborhood stability, expiry-day/non-expiry-day analysis, and a separate forward paper phase before any discussion of live use.

For autonomous runs, update only the strategy's JSON request under `research/opportunity/requests/` on the `research/opportunity-runs` branch. The shared `groww-opportunity-backtest-api` concurrency group prevents simultaneous Groww API use. GitHub keeps at most one pending run per concurrency group, so submit the next request only after the current run completes. Request files never merge into `main` and cannot affect paper execution.

The separate `Research - chain NIFTY opportunity suite` workflow may advance an enabled suite through the four strategy workflows and then the comparison workflow. It records each completed run ID in `suite.json`, stops immediately on any failure, ignores out-of-order completions, and never promotes a result into paper or live execution.

## Data and interpretation limits

- Groww documents historical CASH and FNO candles, including one-minute OHLC and option volume/open interest, from 2020: <https://groww.in/trade-api/docs/curl/backtesting>
- NIFTY's historical lot size changed from 75 to 50 in 2021, 50 to 25 in 2024, 25 to 75 for 2025-era contracts, and 75 to 65 for 2026-era contracts. The monthly workflow matrix applies those regimes.
- The repository cost helper provides a normalized comparison schedule and date-sensitive STT around April 2026. It is not a forensic reconstruction of every historical exchange-fee revision; gross per-unit and R results remain visible alongside normalized net results.
- If NIFTY cash volume is unavailable, VWAP uses a causal typical-price average and records the fallback. Treat fallback-heavy results as evidence about a price-average pullback, not true exchange-volume VWAP.
- No backtest proves future profitability. Multiple-strategy research increases selection bias, so discovery, validation, and holdout results must remain separate.
