# Forward paper observation — V2 through V8

Last updated: 31 August 2026

## Scope

The weekday paper workflow simulates eight named outcomes. It cannot place broker orders. Every position is intraday and uses the repository cost model, date-correct lot size, and ₹60,000 model capital.

## Entry cohorts

| Thread | Variants | Entry definition |
|---|---|---|
| BASE | V2, V3-5, V3-10, V6, V7, V8 | Nearest weekly ITM CE and PE closest to ₹180 at 09:25; completed crossing above ₹180 from 09:30 to before 09:45; next-bar-open entry only if premium is >₹160 and <₹220 |
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

## Accounting and causality

- Outcomes are alternatives on shared signals, not additive positions. Never sum variant P&L as one account.
- V5 reuses V4 candles; V6–V8 reuse BASE candles, so variants do not multiply market-data requests.
- Stop changes use completed bars and become effective on the following bar.
- Stops never move lower.
- Same-bar stop/target ambiguity resolves to the stop.
- Missing or unverified historical fields display as `—`; they are not reconstructed.
- V2 historical rows retain their original V2 definition.

## Current published state

The auditable files are:

- `public/paper/session-status.json` — BASE status
- `public/paper/v4-session-status.json` — NIFTY-confirmed status
- `public/paper/sessions.json` — merged session history
- `public/paper/trades.json` — variant trade ledger

As of this update, the latest published session is 28 August 2026. BASE closed a PE signal and recorded V2, V3-5, V3-10, V6, V7, and V8 outcomes. The NIFTY-confirmed thread recorded no trade.

## Evidence boundary

Paper observation measures forward behavior and execution reliability; it is not live trading and does not erase historical gate failures. Promotion decisions must use the acceptance policy in `docs/STRATEGY_STATUS.md` and keep every strategy version isolated.
