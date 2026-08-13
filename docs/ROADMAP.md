# Roadmap

## V0.1 — Interactive rules dashboard

Status: complete

- responsive dashboard;
- screenshot upload and local preview;
- editable normalized facts;
- deterministic states;
- one-OTM contract calculation;
- capital, risk, 2R, and 3R calculations;
- safety gate;
- hosted private learning dashboard;
- GitHub source and CI.

## V0.2 — Engine extraction and full tests

- move rules and calculations out of the page component;
- define a versioned normalized fact schema;
- add unit tests for every state and boundary;
- add clear per-rule explanations;
- make lot size, strike interval, capital, and risk configurable;
- add structured sample scenarios for CALL, PUT, WAIT, and blocked states.

## V0.3 — Assisted screenshot extraction

- analyze 15-minute, 5-minute, and option-chain images;
- return proposed facts with confidence and evidence;
- require user confirmation of critical values;
- reject cropped, stale, mismatched, or unreadable images;
- retain no screenshots by default.

## V0.4 — Paper journal

- record recommendations and engine version;
- record hypothetical entry, stop, exit, charges, and slippage;
- calculate R-multiple and rule adherence;
- track whether 2R and 3R were reached;
- prevent duplicate same-day paper trades;
- export journal data.

## V0.5 — Automated market data

- introduce a provider interface for completed 15-minute and 5-minute candles;
- calculate EMA22, ADX(14), and DI internally;
- resolve exchange calendar, expiry, lot size, and strike interval dynamically;
- validate data freshness and provider health;
- preserve manual screenshot mode as a fallback and teaching tool.

## V0.6 — Live monitoring and notifications

- evaluate only after completed five-minute candles;
- show setup-forming and confirmation alerts;
- avoid duplicate notifications;
- record missed/stale checkpoints;
- run on a continuously available service, not GitHub Actions cron.

## V1 readiness gate

Do not consider broker integration until:

- paper results and rule adherence are reviewed over an adequate sample;
- every decision and risk rule has deterministic test coverage;
- market-data freshness and contract specifications are reliable;
- fees, slippage, and liquidity are modeled;
- security, privacy, regulatory, and operational reviews are complete;
- the user understands order placement and exit mechanics independently.

Automatic order placement is not part of the current roadmap commitment.
