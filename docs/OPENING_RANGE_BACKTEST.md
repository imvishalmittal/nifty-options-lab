# Opening Range Sweep-Reversal Backtest

This research module tests the underlying-stock setup before layering options on top.

## Question

After the 09:15-09:30 opening range forms, does a later failed break of that range followed by a reversal candle produce a repeatable move toward the opposite edge of the opening range?

## V1 universe

Start with a small liquid NSE F&O basket and apply the exact same rules to every symbol. Suggested initial basket:

- RELIANCE
- HDFCBANK
- ICICIBANK
- SBIN
- INFY

The universe must be validated using traded value/liquidity and must not be selected by looking at backtest outcomes.

## Input data

Five-minute OHLCV candles in Asia/Kolkata local time.

CSV columns:

```text
timestamp,symbol,open,high,low,close,volume
```

Example timestamp:

```text
2026-08-14T09:15:00+05:30
```

## Frozen V1 rules

1. Opening range is the three completed 5-minute candles from 09:15 through 09:29:59.
2. No signal may use the opening-range candle before it closes.
3. Bullish setup:
   - price trades below the opening low;
   - the same 5-minute candle closes back above the opening low;
   - that candle is a bullish hammer or bullish engulfing candle.
4. Bearish setup:
   - price trades above the opening high;
   - the same 5-minute candle closes back below the opening high;
   - that candle is a shooting-star/rejection candle or bearish engulfing candle.
5. The reversal candle itself is never the entry candle.
6. Entry occurs only if a later 5-minute candle breaks the reversal candle high (long) or low (short), before the tested entry-window cutoff.
7. Stop is the reversal-candle wick extreme.
8. Target is the opposite edge of the 09:15-09:30 opening range.
9. Maximum one trade per symbol per session.
10. If both stop and target are touched inside the same 5-minute candle, score the stop first. This intentionally biases results conservatively.
11. If neither stop nor target is reached, exit at the final available candle close and label the result `EOD`.

## Entry-window study

Keep the 09:15-09:30 opening range fixed and run the same setup with four different latest-entry cutoffs:

| Study | Latest entry |
| --- | --- |
| 15 minutes after opening range | 09:45 |
| 30 minutes after opening range | 10:00 |
| 60 minutes after opening range | 10:30 |
| 75 minutes after opening range | 10:45 |

This avoids assuming that the setup must resolve immediately. The comparison tells us whether the edge is concentrated in the first 15-30 minutes or remains useful for 60-75 minutes.

## Metrics

The engine records:

- number of trades;
- win rate;
- target-hit rate;
- total and average R;
- planned reward/risk;
- maximum favorable excursion;
- maximum adverse excursion;
- same-bar ambiguous outcomes;
- direction and candle-pattern breakdown;
- per-symbol results for every entry window.

## Run

Single-window baseline:

```bash
node research/opening-range-backtest.mjs data/RELIANCE-5m.csv data/HDFCBANK-5m.csv
```

Window comparison:

```bash
node research/opening-range-window-study.mjs data/RELIANCE-5m.csv data/HDFCBANK-5m.csv data/ICICIBANK-5m.csv data/SBIN-5m.csv data/INFY-5m.csv
```

The study prints each window's summary and ranks windows by average R, then total R, then sample size. Ranking is descriptive research output, not a rule change by itself.

## Research sequence

### Phase 1 - Underlying edge

Use at least several months of 5-minute stock data. Compare:

- 09:30-09:45 entries;
- 09:30-10:00 entries;
- 09:30-10:30 entries;
- 09:30-10:45 entries;
- bullish versus bearish sweeps;
- hammer/shooting-star versus engulfing confirmation;
- gap days versus non-gap days;
- high versus normal opening volume.

Do not optimize thresholds until the frozen baseline has been measured.

### Phase 2 - Option overlay

Only if Phase 1 shows a credible underlying edge, reconstruct executable option trades using contemporaneous option-chain data. Test ATM and exactly 1-OTM separately, including:

- bid/ask spread;
- slippage;
- brokerage and statutory charges;
- IV and theta effects;
- contract lot size applicable on that date.

Do not infer option profitability from underlying points alone.

## Interpretation

A visually appealing chart pattern is not evidence of an edge. The baseline should be rejected or revised if average R is non-positive after a meaningful sample, if performance is concentrated in one symbol or short regime, or if realistic option execution costs erase the underlying edge.
