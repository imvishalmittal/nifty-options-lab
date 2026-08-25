# Next opportunity research tracks

These tracks are isolated research. They do not modify or dispatch the existing NIFTY paper session.

## Frozen chronology

- Discovery: 2020-01-01 through 2024-12-31.
- Validation: calendar 2025, exposed only after a discovery gate passes.
- Holdout: 2026, exposed only after discovery and validation both pass.
- No automatic paper promotion. A passing artifact still requires a separate review and workflow.

## Frozen stock universe

The first discovery run uses RELIANCE, HDFCBANK, ICICIBANK, SBIN and INFY. This is the same predeclared liquid basket used by the earlier opening-range study; symbols are not selected from outcome data.

## Stocks-in-Play ORB

- Five-minute NSE cash candles.
- Relative opening volume uses only prior sessions and resets after structural price breaks.
- Primary threshold: first-bar relative volume >= 1.2.
- Direction comes from the completed 09:15 bar; entry is a later break, never the signal bar itself.
- Stop is 0.10 of prior daily ATR; unresolved trades exit at the 15:10 continuous-session close.
- Primary result is evaluated after exact Groww intraday charges and 2/5-bps slippage per leg.

The earlier plain 09:15-09:30 sweep/reversal baseline remains rejected. It is not relabeled as this strategy.

## Selective NIFTY VWAP V2

This is a new locked hypothesis, not a reinterpretation of the original result.

- Completed one-minute NIFTY candles only.
- Signal window: 09:45 through 13:30.
- ADX >= 25 and expanding.
- EMA9/EMA22 separation >= 5% of the opening-range width.
- Signal volume >= 1.5 times the median of the prior 20 one-minute bars.
- Price must already be outside the opening range and on the correct side of VWAP.
- Pullback must reaccept EMA9 on a completed candle.
- The option is selected at signal close; entry remains the next option bar open.
- Existing option costs and 0/0.5/1.0-point slippage scenarios remain unchanged.

## Power-hour stock momentum

- Decision uses the completed 14:25 bar.
- Entry is the 14:30 bar open; exit is stop-first or the 15:10 close.
- Primary threshold: absolute open-to-14:25 move >= 0.75% and cumulative relative volume >= 1.2.
- At most one strongest leader and one strongest laggard are selected per day.
- Stop distance is 0.25 of prior daily ATR.
- Primary result is evaluated after exact Groww intraday charges and 2/5-bps slippage per leg.

## Discovery promotion gate

An underlying-stock primary variant must have at least 100 trades, positive 2-bps and 5-bps stress totals, profit factor >= 1.15 at 2 bps and >= 1.05 at 5 bps, a positive clustered 95% lower mean at 2 bps, at least three positive discovery years, at least three positive symbols, and no single symbol contributing more than 50% of absolute net R.

Selective VWAP V2 must have at least 100 trades, gross profit factor >= 1.20, positive normalized/0.5-point/1-point net P&L, and at least three positive years under 1-point slippage.

Gate failure rejects the frozen specification. Gate success only permits untouched validation; it does not create a paper trade workflow.
