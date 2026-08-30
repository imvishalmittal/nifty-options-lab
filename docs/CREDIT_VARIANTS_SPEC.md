# Defined-risk credit variants — frozen discovery specification

These hypotheses are isolated research only. They cannot place paper or live orders and do not alter any existing V2–V8 workflow.

## Shared protocol

- Discovery: 1 January 2020–31 December 2024.
- Untouched validation: calendar 2025, only after passing discovery gates.
- Holdout: 2026 through the last completed session, only after passing validation.
- Signal inputs: completed NIFTY cash one-minute candles; no same-minute look-ahead.
- Contract: nearest weekly NIFTY expiry strictly after the session, excluding expiry-day entries.
- Entry: synchronized option opens at 10:00 after the completed 09:59 decision candle.
- Exit threshold: synchronized option closes; fill at the next synchronized minute open.
- Forced exit: synchronized 15:10 open.
- Historical lot sizes, normalized costs, and 0.5/1.0 adverse points on every option side.
- Missing required quotes are `DATA_MISSING`; no stale quote, forward fill, or fabricated premium.
- One position per strategy per session; no adjustment or re-entry.

## Very-low-volatility iron butterfly

- Opening range: 09:15–10:00.
- Require ADX(14) <= 16 at 09:59.
- Require opening-range width <= 0.45% of spot.
- Require absolute EMA(9)/EMA(22) separation <= 0.10% of spot.
- Require 09:59 close inside the opening range.
- Sell the same nearest-ATM strike call and put.
- Buy exact 200-point call and put wings.
- Minimum net entry credit: 60 points; credit must be below wing width.
- Target: buy back at 70% of entry credit (30% captured).
- Stop: buy back at 140% of entry credit.
- Maximum expiry loss: wing width minus entry credit.

## Directional credit spread

- Opening range: 09:15–09:45; decision remains the completed 09:59 candle.
- Require ADX(14) >= 25 at 09:59.
- Bullish regime: EMA(9) > EMA(22), close above the opening-range high, and +DI > -DI.
- Bearish regime: EMA(9) < EMA(22), close below the opening-range low, and -DI > +DI.
- Bullish position: sell the first listed put at or below 0.5% under spot and buy an exact 200-point lower put.
- Bearish position: sell the first listed call at or above 0.5% over spot and buy an exact 200-point higher call.
- Minimum net entry credit: 5 points; credit must be below spread width.
- Target: buy back at 50% of entry credit.
- Stop: buy back at 200% of entry credit.
- Maximum expiry loss: spread width minus entry credit.

## Precommitted discovery gates

Each strategy must independently satisfy all of the following:

- at least 1,000 observed sessions and 100 executed trades;
- missing-data rate no greater than 5%;
- positive normalized net P&L and normalized profit factor at least 1.20;
- positive net P&L and profit factor at least 1.10 with 0.5-point slippage per side;
- positive net P&L and profit factor at least 1.00 with 1-point slippage per side;
- positive 0.5-point-slippage result in at least four of five discovery years;
- no single positive year contributes more than 65% of positive 0.5-point-slippage P&L;
- 0.5-point-slippage maximum drawdown no greater than fifteen median defined-risk maximum losses.

Failing discovery ends the strategy without tuning. Passing discovery permits one untouched 2025 validation; it does not promote the strategy to paper or live trading.
