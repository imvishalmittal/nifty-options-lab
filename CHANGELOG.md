# Changelog

All notable changes will be documented here.

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
- sortable trade ledger with row numbers and year/month/CE-PE/profit-loss filters;
- stop-loss adjustment count, entry/exit time, final stop, and net P/L reporting;
- validated research-artifact backfill into `public/paper/trades.json`;
- 110 integrity-passed 2025 momentum rows from Jan–Sep and Nov;
- current-session status journal.

### Methodology

- stop changes are based only on completed one-minute bars and become effective on the next bar;
- same-minute CE/PE signals are rejected as ambiguous;
- invalid/partial/auth-failed/rate-limited/CI-failed/integrity-failed artifacts are not accepted as evidence;
- October and December 2025 remain excluded because their completeness gates failed;
- 2026 is treated as holdout evidence for the frozen 20-point paper rule;
- the known 12-Aug-2025 24500 CE broker trade is a fidelity benchmark, not a tuning target.

### Hosting

- repository `main` contains the `/paper` route and current ledger;
- the existing ChatGPT Sites project remains the intended public host;
- public hosting can lag GitHub `main` until the Sites project is republished, so source merge and public deployment are treated as separate release states.

### Still excluded

- live broker order placement;
- automatic real-money execution;
- strategy threshold changes based on short-term paper outcomes.

## [0.1.0] - 2026-08-13

### Added

- responsive NIFTY options learning dashboard;
- 15-minute, 5-minute, and optional option-chain image upload/preview;
- user-verifiable chart facts;
- deterministic data-uncertain, no-trade, wait, CALL-ready, and PUT-ready states;
- one-OTM strike and one-lot capital calculations;
- ₹5,000 affordability and ₹300 intended-risk gates;
- option stop, 2R exit, and tracked 3R calculations;
- expiry-day and one-trade-per-day blocks;
- guided sample mode;
- verified Cloudflare-compatible production artifact;
- project documentation and GitHub Actions CI.

### Limitations

- no automated screenshot extraction;
- no broker connection or automatic execution;
- V0.1 lot size and strike interval remain static learning configuration.
