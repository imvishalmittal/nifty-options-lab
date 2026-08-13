# Strategy Specification

## Purpose

This document freezes the V0.1 decision rules so UI copy, future AI extraction,
market-data automation, tests, and backtests all evaluate the same strategy.

The engine classifies a setup. It does not predict the future and does not
execute an order.

## Inputs

### Evidence

- 15-minute NIFTY chart screenshot
- 5-minute NIFTY chart screenshot
- optional nearest-weekly option-chain screenshot

In V0.1 the screenshots are supporting evidence only. A user verifies the
normalized values.

### Normalized 15-minute facts

- NIFTY spot price
- price relation to EMA22: above, below, or unclear
- EMA22 slope: rising, falling, or flat
- ADX(14)
- +DI
- -DI

### Normalized 5-minute facts

- pullback near EMA22: yes/no
- rejection candle: yes/no
- breakout confirmation: yes/no
- confirmation level
- NIFTY invalidation level
- data freshness and timeframe validity

### Contract and risk facts

- nearest weekly expiry
- one-OTM premium
- option stop premium
- whether today is expiry day
- whether a trade has already been taken today

## Direction filters

### Bullish

All conditions must be true:

```text
price above EMA22
EMA22 rising
ADX(14) > 20
+DI > -DI
```

The permitted direction is CALL.

### Bearish

All conditions must be true:

```text
price below EMA22
EMA22 falling
ADX(14) > 20
-DI > +DI
```

The permitted direction is PUT.

If neither filter passes, the result is `NO TRADE`.

## State precedence

The first matching state wins:

1. `DATA UNCERTAIN`
   - both required chart screenshots/sample evidence are not present; or
   - timeframe validation fails; or
   - data freshness validation fails.
2. `NO TRADE`
   - neither direction filter passes.
3. `WAIT FOR PULLBACK`
   - direction passes; and
   - 5-minute pullback is absent.
4. `WAIT FOR CONFIRMATION`
   - pullback exists; and
   - rejection or breakout confirmation is absent.
5. `CALL READY` or `PUT READY`
   - direction, pullback, rejection, and breakout confirmation pass; and
   - every safety gate passes.
6. `NO TRADE`
   - technical setup passes but at least one safety gate fails.

## Contract resolution

V0.1 uses a 50-point strike interval:

```text
ATM = round(NIFTY spot / 50) × 50
CALL one OTM = ATM + 50
PUT one OTM  = ATM - 50
```

The selected expiry must be the nearest weekly expiry.

The configured one-lot quantity is 65 units. Exchange specifications can
change, so this value must become provider/configuration-driven before live use.

## Risk calculations

```text
capital required = option premium × lot size
risk points      = max(0, entry premium - stop premium)
maximum loss     = risk points × lot size
2R target        = entry premium + (2 × risk points)
3R level         = entry premium + (3 × risk points)
```

All ready states require:

- capital required ≤ ₹5,000;
- stop premium > 0;
- stop premium < entry premium;
- maximum loss > 0 and ≤ ₹300;
- nearest weekly expiry is present;
- today is not expiry day;
- no earlier trade today.

The NIFTY structure invalidation remains primary. The premium stop is an
estimate for learning and must not contradict the underlying invalidation.

## Non-rules

The following are deliberately excluded from V0.1:

- option selling;
- automatic broker execution;
- averaging down;
- overnight positions;
- more than one trade per day;
- moving the stop farther after entry;
- selecting a farther OTM strike because the one-OTM contract is unaffordable;
- forcing a trade when data is unclear;
- changing thresholds based on recent wins or losses.

## Change control

Do not modify strategy thresholds based on anecdotal outcomes. Proposed
strategy changes should:

1. be implemented as a separately named variant;
2. include deterministic tests;
3. be evaluated over an adequate paper-trade/backtest sample;
4. preserve the V0.1 baseline for comparison;
5. be documented in the changelog and an architecture decision.
