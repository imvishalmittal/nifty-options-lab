# Intraday iron-condor research track

This is a separate research workflow. It does not alter, call, or select any live or paper strategy version.

## Hypothesis

A defined-risk short iron condor may monetize intraday time decay on NIFTY sessions that remain range-bound after the opening period. The position is not a mandate to trade: it is admitted only when a causal range-regime filter passes.

The economic definition follows the Options Industry Council: maximum gain is the net credit, maximum loss is wing width less that credit, time decay generally helps, and rising implied volatility generally hurts. See [OIC: Short Condor](https://www.optionseducation.org/strategies/all-strategies/short-condor).

## Frozen discovery rules

- Observe 09:15–09:59 one-minute NIFTY cash candles and decide at 10:00.
- Require ADX(14) at or below 20, opening range at or below 0.60% of spot, EMA(9)/EMA(22) separation at or below 0.15%, and spot still inside the observed opening range.
- Select the nearest weekly expiry strictly after the session date. Expiry-day positions are excluded in the first test.
- Place short strikes at least 1% out of the money and at least 50 NIFTY points beyond the observed opening range. Use exact 200-point protective wings.
- Require at least five points of entry credit and credit below the wing width.
- Exit after 50% of entry credit is captured, when closing debit reaches 2x entry credit, or at 15:10.
- Detect thresholds only on a completed synchronized four-leg minute and fill all legs at the next synchronized minute open.
- Missing leg quotes produce `DATA_MISSING`; prices are never forward-filled.
- Charge eight option orders plus statutory costs and run 0.5- and 1.0-point adverse slippage per leg at both entry and exit.

## Why strike distance instead of delta

Cboe's benchmark condor methodology is useful as an external reference for delta-based wings, but Groww's historical candle endpoint does not expose historical option Greeks. The live option-chain endpoint does expose Greeks, which cannot be used retroactively without creating look-ahead or fabricated data. Discovery therefore uses observable spot, range, listed strikes, and option prices only.

- [Groww historical candles](https://groww.in/trade-api/docs/curl/backtesting)
- [Groww live option chain](https://groww.in/trade-api/docs/curl/live-data)
- [Cboe options strategy benchmark announcement](https://ir.cboe.com/news/news-details/2015/CBOE-Introduces-10-Options-Based-Strategy-Performance-Benchmark-Indexes-07-29-2015/default.aspx)

## Test sequence

1. Discovery: 2020–2024, partitioned monthly.
2. Freeze rules after inspecting only discovery results.
3. Validation: 2025, with no discovery-driven retuning.
4. Final holdout: 2026, opened once.
5. Only after all gates pass, design a separate paper workflow. No existing paper workflow changes in this research PR.

Discovery acceptance is frozen before viewing output: at least 1,000 sessions and 100 trades; no more than 5% missing sessions; normalized profit factor at least 1.20; 0.5-point stress profit factor at least 1.10; positive P&L and profit factor at least 1.00 under 1-point stress; at least four profitable stress years; no year contributing more than 65% of positive stress P&L; and stress drawdown no larger than 15 median defined-risk losses. Validation and holdout have separately precommitted minimum sample and stress gates in `iron-condor-gates.mjs`.
