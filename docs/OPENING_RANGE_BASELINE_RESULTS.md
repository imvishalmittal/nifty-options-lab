# Opening-range sweep/reversal baseline results

## Scope

This is the first corrected underlying-stock baseline for the 09:15-09:30 opening-range sweep/reversal strategy.

Data source: Groww Backtesting API, NSE CASH 5-minute candles.

Frozen symbols:

- RELIANCE
- HDFCBANK
- ICICIBANK
- SBIN
- INFY

Periods were deliberately separated before interpreting results:

- Research: 2020-01-01 through 2024-12-31
- Validation: 2025-01-01 through 2025-12-31
- Recent: 2026-01-01 through 2026-08-15 (last actual market candles in this run are from 2026-08-14)

The corrected run consumed 475,412 five-minute candles for 2020-2024, 100,862 for 2025, and 62,352 for 2026.

## Important correction

The first generated 2026 artifact was rejected because the backtester grouped candles by trading date without including symbol, which mixed different stocks into impossible opening ranges. The engine was corrected to group by symbol + date, a multi-symbol regression test was added, and the full baseline was rerun. Only the corrected run is used below.

## Combined results: 2020 through August 2026

| Entry window after 09:30 | Trades | Winners | Win rate | Total R | Average R/trade |
|---|---:|---:|---:|---:|---:|
| 15 min (through 09:45) | 604 | 235 | 38.91% | +13.62R | +0.023R |
| 30 min (through 10:00) | 1,064 | 378 | 35.53% | -9.87R | -0.009R |
| 60 min (through 10:30) | 1,686 | 559 | 33.16% | -57.05R | -0.034R |
| 75 min (through 10:45) | 1,941 | 629 | 32.41% | -45.80R | -0.024R |

The 15-minute window is the only combined baseline with positive expectancy, but +0.023R/trade is too small to regard as a durable tradable edge before option spread, slippage, brokerage, taxes, IV and theta effects.

## 15-minute window by period

| Period | Trades | Win rate | Total R | Average R/trade |
|---|---:|---:|---:|---:|
| 2020-2024 | 447 | 39.37% | +10.45R | +0.023R |
| 2025 | 116 | 31.90% | -16.08R | -0.139R |
| 2026 through Aug 15 | 41 | 53.66% | +19.25R | +0.469R |

This is not stable across periods. The strong 2026 result does not validate the baseline because 2025 is clearly negative.

## 15-minute window year by year

| Year | Trades | Win rate | Total R | Average R/trade |
|---|---:|---:|---:|---:|
| 2020 | 103 | 41.75% | +11.82R | +0.115R |
| 2021 | 80 | 38.75% | -0.43R | -0.005R |
| 2022 | 82 | 47.56% | +23.38R | +0.285R |
| 2023 | 95 | 34.74% | -6.20R | -0.065R |
| 2024 | 87 | 34.48% | -18.12R | -0.208R |
| 2025 | 116 | 31.90% | -16.08R | -0.139R |
| 2026 | 41 | 53.66% | +19.25R | +0.469R |

## 15-minute window by stock: combined

| Symbol | Trades | Win rate | Total R | Average R/trade |
|---|---:|---:|---:|---:|
| HDFCBANK | 108 | 36.11% | +2.73R | +0.025R |
| ICICIBANK | 134 | 36.57% | +2.68R | +0.020R |
| INFY | 138 | 31.16% | -19.74R | -0.143R |
| RELIANCE | 121 | 39.67% | -6.55R | -0.054R |
| SBIN | 103 | 54.37% | +34.51R | +0.335R |

SBIN is the strongest post-hoc observation. Its 15-minute results were positive in 2020, 2022, 2023, 2024, 2025 and 2026, and negative in 2021. Because SBIN was identified after looking at these results, it must not be treated as an out-of-sample validation result. It is a hypothesis for further testing.

## Interpretation

1. Extending the entry window beyond 09:45 does not improve this frozen baseline; it generally makes the result worse.
2. The five-stock strategy as a whole is too weak and regime-dependent to justify an option overlay or live trading as-is.
3. The 2026-only 15-minute result is encouraging but contradicted by 2025.
4. SBIN deserves targeted follow-up, but selecting it after seeing the data creates selection bias.
5. Historical option P&L should not be used to rescue a weak underlying signal. The underlying setup must first show a more robust edge.

## Next research steps

Keep the 09:15-09:30 opening range and 09:30-09:45 entry window fixed for the next validation round.

Before option backtesting:

- add one-minute execution reconstruction to resolve within-5-minute trigger/stop/target ordering;
- test a larger, predeclared liquid-stock holdout basket without changing the pattern rules;
- add daily portfolio selection logic so the final system can choose zero or one best setup rather than implicitly taking every symbol-day signal;
- only after the underlying edge survives those checks, reconstruct historical expiries/contracts and compare ATM versus 1-OTM option P&L including realistic costs and slippage.

No live-trading conclusion should be drawn from this baseline.
