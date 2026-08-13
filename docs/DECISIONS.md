# Architecture Decisions

## ADR-001: Separate repository

**Decision:** Keep NIFTY Options Lab separate from `global-trading-lab`.

**Reason:** The projects have different users, time horizons, interfaces, risk
profiles, data freshness requirements, and future credentials. Separation
prevents an intraday learning experiment from destabilizing the broader
India/US research platform.

## ADR-002: Deterministic decision engine

**Decision:** AI may extract and explain facts, but fixed code assigns the
strategy state.

**Reason:** Visual models can misread precise chart values. A deterministic
engine is testable, auditable, and easier to compare across screenshot and
automated-data paths.

## ADR-003: Human verification before readiness

**Decision:** Critical screenshot facts require explicit verification.

**Reason:** A confident but incorrect value must not silently produce a
trade-ready state. Uncertainty should fail closed.

## ADR-004: Manual and paper execution

**Decision:** V0.1 stops at a paper-trade eligibility result.

**Reason:** The user is learning options mechanics, and the strategy does not
yet have adequate evidence, automated data validation, or operational controls
for live execution.

## ADR-005: GitHub Actions is CI, not a live signal loop

**Decision:** Use GitHub Actions for builds, tests, backtests, and journal
validation, but not time-critical five-minute triggers.

**Reason:** Scheduled workflows can be delayed. Intraday evaluation requires a
continuously available service that evaluates completed candles predictably.

## ADR-006: One frozen baseline

**Decision:** Preserve V0.1 rules as a named baseline.

**Reason:** Strategy changes should be evaluated as explicit variants rather
than retroactively changing the meaning of historical paper trades.
