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
4. Reconcile archived evidence for the remaining implemented opportunity modules before scheduling duplicate runs.

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
- NIFTY ₹180 six-variant entry-risk discovery.

They should not be rerun merely to search for a profitable parameter. A materially changed rule set must be declared as a new hypothesis with new gates and a fresh holdout.

## Research backlog

Priority is given to strategies with deterministic rules and reliable actual-contract data:

1. Produce or reconcile a clean consolidated Stocks-in-Play ORB result.
2. Reconcile the four isolated opportunity modules: late breakout/retest, VWAP pullback, failed opening-range break, and afternoon compression breakout.
3. Convert incompletely specified video ideas into deterministic specs before implementation:
   - 30-minute breakout with ATM option selling;
   - Williams %R plus 5/15/50 EMA bear-call spread;
   - monthly “Ramesh–Suresh” strangle/iron condor;
   - smart strangle near 0.08 delta.

## Promotion sequence

```text
Frozen specification → discovery → validation → holdout → paper observation → separately authorized live engineering
```

Every arrow requires all predeclared gates to pass. Positive zero-slippage P&L alone is insufficient. Live execution remains out of scope.

See `docs/STRATEGY_STATUS.md` for the evidence ledger and `docs/PAPER_V3_FORWARD_OBSERVATION.md` for the current paper suite.
