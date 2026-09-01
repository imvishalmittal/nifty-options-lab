# Forward paper observation — V2 through V11

Last updated: 1 September 2026

## Scope

The weekday paper workflow simulates twelve named counterfactual outcomes. It cannot place broker orders. Every position is intraday and uses the repository cost model, date-correct lot size, and ₹60,000 model capital.

## Entry cohorts

| Thread | Variants | Entry definition |
|---|---|---|
| BASE | V2, V3-5, V3-10, V6, V7, V8 | Nearest weekly ITM CE and PE closest to ₹180 at 09:25; completed crossing above ₹180 from 09:30 to before 09:45; next-bar-open entry only if premium is >₹160 and <₹220 |
| 170/210 comparison | V9, V10-5, V10-10, V11 | Reuse the BASE contract, signal and executable fill; participate only when premium is >₹170 and <₹210 |
| NIFTY-confirmed | V4, V5 | Same option setup plus matching NIFTY confirmation |

A same-minute CE/PE ambiguity is rejected. No position is carried overnight; 15:29 is the fallback exit.

## Variants

| Variant | Frozen forward rule |
|---|---|
| V2 | Original ₹220-activated continuous 20-point trail |
| V3-5 | 5-point stepped trail, 20-point gap |
| V3-10 | 10-point stepped trail, 20-point gap |
| V4 | NIFTY-confirmed entry, fail-fast below ₹180, V2 trail |
| V5 | Same confirmed entry as V4, V3-10 exit |
| V6 | Fixed conservative 2R exit |
| V7 | V3-10 plus causal 15-completed-bar failure exit |
| V8 | V3-10 with initial stop max(₹160, entry minus 20 points) |
| V9 | V2 mirror with ₹170 initial stop and continuous trail activation at ₹210 |
| V10-5 | V3-5 mirror with ₹170 initial stop and entry-anchored 5-point steps |
| V10-10 | V3-10 mirror with ₹170 initial stop and entry-anchored 10-point steps |
| V11 | V6 mirror with a ₹170 initial stop and fixed 2R target from the actual fill |

## Accounting and causality

- Outcomes are alternatives on shared signals, not additive positions. Never sum variant P&L as one account.
- V5 reuses V4 candles; V6–V11 reuse BASE candles, so variants do not multiply market-data requests.
- Stop changes use completed bars and become effective on the following bar.
- Stops never move lower.
- Same-bar stop/target ambiguity resolves to the stop.
- Missing or unverified historical fields display as `—`; they are not reconstructed.
- V2 historical rows retain their original V2 definition.
- V9–V11 began prospectively on 1 September 2026 and are never backfilled into earlier paper dates.

## Current published state

The auditable files are:

- `public/paper/session-status.json` — BASE status
- `public/paper/v4-session-status.json` — NIFTY-confirmed status
- `public/paper/sessions.json` — merged session history
- `public/paper/trades.json` — variant trade ledger

As of this update, the latest published session is 1 September 2026. Authentication and contract discovery succeeded, but the completed signal was outside the executable band, so both BASE and NIFTY-confirmed threads recorded a valid no-trade. No V2–V11 P&L row was fabricated.

## Evidence boundary

Paper observation measures forward behavior and execution reliability; it is not live trading and does not erase historical gate failures. The Jan–Aug 2026 matched-risk study is diagnostic rather than an untouched holdout. It found every tested V2/V9, V3/V10 and V6/V11 outcome negative after normal costs and both slippage stresses, but cannot automatically add, remove or promote a paper variant. See `docs/PAPER_RISK_2026_DIAGNOSTIC.md` and `docs/STRATEGY_STATUS.md`.
