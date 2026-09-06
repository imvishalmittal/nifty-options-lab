# PEAD via options — blocked candidate specification

Status: **blocked; no empirical backtest exists**.

The hypothesis is to buy a call after a sufficiently positive earnings surprise and a put after a sufficiently negative surprise, then hold through a 20-session post-announcement drift window. This is deliberately separate from the intraday strategies.

## Frozen signal arithmetic

`SUE = (actual EPS − point-in-time consensus EPS) / analyst-estimate dispersion`

- CE when SUE ≥ 2.
- PE when SUE ≤ −2.
- Otherwise no trade.
- A pre-open announcement may enter at that session's option open. Any release at/after 09:15 enters no earlier than the next actual NSE session.
- Exit after 20 complete exchange sessions.
- The selected monthly option expiry must be on or after the target exit date.

`research/pead-signal.mjs` implements only this causal arithmetic against a caller-supplied NSE session calendar. It intentionally does not fabricate holidays, earnings estimates, release timestamps, option strikes, fills or P&L.

## Unresolved prerequisites

1. Licensed point-in-time analyst estimates, estimate dispersion, actual EPS and exact release timestamps with verified NSE coverage.
2. A frozen liquid-stock universe and corporate-action-safe identifier mapping.
3. Dated monthly option contracts, strike rule and historical lot sizes.
4. Overnight gap execution, theta/expiry handling, capital reservation, overlapping-position limits and corporate actions.
5. Normal and adverse-fill costs, sample/stability/bootstrap/concentration gates.

Until all five exist, a synthetic run would test invented data rather than PEAD. The correct reported state is `BLOCKED`, not `NO_TRADE`, ₹0, or break-even.
