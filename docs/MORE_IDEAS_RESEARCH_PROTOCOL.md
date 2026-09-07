# More Ideas — research protocol and evidence ledger

Status date: 2026-09-07

This document converts the uploaded `MORE_IDEAS.md` holding pen into an auditable research queue. It does not alter V2–V11, the opening-range shadow journal, or any paper-trading rule. No result in this document authorizes broker orders or automatic paper promotion.

Completed runs, numeric outcomes, active work, and the remaining queue are
tracked in [`MORE_IDEAS_RESULTS.md`](MORE_IDEAS_RESULTS.md).

## Evidence labels

- **Terminal diagnostic rejection:** the idea was tested on an already-viewed artifact and failed. It cannot advance.
- **Frozen, data run pending:** deterministic rules exist, but the required historical run has not completed.
- **Blocked:** the project cannot produce a defensible backtest from its current data or infrastructure. A synthetic substitute is not accepted as evidence.
- **Research question only:** the source idea is not a unique trading rule and therefore has no honest backtest until a deterministic hypothesis is frozen.

## Queue

| ID | Idea | Frozen implementation or required decision | Current state |
|---|---|---|---|
| M1 | IV rank/percentile for premium selling | For the weekly condor, average the two short-leg entry IVs; compare the current value with the preceding 52 valid weekly observations; enter only at or above percentile 50 | **Terminal diagnostic rejection** |
| M2 | RBI/Budget event exclusion | Reject a short-premium position if its inclusive entry-to-exit date interval intersects the versioned 2020–2024 RBI MPC decision/Budget calendar | **Terminal diagnostic rejection for weekly condor** |
| M3 | Multi-index opening-range spread | Apply the exact causal 30-minute opening-range rule to NIFTY, BANKNIFTY and FINNIFTY; use six listed strike intervals for the hedge, each underlying's dated lot size, the existing 50% target/2× stop/15:15 exit, and report both pooled and per-index results | **Frozen, data/provenance run pending** |
| C1 | ₹180 crossing as spread skew | At 09:45 classify the first causal upward ₹180 option-premium cross. When it agrees with the later opening-range direction, retain the ATM short; otherwise move the short one listed strike OTM and retain a six-interval hedge. All other spread rules stay unchanged | **Frozen, data run pending** |
| C2 | Morning Tea liquidity gate | Permit only `RELIANCE`, `HDFCBANK`, `ICICIBANK`, `SBIN`, `INFY`, and `TCS`, frozen before symbol-level P&L inspection; retain all original Morning Tea rules and stress cases | **Terminal diagnostic rejection** |
| C3 | IV regime plus opening-range spread | Prior-session India VIX close ranked against exactly 252 prior VIX sessions; enter only at or above percentile 50; missing/duplicate/reference-date mismatch is data-missing, never a non-trade | **Operationally incomplete; 30-day fetch/shard repair merged, clean rerun evidence pending** |
| S1 | PEAD via options | Frozen SUE arithmetic and causal session-window module exist; requires licensed point-in-time consensus/actual EPS, NSE release timestamps, a dated option universe, and an overnight lifecycle | **Blocked on point-in-time earnings data and overnight engine** |
| S2 | Covered-call/BXM overlay | Requires an owned underlying portfolio, monthly rolls, dividends/corporate actions, assignment treatment and capital accounting | **Blocked; separate portfolio project, not an intraday option variant** |
| S3 | Earnings IV crush | Requires a point-in-time earnings calendar, stock-option IV surface, overnight gap execution and defined-risk structure | **Blocked; same short-gamma tail risk must be measured explicitly** |
| S4 | High win-rate condor claim | Diagnose win/loss magnitude, PF, tails and year stability from the complete weekly-condor artifact | **Completed caution; claim rejected as a selection criterion** |
| O1 | VIX-low V2/V3 | Prior-session India VIX close ranked against exactly 252 prior sessions; run V2 and V3-10 unchanged only at or below percentile 50; record filtered sessions separately | **Terminal discovery rejection; all 60 shards completed, both variants failed 1-point stress** |
| O2 | Index versus stock-option microstructure | A ₹180 absolute premium threshold is not scale-invariant across stocks. A normalized replacement would be a different hypothesis | **Research question only; no unique rule yet** |
| O3 | Smart-condor loss cause | Recompute payoff ratio, tail-loss concentration, exit causes and yearly economics from all 255 trade rows | **Completed: loss-size-driven failure** |

