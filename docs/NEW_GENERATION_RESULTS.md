# New-generation strategy results — P1 through P7

Status date: 12 September 2026  
Frozen discovery period: 1 January 2016–31 December 2022  
Warm-up: calendar year 2015

## Evidence authority and integrity repair

The first combined discovery, [run 34683633660](https://github.com/imvishalmittal/nifty-options-lab/actions/runs/34683633660), completed P1 and P5 cleanly but correctly marked P2 and P6 `INVALID_DATA`. The daily spot-centred archive filter could remove an already-held strike after a large NIFTY move, and one absent held quote could freeze that position and contaminate all later coverage counts.

[PR #99](https://github.com/imvishalmittal/nifty-options-lab/pull/99) repaired only those integrity defects: it retained the complete actual NIFTY strike surface inside the already-frozen 7–50 DTE download window, required a positive actual option open for entry, made NSE expiry parsing timezone-independent, and isolated an unavailable observation instead of allowing it to poison later samples. No signal, period, parameter, roll, stop, fill convention, cost, stress scenario, or economic gate changed. The production build and all 319 tests passed.

The final authority is repaired [run 34687277815](https://github.com/imvishalmittal/nifty-options-lab/actions/runs/34687277815), commit `a9bcf62d675f556e2987cf284b79e099be9561f1`. All eight annual history jobs and the consolidated evaluator completed successfully. The downloaded aggregate ZIP matched GitHub's published digest exactly:

`sha256:f931f417fe2eb7bedff6909c1bb2474b22d36825e517625a4d437ec40a96d1f9`

It contained all six required files: `p1.json`, `p1-gates.json`, `p2-p4-p6.json`, `p2-p4-p6-gates.json`, `p5.json`, and `p5-gates.json`.

## Terminal decisions

| ID | Frozen candidate | Decision | Decisive evidence |
|---|---|---|---|
| P1 | Low-turnover positional NIFTY futures trend | **REJECT_DISCOVERY** | Maximum drawdown, yearly stability, year concentration, and clustered-bootstrap lower bound failed |
| P2 | 20–45 DTE directional NIFTY options with underlying invalidation | **REJECT_DISCOVERY** | Normal PF was 1.115 versus the frozen 1.20 minimum; clustered-bootstrap lower bound was negative |
| P3 | IV-minus-realized-volatility defined-risk spread | **DATA_BLOCKED** | No point-in-time IV, Greeks, synchronized bid/ask, and executable multi-leg history |
| P4 | Same signal expressed through futures versus options | **DESCRIPTIVE_ONLY / TERMINAL** | It cannot pass unless P1 and P2 independently pass; both were rejected |
| P5 | Symmetric US-close-conditioned NIFTY futures | **REJECT_DISCOVERY** | Negative P&L/PF at every execution level and negative clustered-bootstrap lower bound |
| P6 | 35% option-premium stop comparator | **REJECT_DISCOVERY** | Positive headline economics were dominated by concentration and the clustered-bootstrap lower bound remained negative |
| P7 | Calendar/term-structure relative value | **DATA_BLOCKED** | No point-in-time IV, Greeks, synchronized bid/ask, and executable multi-leg history |

No runnable candidate passed every discovery gate. Therefore the sealed 2023–2024 validation and 2025–11 September 2026 holdout were not opened. Nothing was added to paper or live trading.

## Exact consolidated economics

Amounts are one historical lot after the frozen charge model. P1 and P5 define 0.5 futures point per side as normal execution, with 1- and 2-point stresses. P2 and P6 define zero extra option slippage as normal, with 0.5- and 1-point stresses.

| ID / execution | Samples | Net P&L | PF | Max drawdown | Win rate | Median trade |
|---|---:|---:|---:|---:|---:|---:|
| P1 normal, 0.5 point | 117 | ₹494,416.22 | 1.4051 | ₹309,966.01 | 49.57% | −₹303.16 |
| P1 stress, 1 point | 117 | ₹486,391.64 | 1.3972 | ₹310,765.96 | 49.57% | −₹378.15 |
| P1 severe, 2 points | 117 | ₹470,342.49 | 1.3817 | ₹312,365.88 | 49.57% | −₹528.15 |
| P2 normal, 0 point | 117 | ₹96,082.23 | 1.1147 | ₹219,998.07 | 36.75% | −₹6,049.54 |
| P2 stress, 0.5 point | 117 | ₹88,111.10 | 1.1046 | ₹222,671.78 | 36.75% | −₹6,110.01 |
| P2 severe, 1 point | 117 | ₹80,139.96 | 1.0945 | ₹225,345.48 | 36.75% | −₹6,184.98 |
| P6 normal, 0 point | 30 | ₹258,929.71 | 2.6315 | ₹71,553.63 | 16.67% | −₹5,432.00 |
| P6 stress, 0.5 point | 30 | ₹256,980.66 | 2.6028 | ₹72,028.40 | 16.67% | −₹5,494.47 |
| P6 severe, 1 point | 30 | ₹255,031.60 | 2.5747 | ₹72,503.17 | 16.67% | −₹5,556.94 |
| P5 normal, 0.5 point | 768 | −₹190,390.98 | 0.9158 | ₹218,480.51 | 49.48% | −₹115.67 |
| P5 stress, 1 point | 768 | −₹242,538.24 | 0.8939 | ₹263,999.86 | 49.09% | −₹188.52 |
| P5 severe, 2 points | 768 | −₹346,832.76 | 0.8518 | ₹365,444.53 | 48.44% | −₹338.51 |

## Stability, bootstrap, concentration, and coverage

| ID | Positive years | Positive months | Monthly-clustered 95% mean interval | Positive-P&L concentration | Coverage |
|---|---:|---:|---:|---:|---:|
| P1 | 4/7 | 51/84 | −₹2,777.06 to ₹12,891.53; 84 clusters, 5,000 resamples | Best year supplied 53.79% of gross positive-year P&L; top 10% of trades supplied 55.68% of gross gains | 1 missing / 1,724 sessions = 0.0580% |
| P2 | 4/7 | 38/82 | −₹3,745.99 to ₹7,429.26; 82 clusters, 5,000 resamples | Top 10% of trades supplied 68.69% of gross gains | 6 missing / 1,724 = 0.3480% |
| P6 | 4/7 | 5/17 | −₹3,713.21 to ₹29,576.48; 17 clusters, 5,000 resamples | Top 10% of trades supplied 90.22% of gross gains; best trade ₹280,344.36 versus ₹417,634.30 total gross gains | 9 missing / 1,724 = 0.5220% |
| P5 | 3/7 | 42/84 | −₹800.85 to ₹282.86; 84 clusters, 5,000 resamples | Top 10% of trades supplied 49.94% of gross gains | 0 missing / 768 event sessions = 0% |

P2's six missing exit-quote dates were 21 September 2018, 19 October 2018, 22 March 2019, 22 July 2019, 16 August 2019, and 24 September 2019. P6 had seven missing stop-path observations and two missing exit quotes on nine dates. Both remained below the frozen 2% coverage ceiling; they are economic rejections, not invalid-data results.

### Normal-execution annual net P&L

| Year | P1 futures trend | P2 longer-DTE options | P6 premium stop | P5 US-close futures |
|---|---:|---:|---:|---:|
| 2016 | ₹101,256.28 | ₹53,599.65 | ₹19,661.72 | ₹1,541.81 |
| 2017 | ₹105,031.47 | ₹24,475.95 | ₹8,319.13 | ₹21,832.95 |
| 2018 | −₹28,006.60 | −₹41,597.94 | −₹16,946.69 | −₹77,408.61 |
| 2019 | −₹31,661.86 | −₹58,573.05 | −₹35,726.71 | −₹91,794.19 |
| 2020 | ₹321,405.26 | ₹169,476.17 | ₹250,182.59 | ₹100,424.23 |
| 2021 | ₹69,840.12 | −₹57,486.83 | −₹28,063.73 | −₹91,355.78 |
| 2022 | −₹43,448.43 | ₹6,188.28 | ₹61,503.40 | −₹53,631.40 |

## P4 instrument-expression comparison

P4 used the identical completed-close SMA100 ± 0.5 ATR20 direction in both engines. At each track's normal execution assumption, futures produced 117 segments, ₹494,416.22, PF 1.4051 and ₹309,966.01 drawdown; longer-DTE options produced 117 segments, ₹96,082.23, PF 1.1147 and ₹219,998.07 drawdown. Both clustered-bootstrap lower bounds were negative, and both underlying candidates failed their own frozen gates. This comparison is descriptive evidence only; it does not authorize preferring futures or options for trading.

## Final research boundary

P1, P2, P5, and P6 are terminal economic rejections under their frozen definitions. P4 is terminal descriptive evidence. P3 and P7 remain explicitly `DATA_BLOCKED`; settlement-only archives must not be substituted for point-in-time volatility and executable multi-leg data. A materially different future idea must be frozen as a new hypothesis rather than tuning these rejected candidates after seeing their results.
