# Strategy Specification

## Purpose

This document keeps strategy versions explicit so historical results and forward paper trades remain auditable. The original learning dashboard is V0.1, V2/V3 preserve the historical entry family, V4–V8 are the original forward-paper hypotheses, and V9–V11 are the separately tagged ₹170/₹210 comparison cohort beginning 1 September 2026.

No strategy version places broker orders.

## Legacy V0.1

The root `/` dashboard remains a learning tool for manually verified chart facts, EMA22/ADX/DI checks, one-OTM contract education, and conservative WAIT/NO-TRADE/READY states. It is not the automated paper strategy.

## Shared V2/V3 entry family

### Underlying and contract selection

- Underlying: NIFTY only.
- Direction: long CE or long PE only.
- Expiry: nearest weekly expiry available for the session date.
- At 09:25, use NIFTY spot and progressively inspect nearest ITM CE and PE candidates.
- Select the usable CE and PE whose 09:25 premium is closest to ₹180.
- The search must bracket ₹180 within configured depth; otherwise classify a data/candidate boundary instead of forcing a contract.

### Signal

A confirmation exists when:

```text
previous close <= 180
current completed close > 180
09:30 <= current candle start < 09:45
```

If neither side confirms, there is no trade. If CE and PE confirm in the same minute, the session is ambiguous and no trade is taken. Otherwise the earlier confirmation wins.

### Entry

- Enter at the next executable 1-minute bar open after confirmation.
- Entry must be strictly above ₹160 and strictly below ₹220.
- A next-bar entry at/after the cutoff is invalid.
- Historical fills are simulated from candle data, not reconstructed sub-minute broker fills.

## V2 — preserved historical momentum trail

V2 starts with a ₹160 stop and waits for a completed-bar peak of at least ₹220 before activating a 20-point trailing stop. V2 historical rows and artifacts remain immutable as V2 evidence.

## V3 — stepped trailing stop candidate

### Initial stop

```text
₹160
```

### Trailing geometry

The V3 trail keeps a fixed **20-point gap** behind the highest completed-bar peak, but the stop moves only after the peak has advanced by a configured step from the entry anchor.

Forward-paper candidate:

```text
trail gap  = 20 points
trail step = 10 points
```

Research comparison:

```text
5-point step vs 10-point step
same 20-point gap
same contracts, signals, entries, costs, and session rules
```

For entry `E`, step `S`, and completed-bar peak `P`:

```text
steps earned = floor((P - E) / S)
stepped peak = E + steps earned * S
proposed stop = max(160, stepped peak - 20)
active stop = max(previous active stop, proposed stop)
```

The stop never moves lower.

### Breakeven interpretation

Gross breakeven is reached when the active stop rises to at least the actual entry premium. With a 20-point gap, that normally requires the completed-bar peak to earn approximately a 20-point favorable move from the actual entry, subject to step rounding.

A stop at the entry premium is only **gross** breakeven. Transaction charges and adverse slippage can still produce a small negative net P/L.

### Causal stop update

The stop that existed before a candle is the only stop eligible to execute inside that candle. A higher stop derived from that candle's completed high becomes effective only on the following bar. This prevents same-bar look-ahead.

If the following bar opens below the active stop, modeled exit is at that open; otherwise a trade-through exits at the stop.

## Session end

There is no overnight carry. If no stop exits the position, use the final available completed bar through 15:29 as the session exit fallback.

## V4–V8 forward hypotheses

- **V4 — NIFTY-confirmed fail-fast:** require the selected option direction to agree with a completed NIFTY break of the 09:25–09:29 range. Before the ₹220 V2 trail activates, a completed option close below ₹180 schedules an exit at the next bar open.
- **V5 — confirmed stepped trail:** reuse the exact V4 confirmed entry, but remove fail-fast and apply the V3 10-point step / 20-point gap exit. This isolates entry confirmation from V4 exit behavior.
- **V6 — fixed 2R:** reuse the base entry, keep the ₹160 stop, and set target to `entry + 2 × (entry − 160)`. If stop and target occur in one candle, count the stop first.
- **V7 — 15-bar failure exit:** reuse the base entry and V3-10 trail. After 15 completed position bars, if MFE remains below 10 points and the option closes at or below entry, schedule exit at the next bar open.
- **V8 — capped-risk stepped trail:** reuse the base entry and V3-10 trail, but initialize the stop at `max(₹160, entry − 20)`, so the variant never loosens the original ₹160 stop.

Every stop, target, and failure decision uses completed candles. A decision derived from a candle becomes executable no earlier than the next bar unless it is a stop/target that existed before that candle.

## V9–V11 — ₹170/₹210 comparison cohort

These variants reuse the same selected contract, completed ₹180 signal, next-bar entry, lot sizing, candle stream, stop-first ambiguity rule, costs, and session exit as BASE. They participate only when the executable entry is strictly above ₹170 and strictly below ₹210. They do not rewrite or backfill V2–V8 paper history.

- **V9 — ₹170/₹210 continuous trail:** initial stop ₹170. No tightening occurs before a completed-bar peak reaches ₹210. From ₹210 onward, the active stop is the completed peak minus 20 points, effective on the next bar.
- **V10-5 — ₹170/₹210 5-point stepped trail:** initial stop ₹170. This preserves V3-5's entry-anchored mechanics: each completed 5-point step above the actual entry proposes a stop 20 points below that stepped peak, never below ₹170, effective next bar. It does not wait for ₹210.
- **V10-10 — ₹170/₹210 10-point stepped trail:** the same entry-anchored rule with 10-point steps. It does not wait for ₹210.
- **V11 — ₹170-stop fixed 2R:** V6 logic with initial stop ₹170 and target `entry + 2 × (entry − 170)`. This compares fixed 2R under the two initial-stop regimes; its target is not forced to ₹210.

## Position sizing

Forward paper capital is ₹60,000.

```text
lots = floor(capital / (entry premium × lot size))
units = lots × lot size
```

Only whole lots are allowed. Historical studies use the period-correct lot size; current paper sessions use the configured current NIFTY lot size.

## Costs

Paper/ledger P&L uses modeled option transaction charges with date-sensitive STT. Historical research also stresses adverse slippage. These are simulations, not real fills.

## Research discipline

- V2 history remains V2; it is not retroactively recomputed and relabeled V3.
- V3 is a separately named hypothesis prompted by the risk-management objective of reducing loss after favorable movement.
- 5-point and 10-point steps are predeclared V3 research variants with the same 20-point gap.
- Prefer the variant only after reviewing complete clean evidence, costs, drawdown, losing streaks, temporal consistency, and sensitivity; do not choose from one known winner.
- Integrity-failed periods remain excluded.
- Forward paper observations must be tagged with their strategy version.
- V2–V11 are alternative shadow outcomes; never add their P/L as one-account profit.
- Freeze all variants for their declared observation windows. Regime fields such as day, entry time, expiry day, EMA alignment, and ADX are diagnostics rather than new filters during this run.

## Prohibited behavior

Do not place live broker orders, average down, carry overnight, use incomplete candles to tighten stops, move a stop lower, accept same-minute CE/PE ambiguity, force unbracketed ₹180 contracts, or treat stale/missing/auth-failed/rate-limited/CI-failed/integrity-failed data as valid evidence.

## Readiness gate

Live-money automation is not justified until the selected strategy version has credible historical evidence and a meaningful unchanged forward paper period with reliable market-data, cost, execution, reconciliation, and operational controls.