## Completed diagnostics

### Weekly smart-condor loss anatomy (S4/O3)

The complete 2020–2024 artifact contains 255 trades: 143 winners and 112 losers.

| Measure | Result |
|---|---:|
| Win rate | 56.08% |
| Net P&L / PF | −₹47,418.06 / 0.438 |
| Average winner | ₹258.35 |
| Average loser | −₹753.24 |
| Winner/loss payoff ratio | 0.343 |
| Worst trade | −₹3,597.81 |
| Worst 5 share of gross loss | 15.73% |
| Worst 10 share of gross loss | 26.58% |

All five years were negative. The strategy's loss is therefore not explained by a low headline win rate; the average loss was 2.92 times the average win.

### Weekly smart-condor rolling-IV gate (M1)

The frozen 52-observation, percentile-50 gate produced 52 warm-up observations, 6 data-missing observations, 112 regime skips and 91 retained trades.

| Scenario | Trades | Net P&L | PF |
|---|---:|---:|---:|
| Normal costs | 91 | −₹15,785.99 | 0.472 |
| 0.5-point slippage per leg | 91 | −₹32,277.99 | 0.164 |
| 1-point slippage per leg | 91 | −₹48,769.99 | 0.039 |

Every reportable year remained negative. Because the base discovery artifact had already been viewed, this is a post-hoc diagnostic that could reject the rule but could never promote it. It decisively rejects it.

### Weekly smart-condor macro-event exclusion (M2)

The versioned calendar excluded 18 trades whose holding intervals included an RBI MPC decision or Union Budget day; 237 trades remained.

| Scenario | Trades | Net P&L | PF |
|---|---:|---:|---:|
| Normal costs | 237 | −₹46,375.04 | 0.421 |
| 0.5-point slippage per leg | 237 | −₹98,049.97 | 0.105 |
| 1-point slippage per leg | 237 | −₹149,691.19 | 0.021 |

The exclusion did not improve PF and every year remained negative. It is rejected for this condor.

### Morning Tea fixed-name liquidity proxy (C2)

Historical one-minute candles do not contain the bid/ask spread, queue position or limit-order fill probability. The fixed six-name gate is therefore only a proxy, not proof that lower slippage can be achieved.

| Period | Trades | Normal | 0.10 point | 0.25 point | 0.50 point |
|---|---:|---:|---:|---:|---:|
| 2025 | 89 | +₹18,977.64, PF 1.523 | +₹10,106.95, PF 1.256 | −₹3,199.10, PF 0.928 | −₹25,375.84, PF 0.532 |
| Jan–Aug 2026 | 75 | +₹9,883.70, PF 1.280 | +₹2,483.31, PF 1.064 | −₹8,617.27, PF 0.804 | −₹27,118.24, PF 0.498 |

The proxy failed at the project's 0.25-point decision stress in both periods and remains rejected.

## Frozen data integrity rules

1. Volatility percentiles require the exact lookback, distinct dated rows and a verified prior-session reference. Short history, duplicates or date mismatch are errors/data-missing.
2. Event exclusions use the inclusive holding interval; they do not examine whether the skipped trade would have won or lost.
3. Descriptive credit/IV bins from a viewed sample are clues only. No threshold may be selected from the best-looking bin.
4. Multi-index results must show each index separately. A pooled profit cannot hide a losing index or a single-index concentration breach.
5. Every executable strategy retains normal costs and adverse slippage scenarios, year/month stability, clustered bootstrap, concentration and data-completeness gates.
6. Discovery failure seals later periods. Blocked ideas are not assigned zero P&L or called break-even.

## Next execution order

1. Complete the interrupted profit-only directional suite and evaluate only its full 60-month aggregate.
2. Produce a clean repaired C3 discovery result without changing its frozen percentile rule.
3. Generalize the opening-range runner for dated BANKNIFTY/FINNIFTY contracts and execute M3.
4. Execute C1 only after the generalized spread runner passes cross-underlying integrity tests.
5. Keep S1–S3 blocked until their point-in-time data and overnight accounting requirements are satisfied.
6. Do not create a backtest for O2 until a scale-invariant hypothesis is separately frozen before viewing stock-option results.
