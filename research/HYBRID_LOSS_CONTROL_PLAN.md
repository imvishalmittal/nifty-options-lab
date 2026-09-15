# NIFTY ₹180 Hybrid Loss-Control Study

Status: **research only**. The forward PAPER engine remains the revised single-closest strategy while this study runs.

## Frozen strategy families

The definitions below are frozen before looking at the hybrid backtest results. They must not be tuned month-by-month.

### S1 — Recovery Hybrid

- Reproduce the existing actual-contract CE and PE selections at 09:25.
- Primary = the one CE/PE contract whose 09:25 premium is closest to ₹180 by absolute distance.
- Backup = the selected contract on the opposite option side.
- Primary qualifies on its first completed 1-minute close above ₹180 from 09:30 through 09:44; it does not need to have been below ₹180 first.
- Backup qualifies only on the old fresh-cross rule: previous close `<= ₹180` and current close `> ₹180`.
- Earlier qualifying signal wins. If both qualify in the same completed minute, Primary wins.
- Entry remains the next 1-minute bar open, strictly inside the frozen `(₹160, ₹220)` entry band and before 09:45.

### S2 — Fail-Fast Hybrid

- Entry is **exactly S1**. S1 and S2 must have identical trade/no-trade decisions, side, signal time and entry.
- The ₹160 hard stop remains active.
- Before the selected V2/V3 exit variant has activated trailing protection, a surviving completed 1-minute candle that closes below ₹180 invalidates the breakout.
- That invalidation exits at the next bar open. No same-bar hindsight is allowed.
- Once trailing protection has activated for that exit variant, the fail-fast rule is disabled and the normal trailing logic owns the position.

### S3 — NIFTY-Confirmed Fail-Fast Hybrid

- Uses the S2 fail-fast exit.
- Freeze the NIFTY 09:25–09:29 five-minute reference range from five completed 1-minute candles.
- CE requires a completed NIFTY close above that range high.
- PE requires a completed NIFTY close below that range low.
- The option setup must also be armed: Primary is armed while it closes above ₹180 after first qualification; Backup is armed after a fresh cross and remains armed only while it continues closing above ₹180.
- If option and NIFTY conditions align, the combined signal time is that completed minute and entry remains next-bar open before 09:45.
- Missing any reference-range candle is `DATA_MISSING`, never guessed.

## Exit variants

Every strategy family is evaluated on the same three exit variants:

- V2 — existing continuous 20-point trailing stop after ₹220 activation.
- V3-5 — existing 5-point stepped trailing stop with 20-point gap.
- V3-10 — existing 10-point stepped trailing stop with 20-point gap.

This gives nine combinations: S1/S2/S3 × V2/V3-5/V3-10.

## Risk reporting

Signal quality and position sizing are deliberately separated. Every trade reports:

1. **One historical lot** — primary apples-to-apples money result.
2. **Normalized R** — initial hard-stop risk is `entry - ₹160`; report gross R and one-lot net R after costs.
3. **₹60k max-affordable sizing** — retained only for comparison with the existing engine.
4. **1% risk budget** — lots are capped by both affordability and 1% of ₹60k initial hard-stop risk. Zero lots means the setup is not feasible at that budget.
5. **2% risk budget** — same rule using 2% of ₹60k.
6. Every money scenario is recalculated with current modeled costs, +0.5 point adverse slippage per leg, and +1.0 point adverse slippage per leg.

The study also reports the minimum capital required to carry one historical lot at 1% and 2% initial-risk budgets.

## Evaluation priorities

Do not select a winner on headline P&L alone. Compare, in order of importance:

1. 2025 vs 2026 consistency.
2. Maximum drawdown.
3. Average losing trade and worst trade.
4. Longest losing streak.
5. Profit factor.
6. Normalized R.
7. Net P&L.
8. Slippage robustness.
9. Number of trades and Primary/Backup usage.
10. Frequency of fail-fast exits and whether they reduce loss without destroying later winners.

## Data integrity

- Reuse the existing progressive actual-contract selection and ₹180 bracketing/boundary checks.
- Preserve `DATA_MISSING` and `CANDIDATE_BOUNDARY` sessions.
- S3 additionally requires all five NIFTY reference-range candles.
- One trade maximum per strategy family per session.
- No broker orders. No changes to the forward PAPER engine from this study.
