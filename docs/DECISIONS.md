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

Incomplete data statuses are persisted for diagnosis but fail workflow health after bounded retries. A green Action therefore means a terminal strategy outcome, not merely that the runner process exited normally.

## ADR-010: Complete strike grid and guarded replay recovery

**Decision:** Construct a deterministic 50-point NIFTY strike grid around the contemporaneous 09:25 spot and merge it with Groww's contract catalogue. Missing catalogue strikes are probed using the canonical Groww symbol and explicitly tagged `synthetic_gap_fill`; invalid symbols remain auditable and are never assigned fabricated prices.

Both CE and PE must independently bracket ₹180. A one-sided fallback would change the strategy and is not allowed.

If the live session remains incomplete, a 15:40 IST recovery may replay the same frozen rules from historical one-minute candles. Replay uses the 09:25 selection premium, completed 09:30–09:44 signals, next-bar-open entries, stop-first exits, period-correct charges, and an integrity gate. It is idempotent and cannot replace a terminal live outcome.

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

## ADR-015: Preserve the original eight-variant forward suite

**Decision:** Run V2, V3-5, V3-10, V4, V5, V6, V7, and V8 as alternative paper simulations for the observation window. Do not add their P/L.

## ADR-016: Isolate V4 entry and exit effects with V5

**Decision:** V5 shares V4's NIFTY-confirmed entry but uses V3-10 exit mechanics without fail-fast.

## ADR-017: Keep simple risk benchmarks

**Decision:** V6 provides a conservative fixed-2R benchmark, while V8 caps initial premium risk at 20 points without loosening the original ₹160 stop. V6 resolves same-bar stop/target ambiguity as a stop.

## ADR-018: Make time failure causal

**Decision:** V7 may arm only after 15 completed position bars with MFE below 10 and close at/below entry; execution occurs at the following bar open.

## ADR-019: Reuse market-data streams

**Decision:** V5 runs on V4's candles and V6–V8 run on the base candles. Strategy expansion must not multiply Groww requests.


## ADR-020: Maintain one evidence-status ledger

**Decision:** `docs/STRATEGY_STATUS.md` is the status index for every reviewed strategy. Detailed specifications stay authoritative for rules, while the ledger records sample, outcome, gate decision, and promotion state.

**Reason:** Implemented, profitable-at-zero-slippage, accepted, and paper-traded are different states. A single ledger prevents stale “queued” language and accidental promotion of rejected or invalid evidence.

## ADR-021: Keep research and paper scopes explicit

**Decision:** The current paper workflow contains V2–V11, including the prospective ₹170/₹210 comparison cohort added on 1 September 2026. Rejected, diagnostic, unverified, and incompletely specified strategies remain research-only. Shadow-variant P&L is non-additive.

**Reason:** Strategy count is not account exposure, and code presence is not evidence.

## ADR-022: Supplementary slippage does not replace frozen gates

**Decision:** Morning Tea may report 0.10 and 0.25-point-per-leg diagnostic scenarios to measure execution sensitivity, while retaining the original 0, 0.5, and 1.0 scenarios and every frozen acceptance gate.

**Reason:** Additional diagnostics can explain where an edge disappears without rewriting the decision rule after results are known.

## ADR-023: Add the ₹170/₹210 cohort prospectively

**Decision:** V9, V10-5, V10-10, and V11 reuse the BASE signal and executable fill but participate only when `170 < entry < 210`. Their ₹170 stop and corresponding continuous, stepped, or fixed-2R exit rules begin on 1 September 2026 and are not backfilled.

**Reason:** Prospective versioning preserves the existing V2–V8 journal while measuring the user's narrower-risk hypothesis on the same market-data stream.

## ADR-024: Separate cohort selection from exit geometry

**Decision:** Historical comparisons must report both each family's actual participation band and a strict `170 < entry < 210` common-entry cohort with identical date, contract, signal, and fill.

**Reason:** A P&L difference caused by taking different trades is not evidence that one stop or exit rule is better.

## ADR-025: Historical diagnostic evidence cannot mutate paper state

**Decision:** The Jan–Aug 2026 matched-risk result is diagnostic, not an untouched holdout. It cannot automatically promote, remove, or rewrite V2–V11 paper variants, even when its result is terminal.

**Reason:** The period was examined after the paper mechanics were designed, and 11 trading dates were data-missing. Prospective paper evidence must remain separate and auditable.


## ADR-026: Reconcile accepted artifacts before rerunning research

**Decision:** The clean Stocks-in-Play, four-module opportunity comparison, afternoon-compression validation, and Williams bear-call artifacts are authoritative for their frozen scopes. Documentation must link those artifacts before any strategy is labelled unverified or scheduled again.

**Reason:** A stale ledger is not evidence that a backtest is missing. Duplicate runs waste provider capacity and increase the risk of post-result parameter selection. Williams remains inconclusive because its executable sample was one 2025 trade and zero post-publication trades; that does not justify promotion or tuning.
