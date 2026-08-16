# Roadmap

## Completed foundations

### V0.1 — Interactive learning dashboard

Complete and preserved at `/`:

- responsive screenshot/manual-fact UI;
- deterministic WAIT/NO-TRADE/READY states;
- EMA22/ADX/DI learning flow;
- basic contract/risk education;
- hosted Sites project, GitHub source, and CI.

This is now a legacy learning path rather than the primary paper strategy.

### Historical research framework

Complete enough for current strategy work:

- actual historical NIFTY weekly contracts via Groww;
- causal one-minute execution models;
- date-sensitive option transaction costs;
- slippage stress;
- monthly completeness/integrity gates;
- development vs holdout separation;
- robustness statistics and negative-control studies;
- shared serialized Groww API queue.

### Momentum V2 paper infrastructure

Implemented:

- ₹180 premium-selection/entry family;
- ₹160 initial stop;
- full-session trailing engine;
- completed-bar causal stop updates;
- 20-point frozen forward paper trail;
- ₹60,000 model capital and whole-lot sizing;
- weekday continuous paper session;
- durable JSON trade ledger;
- `/paper` dashboard with year/month/CE-PE/P&L filters and sortable columns;
- validated 2025 backfill;
- 2026 holdout workflow.

## Immediate priorities

### 1. Finish historical validation

- complete the 2026 Jan–Aug holdout using the frozen 20-point variant;
- reject integrity-failed months rather than patching performance around them;
- summarize expectancy, drawdown, losing streak, temporal consistency, slippage sensitivity, MFE/MAE capture, and capital results;
- keep the 12-Aug-2025 broker trade as a fidelity benchmark, not a tuning target.

### 2. Forward paper observation

- run the same frozen rule each eligible market session;
- record no-trade/data-failure outcomes as well as completed paper trades;
- track provider/API failures, missed sessions, stop adjustments, charges, and execution drift;
- compare paper fills/timing with the historical execution model;
- do not change thresholds in response to a short winning/losing streak.

### 3. Public dashboard publishing

- republish the current `main` Sites build so `/paper` is available on the existing `chatgpt.site` hostname;
- keep hosting project identity unchanged;
- verify the deployed route and ledger refresh behavior after each meaningful UI release.

## Next engineering improvements

- move paper/history storage from repository commits to a durable store once retention and write semantics justify it;
- add a visible current-session status panel to `/paper`;
- expose source labels (`BACKTEST` vs `PAPER`) and data-quality status in the UI;
- add downloadable CSV/JSON export;
- make lot-size history provider/config driven rather than passed by workflow convention;
- improve retry/recovery behavior around Groww current-session data;
- preserve deterministic tests for every strategy-mechanics change.

## Live-money readiness gate

Do **not** add broker order placement until all of the following are true:

- historical development and holdout evidence is credible after costs and slippage;
- forward paper trading has run long enough to expose operational and execution differences;
- data freshness/contract selection is reliable in live market conditions;
- restart/recovery behavior is tested;
- risk limits and kill switches are explicit and independently testable;
- regulatory, security, credential, and operational implications are reviewed;
- any strategy change after paper observation is tested as a new named version rather than silently modifying V2.

Automatic live execution is not currently approved.
