# Stepped Trail 2025 Development Results

Source: GitHub Actions run `31942482047` (`NIFTY 180 Stepped Trail 2025`).

Accepted development months: January through September and November 2025. October and December are excluded because their monthly completeness/integrity gates failed.

All accepted results use the same actual-contract entry family, 20-point trailing gap, completed one-minute bars, next-bar-effective stop updates, modeled transaction costs, ₹60,000 capital, and the historical 75-unit NIFTY lot size.

## Aggregate accepted months

| Variant | Trades | Winners | Losers | Net P/L | Avg/trade | Total P/L of losing trades | Avg losing trade |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 5-point step / 20-point gap | 110 | 40 | 70 | +₹9,804.84 | +₹89.13 | -₹313,848.12 | -₹4,483.54 |
| 10-point step / 20-point gap | 110 | 37 | 73 | -₹16,213.15 | -₹147.39 | -₹371,774.32 | -₹5,092.80 |

The 5-point version outperformed the 10-point version on 38 paired trades, the 10-point version outperformed on 5, and 67 paired trades produced the same net result.

## Interpretation

This is development evidence, not holdout validation. It supports promoting the 5-point step as the candidate to evaluate on 2026, but it does not justify changing the forward paper rule until the 2026 stepped holdout is complete and integrity-passed.

The loss-reduction hypothesis is plausible because the tighter step ratchets protection earlier while retaining the same 20-point gap. However, only causal stepped-trail backtests—not MFE alone—should be used to quantify what losses would actually have been avoided, because gaps and next-bar stop activation can change the realized exit.
