# Hybrid loss-control study results

Run: `32163452766`

Scope: 317 valid 2025+2026 sessions across the same historical periods used by the revised strategy study. All 16 monthly jobs passed exact-strategy validation, actual-contract execution, full-ledger checks, S1/S2 entry-cohort equality, and V2/V3 cohort equality.

## Combined one-lot results

| Combination | Trades | Net P&L | Profit factor | Avg loss | Worst trade | Max drawdown | +0.5 pt/leg | +1.0 pt/leg |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| S1 + V3-10 | 230 | ₹30,888 | 1.19 | -₹1,163 | -₹4,272 | ₹41,600 | ₹14,447 | -₹1,995 |
| S2 + V3-10 | 230 | ₹17,490 | 1.14 | -₹745 | -₹2,804 | ₹39,824 | ₹1,049 | -₹15,392 |
| S2 + V2 | 230 | ₹17,234 | 1.13 | -₹842 | -₹2,286 | ₹18,506 | ₹793 | -₹15,648 |
| S1 + V2 | 230 | ₹8,669 | 1.04 | -₹1,845 | -₹3,690 | ₹35,374 | -₹7,773 | -₹24,214 |
| S1 + V3-5 | 230 | ₹4,890 | 1.03 | -₹1,041 | -₹3,690 | ₹34,513 | -₹11,551 | -₹27,992 |
| S2 + V3-5 | 230 | -₹5,991 | 0.95 | -₹772 | -₹2,286 | ₹36,883 | -₹22,432 | -₹38,873 |
| S3 + V2 | 189 | -₹16,151 | 0.88 | -₹1,079 | -₹2,955 | ₹20,607 | -₹29,679 | -₹43,207 |
| S3 + V3-10 | 189 | -₹27,611 | 0.77 | -₹865 | -₹2,955 | ₹29,756 | -₹41,139 | -₹54,667 |
| S3 + V3-5 | 189 | -₹28,428 | 0.76 | -₹897 | -₹2,955 | ₹31,146 | -₹41,956 | -₹55,484 |

## Year split

The regime split remains unresolved.

| Combination | 2025 one-lot net | 2026 one-lot net |
|---|---:|---:|
| S1 + V3-10 | +₹53,338 | -₹22,450 |
| S2 + V3-10 | +₹41,662 | -₹24,172 |
| S2 + V2 | +₹29,118 | -₹11,883 |
| S1 + V2 | +₹26,152 | -₹17,483 |
| S1 + V3-5 | +₹22,486 | -₹17,596 |
| S2 + V3-5 | +₹16,105 | -₹22,096 |
| S3 + V2 | -₹8,766 | -₹7,385 |
| S3 + V3-10 | -₹9,407 | -₹18,204 |
| S3 + V3-5 | -₹12,391 | -₹16,037 |

No tested hybrid is profitable in the 2026 holdout periods. S3 is negative in both years and should be rejected in its current form.

## What worked

### S1 Recovery Hybrid

S1 produced 230 trades: 199 Primary and 31 Backup signals. The Backup mechanism was useful rather than merely adding noise:

- S1/V2 Backup one-lot contribution: about +₹7,608, profit factor 1.28.
- S1/V3-10 Backup one-lot contribution: about +₹5,982, profit factor 1.30.

S1/V3-10 has the highest combined P&L, but the one-lot result becomes slightly negative under +1 point adverse slippage per leg and its combined max drawdown is about ₹41.6k.

### S2 Fail-Fast Hybrid

S1 and S2 have exactly the same 230 entries. Therefore the difference is purely the failed-breakout exit.

For V2, fail-fast is useful:

- Combined net improves from ₹8,669 to ₹17,234 per one historical lot.
- Average losing trade improves from about -₹1,845 to -₹842.
- Worst trade improves from about -₹3,690 to -₹2,286.
- Max drawdown improves from about ₹35,374 to ₹18,506.
- 2026 loss improves from about -₹17,483 to -₹11,883.
- 144 trades used the failed-breakout exit; compared with leaving those trades under S1/V2, the exit adds about ₹8,565 one-lot net overall.

For stepped exits the same fail-fast overlay is not beneficial. It reduces S1/V3-10 net by about ₹13,398 and S1/V3-5 net by about ₹10,881. The stepped trails already react earlier, so the extra failed-breakout exit appears to cut recoveries/winners too aggressively.

## What did not work

S3 NIFTY confirmation reduced the cohort from 230 to 189 trades but did not improve quality. Every S3/V2/V3 combination is negative overall, and S3 is negative separately in 2025 and 2026. The current 09:25-09:29 NIFTY range-confirmation rule should not proceed.

## Position-sizing finding

The risk overlay exposed a structural issue with ₹60,000 capital and the fixed ₹160 hard stop.

Across S1/S2 entries:

- One-lot initial risk ranged from about ₹1,242 to ₹4,343.
- Median one-lot initial risk was about ₹1,952, roughly 3.25% of ₹60,000.
- The minimum capital needed for even one lot at a 2% risk cap ranged from about ₹62,075 to ₹217,125; median about ₹97,594.
- The minimum capital needed for one lot at a 1% risk cap ranged from about ₹124,150 to ₹434,250; median about ₹195,188.

Therefore zero historical trades were feasible under a strict 1% or 2% risk cap with only ₹60,000 capital. Max-affordable lot sizing should not be treated as an acceptable live risk model.

## Current interpretation

1. Keep S1's Backup concept; it adds positive historical contribution.
2. Keep the fail-fast concept only with V2 for further research; it materially improves average loss, worst loss and drawdown.
3. Reject S3 as currently defined.
4. Do not promote any hybrid to forward PAPER yet because all positive candidates remain negative in 2026 and execution stress is weak.
5. The next validation should be an untouched earlier holdout (preferably 2024 if contract/lot-size data can be reproduced correctly) and/or forward observation, without tuning these rules from the 2025/2026 results.
