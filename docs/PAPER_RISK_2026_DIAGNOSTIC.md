# Matched paper-risk 2026 diagnostic — frozen protocol

This diagnostic was frozen before accessing its result data. It compares the paper mechanics introduced on 1 September 2026; it is not an untouched holdout and cannot promote a strategy automatically.

## Period and execution

- Period: 1 January–31 August 2026. The in-progress 1 September session is excluded.
- Signal, contract selection and entry: the existing completed ₹180 signal and causal next-bar executable fill.
- Data: Groww one-minute NIFTY option candles; historical expiry lot sizes.
- Costs: Groww round-trip charges plus 0, 0.5 and 1.0 premium points of adverse slippage per leg.
- Intrabar ambiguity: active stop is applied before target; trail changes use completed candles and become effective on the next bar.

## Frozen pairs

| ₹160 family | ₹170 family | Shared exit logic |
|---|---|---|
| V2 | V9 | Continuous 20-point trail; activation ₹220 versus ₹210 |
| V3-5 | V10-5 | Entry-anchored 5-point steps with a 20-point gap |
| V3-10 | V10-10 | Entry-anchored 10-point steps with a 20-point gap |
| V6 | V11 | Fixed 2R from the applicable initial stop |

## Required comparisons

1. **Live-policy comparison:** ₹160 variants use `160 < entry < 220`; ₹170 variants use `170 < entry < 210`. This represents how each family would actually participate.
2. **Common-entry comparison:** both sides are restricted to the exact same `170 < entry < 210` dates, contract, signal and executable fill. This isolates stop/exit geometry from entry-band selection.

For every pair and both comparison modes, report trades, win rate, net P&L, profit factor, maximum drawdown, 0.5/1-point stress, and monthly profitability. Results remain research evidence only; existing paper variants continue independently and P&L is never additive.
