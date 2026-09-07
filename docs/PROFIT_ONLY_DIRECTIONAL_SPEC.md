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
