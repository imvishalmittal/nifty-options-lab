# Strategy Specification

## Purpose

This document separates the original V0.1 learning dashboard from the current research/paper strategy so historical results and future paper trades remain auditable.

The current forward-observation strategy is **NIFTY ₹180 Momentum V2**. It is paper-only and does not place broker orders.

## Legacy V0.1

The original `/` dashboard remains available as a learning tool for manually verified 15-minute/5-minute chart facts, EMA22/ADX/DI direction checks, one-OTM contract education, and conservative wait/no-trade states. Those rules are preserved as a named baseline; they are not the automated paper strategy.

## Momentum V2 — frozen paper rule

### Underlying and contracts

- Underlying: NIFTY only.
- Direction: long CE or long PE only.
- Expiry: nearest weekly expiry available for the session date.
- At 09:25, use NIFTY spot and progressively inspect nearest ITM CE and PE candidates.
- Select the usable CE and PE whose 09:25 premium is closest to ₹180.
- The candidate search must bracket ₹180 within its configured depth; otherwise classify the session as a data/candidate boundary instead of forcing a contract.

### Signal

For each selected CE/PE contract, evaluate completed 1-minute candles.

A confirmation exists when:

```text
previous close <= 180
current completed close > 180
09:30 <= current candle start < 09:45
```

- If neither side confirms, there is no trade.
- If CE and PE confirm in the same minute, the day is ambiguous and no trade is taken.
- Otherwise the side with the earlier confirmation is selected.

### Entry

- Enter at the **next 1-minute bar open** after the confirmed crossing.
- Entry must be strictly above ₹160 and strictly below ₹220.
- A next-bar entry at/after the cutoff is invalid.
- Historical fills are simulated from candle data; they are not reconstructed sub-minute broker fills.

### Stop and momentum trail

Initial active stop:

```text
₹160
```

Trail activation:

```text
completed-bar peak >= ₹220
```

Forward paper trail gap:

```text
20 premium points
```

After each fully completed 1-minute bar:

```text
proposed stop = max(160, peak premium - 20)
active stop   = max(previous active stop, proposed stop)
```

The updated stop becomes effective only from the **next** bar. This prevents same-bar look-ahead.

Stop execution model:

- stop check occurs before calculating a new stop from that candle;
- if the next bar opens below the active stop, exit at that bar open;
- otherwise if the bar trades through the active stop, exit at the stop price;
- the stop never moves lower.

### Session end

There is no overnight carry. If no stop exits the position, use the final available completed bar through 15:29 as the session exit fallback.

### Position sizing

Forward paper capital is ₹60,000.

```text
lots = floor(capital / (entry premium × lot size))
units = lots × lot size
```

Only whole lots are allowed. Historical studies use the lot size applicable to their period; current paper sessions use the configured current NIFTY lot size.

### Costs and slippage

Research and ledger P/L include modeled NSE/Groww option transaction costs with date-sensitive STT. Historical robustness analysis also includes adverse slippage scenarios.

The dashboard's historical rows therefore represent **historical-market-data simulations with modeled execution/costs**, not real trades.

## Development/holdout discipline

- 2025 is the V2 development period.
- Predeclared trail gaps of 5/10/15/20 points may be compared in 2025 research.
- Forward paper observation is frozen at 20 points unless a new, separately named hypothesis is created and evaluated prospectively.
- 2026 is holdout evidence; the dashboard/holdout process consumes the frozen 20-point variant rather than choosing a better trail after seeing 2026.
- Integrity-failed months are excluded from evidence.

## Known 12-Aug-2025 benchmark

The known historical broker screenshot trade was NIFTY 14-Aug-2025 24500 CE, approximately ₹184.15 entry at 09:31:29 and ₹244.05 exit at 10:02:40.

The research engine independently selected the same contract/date family. That benchmark is a fidelity check, not a tuning target. A trail must be judged across the full development sample, not selected because it best reproduces one winning trade.

## Non-rules / prohibited tuning

Do not:

- place live broker orders from this system;
- average down;
- carry overnight;
- use incomplete one-minute candles to move a stop;
- move a stop lower;
- accept same-minute CE/PE ambiguity;
- force a contract when ₹180 is not bracketed;
- treat stale, missing, rate-limited, authentication-failed, CI-failed, or integrity-failed data as valid evidence;
- change the frozen paper trail merely because a different trail improves a known outcome.

## Readiness gate

Live-money automation is not justified until the frozen strategy shows credible historical/holdout behavior and then survives a meaningful forward paper period with reliable market-data, execution, cost, and operational controls.
