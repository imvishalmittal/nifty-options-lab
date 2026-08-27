# ETF Dip-Recovery Free Daily Three-Year Result

## Scope

- Period: 2023-08-28 through 2026-08-27
- NSE sessions tested: 739
- Universe: 347 currently active NSE EQ-series ETFs; all classified
- Source: official NSE daily bhavcopy archives
- Workflow run: https://github.com/imvishalmittal/nifty-options-lab/actions/runs/33097461903
- Integrity audit: PASS, including the corrected `<= -2.5%` rule and zero consecutive-session same-category violations

This is a robustness approximation. Daily close replaces the original 15:15 price, and full-day volume replaces volume accumulated by 15:15. The entry-day high is not allowed to satisfy the target.

## Result

| Metric | Result |
|---|---:|
| Trades | 235 |
| Reached +7% | 203 |
| Still open | 32 |
| Observed eventual target rate | 86.38% |
| Target within 20 sessions | 35.50% |
| Target within 40 sessions | 57.39% |
| Target within 60 sessions | 71.37% |
| Target within 120 sessions | 80.97% |
| Median sessions to target | 25 |
| 90th-percentile sessions to target | 119 |
| Average marked return per trade | +4.83% |
| Average marked return after 0.5% haircut | +4.33% |
| Worst open position | -26.41% |
| Worst adverse excursion | -37.71% |

The 32 open positions averaged -8.95%; 29 of the 32 were losing. The oldest unresolved position had been open for 468 sessions.

## Capital lock-up

Assuming every trade uses one equal-notional capital slot:

| Metric | Result |
|---|---:|
| Peak simultaneous positions | 56 |
| Average simultaneous positions | 22.43 |
| Positions still using capital at end | 32 |
| Three-year marked return on 56-slot capacity | +20.26% |
| Same after 0.5% per-trade haircut | +18.16% |
| Approximate annualized return before haircut | 6.34% |
| Approximate annualized return after 0.5% haircut | 5.72% |

The annualized figures are simple fixed-capacity equivalents, not a compounded brokerage-account simulation.

## Concentration warning

The immediate-next-session category restriction worked: 87 candidates were excluded and the audit found zero violations. It did not prevent repeated purchases in the same weak category after a gap.

FMCG/consumption produced 11 trades, zero targets, and an average marked return of -12.03%. Technology produced 27 trades, seven remained open, and its average marked return was only +1.07%.

## Comparison with the exact three-month replay

For 2026-05-28 onward, this daily approximation produced 25 trades and 17 targets (68%). The exact 15:15 Groww replay produced 18 trades and 13 targets (72.22%). The broad direction is similar, although the ETF universe, entry price, and volume measurement differ.

## Verdict

The dip signal shows a genuine recovery tendency and is worth further research, but the creator strategy as specified is not live-ready. Its high eventual target rate is achieved by waiting indefinitely while accepting deep drawdowns and substantial capital lock-up. On a capacity basis, the approximate annualized return was only about 5.7% after a 0.5% execution haircut, before tax and other opportunity costs.

Any next experiment must be declared in advance and compared on identical entries. The most relevant controls are a maximum holding period and a cap on already-open positions in the same category; these should not be retroactively presented as the original strategy.
