# Architecture Decisions

## ADR-001: Separate repository

**Decision:** Keep NIFTY Options Lab separate from `global-trading-lab`.

## ADR-002: Deterministic strategy mechanics

**Decision:** Strategy state, entries, exits, stops, and trail updates are fixed in code and covered by tests.

## ADR-003: Preserve legacy learning mode

**Decision:** Keep V0.1 at `/` rather than redefining its historical meaning.

## ADR-004: Paper only; no broker orders

**Decision:** Automated paths may collect data and simulate trades but must not place live orders.

## ADR-005: Continuous GitHub Actions paper session

**Decision:** Use one weekday job beginning around 09:20 IST and keep it alive through the session. This is acceptable for paper observation, not production live execution.

## ADR-006: Causal completed-bar stop updates

**Decision:** A stop calculated from a completed 1-minute bar becomes effective only from the following bar.

**Reason:** Prevent same-bar look-ahead and preserve historical/forward comparability.

## ADR-007: Preserve V2 as historical evidence

**Decision:** Existing Momentum V2 artifacts and ledger rows retain their V2 definition, including the old ₹220 activation behavior.

**Reason:** Strategy history must remain reproducible; new risk-management logic must not rewrite old results.

## ADR-008: Introduce Stepped Trail V3 as a separate hypothesis

**Decision:** V3 keeps the ₹180 entry family and ₹160 initial stop, uses a 20-point trail gap, and begins reducing risk through discrete peak steps instead of waiting for ₹220 activation.

**Reason:** The desired behavior is to reduce loss after favorable movement and reach gross breakeven after roughly a 20-point move from the actual entry.

## ADR-009: Compare 5-point and 10-point V3 steps

**Decision:** Test both 5-point and 10-point step sizes using the same contracts, signals, entries, 20-point gap, costs, and integrity rules. Use 10 points as the initial forward-paper candidate while the comparison completes.

**Reason:** Five points may protect faster but can churn in option noise; ten points is less reactive. The comparison must be empirical rather than selected from one known trade.

## ADR-010: Gross breakeven is not net breakeven

**Decision:** `breakevenReached` means the active stop reached the actual entry premium. Dashboard P/L separately reports charges and net P/L.

**Reason:** Brokerage, taxes, fees, and slippage can make an entry-price exit slightly negative after costs.

## ADR-011: Integrity gates override performance

**Decision:** Missing, boundary, partial, auth-failed, materially rate-limited, CI-failed, or integrity-failed periods are excluded from accepted evidence.

## ADR-012: Version strategy rows in the ledger

**Decision:** V2 and V3 rows must identify their strategy version. Fields unavailable in older evidence display as `—` instead of being fabricated.

## ADR-013: GitHub ledger before database

**Decision:** Continue using `public/paper/trades.json` and `session-status.json` until write volume or concurrency justifies durable external storage.

## ADR-014: Hosting and source are separate release states

**Decision:** Do not claim public `/paper` is current merely because GitHub `main` is current. Verify the Sites deployment separately.
