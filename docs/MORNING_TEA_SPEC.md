# Morning Tea stock-option scalp — frozen replication proxy

Source reviewed: *Rajesh Jain Says Trade at 9:15 | We Tested It!* (Strategy in Minutes, 20 August 2026).

## Why this is a proxy

The source uses 30-second stock and option candles. Groww historical backtesting exposes one-minute candles as its finest documented interval. The research result must therefore be labelled a **one-minute replication proxy**, never an exact 30-second replication.

## Frozen rules

1. Use the fixed 15-stock liquid F&O universe in `research/morning-tea/engine.mjs`; do not select symbols after seeing results.
2. At the close of the 09:15 one-minute candle, rank every available stock by change from its previous continuous-session close.
3. Consider only the top gainer for an ATM call and top loser for an ATM put. This is a point-in-time ranking; an end-of-day movers list is prohibited.
4. The gainer must have a bullish opening candle with open approximately equal to low. The loser must have a bearish opening candle with open approximately equal to high. Frozen tolerance: 0.10%.
5. Use the nearest non-expired stock-option expiry and the closest listed ATM strike. Require the selected long option's 09:15 candle to be bullish.
6. Signal information is complete only at 09:16. Enter at the 09:16 option-candle open; never at the 09:15 close.
7. Stop is the selected option's 09:15 candle low. Target is 10% above the executable entry.
8. If stop and target occur in the same one-minute candle, score the stop first.
9. Exit any unresolved position at the 09:30 candle open. Maximum one call and one put trade per session.
10. Apply historical lot size, Groww charges, date-sensitive STT, and 0/0.5/1.0 option-point adverse slippage per order leg.

## Research sequence and gates

- Discovery: 2020–2024. Validation: 2025 only if every discovery gate passes. Holdout: 2026 only if validation passes.
- Integrity: no look-ahead rankings or same-candle entry; missing-data rate <= 2%; all cost scenarios present.
- Performance: >=100 trades, normal profit factor >=1.20, positive net P&L and profit factor >=1.05 at 1-point slippage, maximum drawdown smaller than total stressed profit, and at least four of five discovery years profitable at 1-point slippage.

This is research only. It does not change or feed paper/live workflows, journals, schedules, or the dashboard.
