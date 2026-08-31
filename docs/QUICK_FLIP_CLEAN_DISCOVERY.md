# Quick Flip clean discovery protocol

## Hypothesis

A liquid F&O stock that sweeps one edge of its 09:15-09:30 opening range, prints a confirmed reversal candle, and then breaks that reversal trigger before 10:45 may mean-revert to the opposite opening-range edge.

## Frozen implementation

- Universe: RELIANCE, HDFCBANK, ICICIBANK, SBIN, INFY, AXISBANK, KOTAKBANK, BAJFINANCE, BHARTIARTL, ITC, TCS, TATAMOTORS, LT, TATASTEEL and ONGC.
- Data: Groww NSE cash five-minute candles.
- Opening range: 09:15 through 09:30.
- Entry deadline: 10:45.
- ATR: 14 completed daily continuous sessions.
- Opening range must be at least 25% of prior ATR.
- Signal: opening-edge sweep plus hammer/shooting-star or engulfing reversal.
- Entry: subsequent break of the completed reversal candle's trigger.
- Stop: opposite edge of the reversal candle.
- Target: opposite opening-range boundary.
- Same-bar stop/target ambiguity: stop first.
- One trade per symbol per session.
- Continuous session ends before 15:15; pre-open and closing-auction prints are excluded.
- Structural/corporate-action discontinuities reset ATR warm-up and are audited, never silently bridged.

## Sequential evidence protocol

1. Discovery: 2020-01-01 through 2024-12-31.
2. Untouched validation: 2025 only if every discovery gate passes.
3. Untouched holdout: 2026 only if validation passes.

Discovery gates are frozen before downloading the clean sample:

- at least 100 trades;
- profit factor at least 1.20 in realized R;
- positive total and mean realized R;
- at least three of five profitable calendar years;
- clustered-bootstrap 95% lower confidence bound for mean R above zero;
- no single symbol supplies more than 35% of positive P&L;
- data-quality audit passes for every symbol.

A failure stops the strategy. No parameter tuning or automatic paper/live promotion is permitted.
