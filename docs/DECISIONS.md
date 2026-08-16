# Architecture Decisions

## ADR-001: Separate repository

**Decision:** Keep NIFTY Options Lab separate from `global-trading-lab`.

**Reason:** The options lab has different data, execution, risk, UI, and paper-trading concerns from the broader India/US systematic research platform.

## ADR-002: Deterministic strategy mechanics

**Decision:** Strategy state, entries, exits, stops, and trail updates are assigned by fixed code.

**Reason:** Deterministic mechanics are auditable, testable, and reproducible across backtests and forward paper sessions.

## ADR-003: Preserve legacy learning mode

**Decision:** Keep the original screenshot/manual-fact V0.1 dashboard at `/` as a learning path rather than silently redefining it.

**Reason:** Historical meaning and educational value should remain stable even while research moves to a different automated strategy family.

## ADR-004: Paper only; no broker orders

**Decision:** Momentum V2 may automate data collection and simulated trade management, but it must not place live orders.

**Reason:** Historical evidence is still under validation and forward operational behavior has not yet been observed long enough.

## ADR-005: Continuous GitHub Actions session is acceptable for paper observation

**Decision:** Use a single weekday GitHub Actions job that starts around 09:20 IST and stays alive through the market session for paper observation.

**Reason:** One-minute cron scheduling is unsuitable, but a continuous job can poll completed candles predictably enough for paper validation. This is not a claim that GitHub Actions is suitable for production live execution.

## ADR-006: Causal completed-bar trailing stop

**Decision:** Trail updates use only fully completed 1-minute bars and become effective from the next bar.

**Reason:** This prevents same-bar look-ahead and makes historical and forward paper mechanics comparable.

## ADR-007: Freeze the forward paper trail at 20 points

**Decision:** Forward paper observation uses a 20-point trail after ₹220 activation, with ₹160 initial stop and the ₹180 entry family.

**Reason:** The paper observation needs one stable rule. A different trail must be introduced as a separately named hypothesis rather than selected because it better reproduces a known winner or improves already-seen holdout results.

## ADR-008: 2025 development, 2026 holdout

**Decision:** Use 2025 to characterize V2 variants; treat 2026 as holdout evidence for the frozen paper rule.

**Reason:** Separating development and validation reduces post-hoc threshold selection.

## ADR-009: Integrity gates override performance

**Decision:** Missing, boundary, partial, authentication-failed, rate-limited, CI-failed, or integrity-failed periods are excluded from accepted evidence.

**Reason:** A profitable-looking artifact is not useful if the underlying data/process is incomplete or unreliable.

## ADR-010: GitHub ledger before database

**Decision:** Use `public/paper/trades.json` and `session-status.json` as the current durable/auditable journal before adding a database.

**Reason:** The current paper volume is small, repository history is easy to inspect, and this avoids adding persistence complexity before the workflow is proven. A database can replace it later when write frequency, retention, or concurrency require it.

## ADR-011: Hosting and source deployment are separate states

**Decision:** Treat GitHub `main` and the public ChatGPT Sites deployment as separate release states.

**Reason:** Code can be merged and validated while the hosted `chatgpt.site` build still serves an older release until the Sites project is republished. Documentation and user messaging must not claim a route is live solely because it exists on `main`.
