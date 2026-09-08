# More Ideas — execution results

Status date: 8 September 2026

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

No original 13-item More Ideas strategy has been promoted. The later profit-only
extension produced two economically robust discovery candidates and starts a
separate prospective paper lane on 8 September 2026 while untouched 2025–2026
validation runs.

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

## Profit-only directional suite — economic discovery passed

This is another later extension: five NIFTY-derived CE/PE signals crossed with
three protection overlays (15 frozen configurations), no ₹180 entry constraint,
and the same normal/0.5/1-point cost stresses.

[Run 34123588659](https://github.com/imvishalmittal/nifty-options-lab/actions/runs/34123588659)
completed all 60 monthly artifacts and the consolidated gate. The special
zero-directional-loss hypothesis failed, but that is not an economic rejection:
the following two variants were profitable after normal costs and both adverse
slippage stresses.

| Variant | Trades | Normal | 0.5 point | 1 point | PF / max DD |
|---|---:|---:|---:|---:|---:|
| Retest-15 + breakeven after +10 | 839 | +₹615,899.21 | +₹446,981.17 | +₹278,063.14 | 1.620 / ₹92,975.39 |
| Previous-day break + breakeven after +10 | 869 | +₹410,004.45 | +₹222,830.28 | +₹35,656.10 | 1.384 / ₹158,908.69 |

| Variant | Invested min / average / max | Trade net P&L min / average / max |
|---|---:|---:|
| Retest-15 + breakeven after +10 | ₹30,169.75 / ₹51,244.38 / ₹59,982.00 | −₹9,385.81 / +₹734.09 / +₹127,248.58 |
| Previous-day break + breakeven after +10 | ₹30,355.00 / ₹52,090.38 / ₹59,982.00 | −₹12,224.13 / +₹471.81 / +₹69,425.90 |

The model sizes whole lots within ₹60,000 capital per strategy. “Profit-only”
never meant every trade was profitable: Retest-15 had 493 directional-loss
trades and Previous-day break had 507. The economic edge came from infrequent
large winners outweighing many small losses. Both CE and PE signals remain
enabled. Results are stored in
`public/research/profit-only-directional-2020-2024.json`.

Untouched 2025–8 September 2026 validation completed with 21/21 shards and a
**STOP_NEW_PAPER_ENTRIES** verdict. Retest-15 lost ₹153,717 normally, ₹215,886
at 0.5-point stress, and ₹278,055 at 1-point stress. Previous-day Break earned
₹19,313 normally but lost ₹25,640 and ₹70,593 under the two stresses. New paper
entries for these two rules are therefore stopped.

### Stepped-trailing follow-up

Four discovery variants are running over the same 2020–2024 monthly shards:
Retest-15 and Previous-day Break, each with a 5-point or 10-point stepped trail.
The initial stop is the signal option candle's low. At +10 premium points the
stop becomes entry; each later complete 5-point or 10-point rise moves the stop
by the corresponding step. A stop calculated from a candle applies only from
the next candle. They enter an explicitly experimental, isolated shadow journal
from 8 September 2026 while discovery runs. This is not promotion: no broker
orders are possible, results are excluded from V2–V11 totals, and a failed
discovery gate stops the experiment.

## Remaining execution order

1. Complete the four stepped-trailing discovery variants and evaluate their
   frozen normal/0.5/1-point gates.
2. Collect the experimental trailing paper journal without historical backfill.
3. Produce a clean repaired C3 discovery result after the serialized Groww slot
   is free.
4. Run M3 after dated BANKNIFTY/FINNIFTY contract and lot-size provenance is
   complete.
5. Run C1 only after the generalized spread engine passes cross-underlying
   integrity checks.
6. Keep S1–S3 blocked and O2 unspecified until their stated evidence
   requirements are met.

## Promotion boundary

The existing V2–V11 paper strategies and journals are unchanged. Profit-only
observations use ₹60,000 model capital each, are not live-trading authorization,
and are not additive to V2–V11 account totals. The dedicated dashboard route is
`/profit-only`.
