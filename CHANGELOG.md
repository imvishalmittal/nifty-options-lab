# Changelog

All notable changes will be documented here.

## [0.4.0] - 2026-08-20

### Added

- V5 NIFTY-confirmed V3-10 trail to isolate V4 entry confirmation from fail-fast exits;
- V6 conservative fixed-2R benchmark;
- V7 causal 15-completed-bar failure exit;
- V8 maximum-20-point initial-risk stepped trail, never looser than the original ₹160 stop;
- per-variant session outcomes so alternative simulations are not presented as additive account profit;
- regression tests for same-bar stop precedence, next-bar failure exits, fixed-risk initialization, and V5 cohort reuse.

### Preserved

- existing V2, V3-5, V3-10, and V4 definitions;
- completed-bar/next-bar causality, ₹60,000 model capital, transaction costs, and no overnight carry;
- paper-only execution with no broker orders and no additional Groww candle streams.

## [0.3.0] - 2026-08-16

### Added

- NIFTY ₹180 Stepped Trail V3 as a separately named research/paper hypothesis;
- 20-point trailing gap with predeclared 5-point and 10-point peak-step variants;
- 10-point step as the initial forward-paper candidate;
- separate V3 stepped-trail engine, historical comparison runner, integrity gate, tests, and 2025 workflow;
- versioned paper rows so V2 history is not silently rewritten;
- dashboard columns for strategy, entry/peak/exit premium, max favorable move, trail step/gap, breakeven reached, exit reason, gross P/L, charges, and net P/L;
- strategy filter on the paper ledger.

### Changed

- risk reduction no longer waits for a fixed ₹220 activation in V3; the stop begins ratcheting after the completed-bar peak earns configured steps from the actual entry;
- a stop derived from a completed bar remains effective only from the next bar;
- gross breakeven is defined as active stop >= actual entry premium and is displayed separately from net P/L after charges.

### Preserved

- all Momentum V2 artifacts/ledger rows retain their original V2 mechanics;
- no broker orders;
- ₹180 entry family, ₹160 initial stop, no overnight carry, and ₹60,000 forward paper capital;
- integrity failures remain excluded from accepted research evidence.

## [0.2.0] - 2026-08-16

### Added

- NIFTY ₹180 Momentum V2 research path using actual historical weekly option contracts;
- completed-1-minute causal entry/stop/trailing mechanics;
- ₹160 initial stop, ₹220 trail activation, and predeclared 5/10/15/20-point research trails;
- frozen 20-point trail for forward paper observation;
- ₹50k/₹60k/₹70k historical capital scenarios and ₹60k forward paper capital;
- date-sensitive option transaction-cost model and slippage stress;
- monthly data-integrity/completeness gates;
- separate 2025 development and 2026 holdout workflows;
- weekday continuous Groww-backed paper session with no broker-order capability;
- `/paper` dashboard route;
- sortable trade ledger;
- validated research-artifact backfill with 110 integrity-passed 2025 rows from Jan–Sep and Nov.

### Methodology

- stop changes use completed one-minute bars and become effective on the next bar;
- same-minute CE/PE signals are rejected;
- invalid/partial/auth-failed/rate-limited/CI-failed/integrity-failed artifacts are not accepted;
- October and December 2025 remain excluded because completeness gates failed;
- the known 12-Aug-2025 trade is a fidelity benchmark, not a tuning target.

### Hosting

- GitHub source state and public ChatGPT Sites deployment are separate release states.

## [0.1.0] - 2026-08-13

### Added

- responsive NIFTY options learning dashboard;
- screenshot/manual-fact learning flow;
- deterministic wait/no-trade/ready states;
- one-OTM strike/risk education;
- guided sample mode;
- project documentation and GitHub Actions CI.

### Limitations

- no broker connection or automatic execution;
- V0.1 lot size and strike interval remain static learning configuration.
