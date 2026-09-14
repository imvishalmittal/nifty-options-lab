# Reviewed new-ideas protocol — 14 September 2026

Status: pre-registration and implementation authorization for research only.
Nothing here changes the paper engine or authorizes broker orders.

This review supersedes ambiguities in `NEW_IDEAS_2026-09-13.md`. There are
eight numbered ideas; Idea 7 is retained only as provenance and is superseded
by the corrected Idea 8 audit.

## Review decisions

| Idea | Reviewed state | Frozen next action |
|---|---|---|
| 1 concentration throttle | RUNNABLE | Retest-15 + BE10 host; trigger is the 90th percentile of strictly profitable, corrected dated-lot discovery trades; halve whole lots for the next five market sessions |
| 2 frequency cap | RUNNABLE | Same host; first-come-first-served maximum six entries in each rolling 20-session window |
| 3 multiple-comparisons audit | METHOD_BLOCKED | Do not use an independent-binomial null on correlated variants; requires aligned trade vectors and a correlation-preserving max-statistic resampling design |
| 4 two-family confirmation | RUNNABLE_AFTER_ENGINE_JOIN | Freeze V2 premium-cross direction plus Retest-15 agreement; retain V2's actual selected contract, causal next-bar entry, ₹160 stop, ₹220 activation and 20-point continuous trail |
| 5 open-interest filter | RUNNABLE | Retest-15 + BE10 host; selected contract must have signal-time OI >= 1,000 historical lots; no alternate strike substitution |
| 6 BANKNIFTY transfer | RUNNABLE | Retest-15 + BE10, BANKNIFTY only, `NSE-BANKNIFTY`, actual dated contracts and dated lot size; no pooled result |
| 7 day-of-week filter | SUPERSEDED | Do not run |
| 8 expiry-distance filter | DESCRIPTIVE AUDIT FIRST | Measure calendar days and actual market sessions separately; use one V2 row per date; no candidate is frozen from duplicated rows |

## Corrections made before results

Idea 1's percentile cannot be calculated across all Retest-15 trades: its 90th
percentile is negative because only 56 of 839 discovery trades are profitable.
The economic phrase “large realized gain” is therefore made operational as the
90th percentile among strictly profitable trades. The earlier ₹50,137.10 value
is not authoritative because its source ledger used a fixed 65-unit lot across
2020–2024. The rule formula is frozen now; its numeric threshold is calculated
once from the repaired host ledger using the actual dated NIFTY lot sizes (75,
50 and 25 as applicable) before the overlay is scored.

Idea 8's original 0–6 measure was calendar-day distance. Calling Friday to the
following Thursday “six trading days” was incorrect. The repository audit must
label that value as six calendar days and must not infer a causal expiry effect
from it.

## Common evidence gates

Ideas 1, 2, 4, 5 and 6 must report normal, 0.5-point and 1-point adverse
execution; at least 100 independent trades; positive P&L and PF above one in all
three scenarios; at least three of five positive years; at least 60% positive
active months; positive monthly-clustered 95% bootstrap lower bound using 5,000
resamples and seed 20260816; maximum positive-year contribution <= 50%; and top
10% winner contribution <= 60%.

Idea 1 additionally requires its bootstrap lower bound to change from negative
to positive. Passing its narrow hypothesis gate alone is not sufficient for
validation; every common gate must pass.

Discovery is 1 January 2020 through 31 December 2024. Validation is 1 January
through 31 December 2025 and may run only after every discovery gate passes.
The sealed holdout is 1 January 2026 onward and may run only after validation.

## Integrity boundaries

- Recalculate whole-lot costs; never approximate a half-size trade by halving
  an already-net P&L value.
- Preserve state across monthly shards during final aggregation.
- OI must be the historical signal-candle field, not today's option-chain OI.
- Missing OI is `DATA_MISSING`, never zero and never an implicit rejection.
- BANKNIFTY uses actual historical contracts and lot sizes; no NIFTY lot-size
  substitution.
- No result can add, remove or modify a paper-trading variant.
