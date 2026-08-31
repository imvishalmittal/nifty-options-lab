# Morning Tea execution-constrained validation

Frozen before inspecting 2026 results on 31 August 2026.

## Status and purpose

The original Morning Tea one-minute proxy remains rejected because its predeclared 0.5- and 1.0-point-per-leg stress gates failed. This is a separate post-discovery hypothesis: determine whether the same signals are viable only when execution can be constrained to at most 0.10–0.25 option points of adverse slippage per order leg.

## Untouched sample

- Period: 1 January 2026 through 28 August 2026 (last completed session before this specification).
- No 2026 result may be inspected before this file and the request marker are committed.
- Ranking, universe, option selection, entry, stop, target, time exit, ambiguity handling, historical lot sizing, charges, and STT logic remain unchanged from `docs/MORNING_TEA_SPEC.md`.
- Report normal, 0.10, 0.25, 0.50, and 1.00-point scenarios. The decision scenarios are 0.10 and 0.25; 0.50 and 1.00 remain adverse diagnostics and cannot be hidden.

## Predeclared gates

All gates must pass:

1. Integrity valid and missing-session rate <=2%.
2. At least 100 completed trades.
3. 0.10-point net P&L >0 and profit factor >=1.20.
4. 0.25-point net P&L >0 and profit factor >=1.05.
5. 0.25-point maximum drawdown < total 0.25-point net profit.
6. At least five calendar months profitable at 0.25 points, with at least eight observed months.
7. No single trade contributes more than 35% of total positive 0.25-point P&L.
8. Results retain causal 09:16 next-bar entry and complete transaction costs.

Failure of any gate rejects this execution-constrained historical hypothesis. Passing every gate permits forward paper observation only; it does not authorize live trading.

## Forward-paper requirement after a pass

Paper observation must record contemporaneous quote/spread evidence and distinguish a theoretical candle-open price from an achievable fill. Promotion beyond research requires at least 30 paper trades and demonstrated median adverse slippage <=0.10 points per leg, 90th-percentile slippage <=0.25 points per leg, positive net expectancy after observed fills, and no broker orders.
