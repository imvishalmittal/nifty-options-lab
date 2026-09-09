# Profit-only directional option research specification

Status: frozen discovery specification; not approved for paper or live trading.

## Objective

Test sparse CE and PE purchases whose intended stop permits only trading-expense loss. Gap-through directional losses remain possible and are measured explicitly. No fixed option-premium threshold is used.

## Frozen universe and execution

- NIFTY spot supplies every directional signal.
- Use the nearest dated NIFTY expiry and actual listed contract closest to 200 points ITM: CE for bullish signals, PE for bearish signals.
- Signals use completed five-minute candles from 09:30 through 11:25.
- Buy at the corresponding option signal candle close. Stops become effective from the next option candle.
- Capital is ₹60,000; whole historical lots only; exit by 15:15.
- Apply Groww charges and 0, 0.5 and 1 point per-leg slippage.

## Frozen signals

1. ORB15: close outside the 09:15-09:29 NIFTY range.
2. RETEST15: ORB15 followed by a completed retest that closes back beyond the boundary.
3. PREVIOUS_DAY_BREAK: close outside the prior complete session's high/low.
4. REGIME_ORB_DEEP_ITM: ORB15 only when its direction agrees with the prior close versus prior 50-session SMA.
5. VWAP_CONTINUATION: cross/reaccept NIFTY session VWAP; no trade if positive historical volume is unavailable.

## Frozen protection overlays

1. IMMEDIATE_BE: option stop equals entry from the next candle.
2. CONFIRM_BE_10: initial stop is the option signal-candle low; after a completed +10-point favorable move, stop becomes entry.
3. FINANCE_HALF_10: immediate entry stop; after +10 points, exit half and retain the balance with entry stop. Requires at least two affordable lots for actual split accounting.

## Discovery gates

At least 100 trades, zero gross directional-loss trades, positive net P&L and profit factor above one under normal, 0.5-point and 1-point slippage. Passing discovery advances only to validation review.

## Dashboard evidence

The `/profit-only` dashboard publishes all 25 tested combinations formed from
the five signal families and five exit/protection modes. Discovery, validation,
and prospective paper observations remain separate. A top-level option-side
selector defaults to **Both** and can restrict every summary and trade table to
**CE only** or **PE only**. Side-only views are descriptive post-result slices;
they do not retroactively become untouched validation.

## Simultaneous CE + PE validation-only experiment

The paired experiment is intentionally evaluated only from 1 January 2025
through 8 September 2026. Discovery-period results are not used to select or
approve it.

- Candidates: Retest-15 with `CONFIRM_BE_10_CAP_10`, and Previous-day Break
  with `CONFIRM_BE_10`.
- When either candidate produces its normal completed-candle signal, buy both
  the 200-point-ITM CE and the 200-point-ITM PE at their option prices at that
  same signal-candle close.
- Total modeled capital stays ₹60,000: ₹30,000 is allocated independently to
  each side, using whole historical 65-unit lots. If either side cannot buy one
  lot, the pair is a no-trade.
- Each leg has its own signal-low/capped initial stop, +10 breakeven activation,
  and 15:15 exit. One leg exiting never closes the other.
- Brokerage, taxes and 0/0.5/1-point slippage are charged to both legs.
- Results are reported per two-leg pair, separately for 2025 and the partial
  2026 period. Promotion review requires positive aggregate P&L and profit
  factor above one at every stress level, plus positive P&L in each calendar
  period at every stress level.

This is a comparison experiment, not a paper-trading authorization.

## Next bounded-risk experiment

The next proposed experiment applies to both previously profitable discovery
signals—`RETEST15` and `PREVIOUS_DAY_BREAK`—and retains both CE and PE so side
results can be evaluated without silently discarding evidence. It will compare
the existing signal-candle-low initial stop with maximum initial premium risks
of 5, 10, and 15 points. Every variant retains the completed-candle entry,
breakeven activation after +10, and 15:15 exit. This is a new hypothesis and has
not yet been backtested or authorized for paper trading.
