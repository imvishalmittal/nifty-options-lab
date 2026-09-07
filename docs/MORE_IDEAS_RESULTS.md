# More Ideas — execution results

Status date: 7 September 2026

This is the result ledger for the ideas governed by
`MORE_IDEAS_RESEARCH_PROTOCOL.md`. It separates completed economic evidence
from operationally incomplete work. A positive unstressed result is not a pass:
every frozen cost, stress, integrity, stability, and robustness gate must pass
before validation or paper observation.

## Programme status

| State | Count | Ideas |
|---|---:|---|
| Completed / rejected | 6 | M1, M2, C2, S4, O1, O3 |
| Executable research pending | 3 | C3, M3, C1 |
| Blocked on data or infrastructure | 3 | S1, S2, S3 |
| Deterministic specification required | 1 | O2 |

No More Ideas strategy has been promoted to validation or paper trading.

## Original queue results

| ID | Evidence status | Result |
|---|---|---|
| M1 | **REJECTED** | The smart-condor rolling-IV gate retained 91 trades and lost ₹15,785.99 normally, ₹32,277.99 at 0.5-point stress, and ₹48,769.99 at 1-point stress. |
| M2 | **REJECTED** | RBI/Budget exclusion retained 237 trades and lost ₹46,375.04 normally; all stress cases and years remained negative. |
| M3 | **PENDING** | Multi-index opening-range spread still needs dated contract and lot-size provenance plus a clean discovery run. |
| C1 | **PENDING** | ₹180-crossing spread-skew rule is frozen but has not completed discovery. |
| C2 | **REJECTED** | The fixed six-name Morning Tea liquidity proxy failed the 0.25-point decision stress in both 2025 and Jan–Aug 2026. |
| C3 | **OPERATIONALLY INCOMPLETE** | The first run failed because Groww limits one-minute requests to 30 days. The fetch and monthly-shard repair is merged, but no complete repaired result or gate exists. |
| S1 | **BLOCKED** | Requires point-in-time earnings data, release timestamps, dated options, and overnight accounting. |
| S2 | **BLOCKED** | Requires an underlying portfolio, monthly rolls, dividends, assignment, and portfolio capital accounting. |
| S3 | **BLOCKED** | Requires a point-in-time earnings calendar, historical IV surfaces, and overnight-gap execution. |
| S4 | **REJECTED CLAIM** | A 56.08% win rate did not create a profitable condor: average loss was 2.92× average win and all five years were negative. |
| O1 | **REJECTED** | All 60 VIX-low shards completed, but neither V2 nor V3-10 survived every frozen slippage stress. |
| O2 | **INCOMPLETE SPEC** | No scale-independent stock-option rule has been frozen. |
| O3 | **COMPLETED DIAGNOSTIC** | The smart-condor failure was loss-size driven, not caused by too few winning trades. |

## O1 — VIX-low NIFTY ₹180 filter

[Run 34078355486](https://github.com/imvishalmittal/nifty-options-lab/actions/runs/34078355486)
completed all 60/60 monthly shards with a causal prior-session India VIX
percentile-50 filter.

| Base exit | Normal P&L | 0.5-point P&L | 1-point P&L | Verdict |
|---|---:|---:|---:|---|
| V2 | +₹41,372 | −₹67,515 | −₹176,402 | **REJECTED** |
| V3-10 | +₹116,512 | +₹7,625 | −₹101,262 | **REJECTED** |

Both variants failed the predeclared requirement to remain profitable at every
stress level. The positive normal figures do not authorize validation or paper
promotion.

## Close-entry stop study

This study is a later More Ideas extension, not one of the original 13 IDs.
The option premium only had to touch/cross ₹180 during the signal candle; entry
was the completed signal candle's close, not ₹180. Stop evaluation began on the
next candle. Each configuration contains 967 trades across 60/60 valid monthly
shards. [Run 34118609920](https://github.com/imvishalmittal/nifty-options-lab/actions/runs/34118609920)
completed with a frozen **REJECT_DISCOVERY** verdict.

| Configuration | Normal P&L | PF | 0.5-point P&L | 1-point P&L | CE normal | PE normal |
|---|---:|---:|---:|---:|---:|---:|
| V3-10, breakeven after +10 | −₹74,042 | 0.928 | −₹351,262 | −₹628,483 | +₹172,407 | −₹246,449 |
| V3-10, signal-candle low | −₹101,809 | 0.916 | −₹379,030 | −₹656,250 | +₹127,534 | −₹229,343 |
| V3-10, breakeven after +20 | −₹101,809 | 0.916 | −₹379,030 | −₹656,250 | +₹127,534 | −₹229,343 |
| V2, breakeven after +10 | −₹121,168 | 0.882 | −₹398,388 | −₹675,609 | +₹118,453 | −₹239,621 |
| V2, breakeven after +20 | −₹123,277 | 0.898 | −₹400,498 | −₹677,718 | +₹96,440 | −₹219,717 |
| V2, signal-candle low | −₹142,779 | 0.890 | −₹419,999 | −₹697,220 | +₹94,255 | −₹237,034 |
| V3-10, breakeven after +5 | −₹144,282 | 0.831 | −₹421,502 | −₹698,723 | +₹136,004 | −₹280,286 |
| V2, immediate breakeven | −₹146,641 | 0.527 | −₹423,861 | −₹701,082 | −₹45,140 | −₹101,501 |
| V3-10, immediate breakeven | −₹164,913 | 0.468 | −₹442,133 | −₹719,353 | −₹53,212 | −₹111,701 |
| V2, breakeven after +5 | −₹192,216 | 0.774 | −₹469,436 | −₹746,657 | +₹75,156 | −₹267,372 |

Immediate entry-price stops did not produce “no loss”: execution costs and
gap-through fills remained real, while ordinary noise caused very early exits.
CE-only slices were positive in several variants, but that asymmetry was observed
after viewing the combined result and is not evidence for a CE-only promotion.

## Profit-only directional suite

This is another later extension: five NIFTY-derived CE/PE signals crossed with
three protection overlays (15 frozen configurations), no ₹180 entry constraint,
and the same normal/0.5/1-point cost stresses.

[Run 34123588659](https://github.com/imvishalmittal/nifty-options-lab/actions/runs/34123588659)
is **operationally incomplete** as of this ledger snapshot. It produced 27
monthly artifacts through March 2022; subsequent shards encountered Groww token
resolution failures. The aggregate gate has not run, so partial P&L must not be
reported or used for selection. This is neither a pass nor an economic rejection.

## Remaining execution order

1. Recover or rerun the incomplete profit-only shards and evaluate only the
   complete 60-month aggregate.
2. Produce a clean repaired C3 discovery result.
3. Run M3 after dated BANKNIFTY/FINNIFTY contract and lot-size provenance is
   complete.
4. Run C1 only after the generalized spread engine passes cross-underlying
   integrity checks.
5. Keep S1–S3 blocked and O2 unspecified until their stated evidence
   requirements are met.

## Promotion boundary

The existing V2–V11 paper strategies and journals are unchanged. Rejected
discoveries stay rejected, incomplete runs produce no verdict, and no More Ideas
strategy enters paper observation without passing its frozen discovery,
validation, holdout, cost-stress, and integrity gates.
