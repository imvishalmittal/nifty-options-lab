# Roadmap

## Completed foundations

### V0.1 — Interactive learning dashboard

Preserved at `/` as the educational path.

### Historical research framework

Implemented: actual historical NIFTY weekly contracts via Groww, causal one-minute execution, date-sensitive option costs, slippage stress, monthly integrity gates, robustness statistics, negative controls, and serialized API access.

### Momentum V2 infrastructure

Implemented and preserved: ₹180 premium-selection/entry family, ₹160 initial stop, full-session causal trailing, historical 2025 ledger backfill, V2 development/holdout workflows, weekday paper session, and `/paper` dashboard.

### Stepped Trail V3 candidate

Implemented on the current research/paper path:

- same ₹180 contract/signal/entry family;
- ₹160 initial stop;
- 20-point trailing gap;
- 5-point and 10-point trail-step research variants;
- 10-point step as forward-paper candidate;
- completed-bar / next-bar causal stop updates;
- strategy-versioned paper rows;
- dashboard fields for entry/peak/exit premium, MFE, step/gap, breakeven, exit reason, gross P/L, charges, and net P/L;
- dedicated 2025 comparison workflow and integrity gate.

### Forward V4–V8 suite

Implemented as a frozen paper comparison: NIFTY-confirmed fail-fast V4, confirmed-entry V3-10 V5, fixed 2R V6, 15-bar failure-exit V7, and maximum-20-point initial-risk V8. All reuse the existing two candle streams and remain paper-only.

## Immediate priorities

### 1. Finish V3 historical comparison

- complete the integrity-gated 2025 5-vs-10 step comparison;
- compare net expectancy, drawdown, losing streak, win rate, temporal consistency, slippage sensitivity, breakeven frequency, and MFE capture;
- exclude incomplete months rather than repairing performance around them;
- do not choose a variant from the known 12-Aug-2025 winner alone.

### 2. Forward paper observation

- run the versioned paper rule on every eligible market session;
- record no-trade/data-failure outcomes as well as completed paper trades;
- verify Groww authentication, contract discovery, signal timing, stop steps, charges, and end-of-day persistence;
- keep the rule stable long enough to measure forward behavior.
- run V2–V8 unchanged for roughly three months or at least 30 completed signal sessions;
- report per-variant expectancy, drawdown, losing streak, profit factor, costs, and temporal concentration;
- never sum alternative variant outcomes as account P/L.

### 3. Public dashboard publishing

- republish current `main` to the existing ChatGPT Sites project;
- verify `/paper` and ledger refresh directly after deployment.

## Next engineering improvements

- visible current-session status panel;
- downloadable CSV/JSON;
- provider/config-driven lot-size history;
- improved restart/recovery for interrupted paper sessions;
- durable storage beyond Git commits when volume justifies it;
- explicit strategy-version summaries in the dashboard.

## Live-money readiness gate

Do not add broker order placement until historical evidence, forward paper evidence, provider reliability, recovery behavior, hard risk limits, kill switches, reconciliation, security, and regulatory/operational review are all credible. Any future mechanics change must create a new named strategy version rather than silently changing V2 or V3.

Automatic live execution is not currently approved.
