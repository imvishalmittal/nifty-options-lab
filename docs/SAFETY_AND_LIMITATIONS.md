# Safety and Limitations

## Intended use

NIFTY Options Lab is a research, education, and paper-trading system. It is not financial advice, a prediction service, a SEBI-registered advisory product, a broker terminal, or an order-management system.

The current automated path simulates trades only. It does **not** place, modify, or cancel broker orders.

## Financial risk

Options can lose the entire premium rapidly. Volatility, time decay, spreads, slippage, fees, taxes, liquidity, and execution gaps can make real outcomes materially worse than a historical candle simulation.

The ₹60,000 paper capital is an observation parameter, not a recommended account size or a guarantee that losses are bounded to a comfortable level.

## Historical-backtest limitations

Historical V2 results use real historical NIFTY option contracts/candles from Groww, but execution is simulated causally from one-minute bars.

Therefore backtests cannot know:

- exact sub-minute fill timing;
- queue position or partial fills;
- bid/ask spread at the precise execution instant;
- whether a broker stop would fill exactly at the modeled stop;
- transient API/broker outages that could occur live.

Modeled transaction costs and slippage stress reduce, but do not remove, those limitations.

## Forward paper-data limitations

The paper session depends on Groww API availability and GitHub Actions runtime reliability. It can fail because of authentication, throttling, missing candles, delayed data, runner interruption, or incomplete contract metadata.

A provider/runtime failure must be recorded as a data/operational failure, not converted into a hypothetical successful trade.

## Candle-completion rule

Signals and trailing-stop changes that rely on close/high/low must use only fully completed one-minute candles. The current bar must not be treated as complete merely because the provider returned it.

A new trailing stop becomes effective only on the following bar. This conservative rule prevents same-bar look-ahead.

## Contract-selection limitations

The strategy selects actual weekly NIFTY contracts and searches progressively for premiums around ₹180. If the configured search depth does not bracket the reference premium or required data is absent, the session is invalid/boundary rather than a forced substitute.

Lot sizes and exchange contract specifications change over time. Historical and current sizing must remain date/configuration aware.

## Research-integrity limitations

Do not use as strategy evidence any period that is:

- incomplete;
- missing critical session data;
- candidate-boundary invalid;
- authentication failed;
- materially rate-limited without recovery;
- CI failed;
- integrity-gate failed.

A profitable number does not override data-quality failure.

## Strategy-selection risk

The 5/10/15/20-point trails were research variants. The current forward paper rule is frozen at 20 points.

Do not switch to another trail because it reproduces the 12-Aug-2025 known winning trade more closely or because it performs better on already-seen 2026 data. That would convert holdout/paper evidence into tuning data.

## Hosting limitation

GitHub `main` and the public ChatGPT Sites deployment are separate release states. A route can exist in the repository while the public site still serves an older build until republished. Public availability must be verified directly.

## Legacy screenshot dashboard

The root `/` V0.1 learning interface still previews screenshots locally and requires user-verified facts. It should not be confused with the automated ₹180 Momentum V2 paper strategy.

## Before live-money use

At minimum, require:

1. credible historical development and holdout evidence after realistic costs/slippage;
2. a meaningful forward paper period using the unchanged rule;
3. reliable provider freshness/contract selection and restart behavior;
4. explicit hard risk limits and kill switches;
5. robust logging/reconciliation for every signal, stop update, and exit;
6. secure broker credential architecture separated from the client/UI;
7. regulatory, security, and operational review;
8. a new explicit approval decision for live execution.

No current component should be interpreted as authorization for automatic real-money trading.
