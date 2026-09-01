# Roadmap

Last updated: 1 September 2026

## Current operating state

- Keep the V2–V11 NIFTY premium-entry suite in paper-only forward observation.
- Treat variant outcomes as alternatives on shared cohorts; never add their P&L.
- Maintain causal completed-bar logic, actual-contract data, date-correct lot sizes, costs, and auditable session files.
- Do not place broker orders.

## Immediate work

1. Continue accumulating clean V2–V11 forward sessions without changing or backfilling frozen variant definitions.
2. Treat the completed Jan–Aug 2026 matched-risk result as diagnostic evidence, not an untouched holdout or automatic promotion/removal decision.
3. Keep the dashboard and strategy-status ledger synchronized with accepted artifacts.
4. Preserve the reconciled terminal evidence for Stocks-in-Play and the four opportunity modules; do not schedule duplicate runs.

## Completed decisions

The following frozen studies completed and were rejected:

- NIFTY ₹180 Premium V1 fixed stop/target;
- opening-range sweep/reversal negative control;
- defined-risk Batman;
- HAI 1:3:2 ratio replication;
- intraday iron condor;
- intraday iron butterfly;
- directional defined-credit spread;
- Morning Tea stock-options proxy;
- Quick Flip clean discovery;
- NIFTY ₹180 six-variant entry-risk discovery;
- Stocks-in-Play ORB;
- late breakout/retest;
- VWAP trend pullback;
- failed opening-range break;
- afternoon compression breakout after failed untouched 2025 validation.

They should not be rerun merely to search for a profitable parameter. A materially changed rule set must be declared as a new hypothesis with new gates and a fresh holdout.

## Research backlog

There is no fully specified, implemented strategy waiting for its first clean backtest.

1. Continue V2–V11 prospective paper observation without backfill or rule changes.
2. Treat the Williams %R/EMA bear-call replication as inconclusive: one 2025 trade and zero post-publication trades are insufficient for promotion or tuning.
3. Convert only genuinely incomplete ideas into deterministic specifications before implementation:
   - 30-minute breakout with ATM option selling;
   - monthly “Ramesh–Suresh” strangle/iron condor;
   - smart strangle near 0.08 delta.

## Promotion sequence

```text
Frozen specification → discovery → validation → holdout → paper observation → separately authorized live engineering
```

Every arrow requires all predeclared gates to pass. Positive zero-slippage P&L alone is insufficient. Live execution remains out of scope.

See `docs/STRATEGY_STATUS.md` for the evidence ledger and `docs/PAPER_V3_FORWARD_OBSERVATION.md` for the current paper suite.
