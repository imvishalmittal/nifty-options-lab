# ETF Dip-Recovery Three-Month Research

This branch-only study replays the ETF strategy discussed on 27 August 2026. It is research-only: it contains no order placement, paper-session scheduling, dashboard wiring, or changes to the NIFTY options engines.

## Frozen signal

- Evaluate NSE cash ETFs at 15:15 IST using the close of the 15:10 five-minute candle.
- Require the price to be down at least 1% from the previous session close.
- Require the previous session's 30-trading-session return to be -2.5% or more negative (at or below -2.5%).
- Require cumulative volume known by 15:15 to exceed 500,000 units.
- Rank qualifiers by the most negative eligible 30-session return, then the most negative one-day return, then the highest cumulative volume.
- Buy no more than one ETF per session.
- If the immediately preceding trading session had a purchase in the same deterministic category, exclude that candidate and select the next-ranked eligible category. A no-trade gap resets this consecutive-session restriction.

## Frozen exit and truthful open positions

- Place a conceptual limit target 7% above entry.
- Do not use a stop or forced time exit in the creator-version replay.
- Check only market highs that occur after entry. The entry day's earlier high cannot satisfy the target.
- If the target is never reached, retain the position as `OPEN` and mark it at the final available 15:15 price.

## Output

The artifact reports target hits, open positions, marked and adverse returns, sessions to target, maturity-aware 10/20/40/60-session hit rates, category exclusions, provider coverage, and 0%/0.25%/0.5% round-trip execution-haircut sensitivities.

The current Groww instrument master defines the universe. Groww classifies both ordinary NSE cash shares and ETFs as `instrument_type=EQ`, so the discovery rule requires an ETF, Exchange Traded Fund, or BeES identity token in the exchange name/symbol and tests that ordinary shares are excluded. Using the current master introduces survivorship limitations for ETFs delisted before the run date, and the result discloses that limitation explicitly.

## Exact three-year extension

The manual workflow `research-etf-dip-recovery-3y.yml` extends the same frozen rules to a default period of 2023-08-28 through 2026-08-27. It uses DhanHQ historical data because Groww's historical endpoint is limited to three months.

The repository secret `DHAN_ACCESS_TOKEN` must contain a currently valid Dhan access token with the Data API subscription enabled. Dhan access tokens generated from Dhan Web are valid for 24 hours, so generate the token shortly before starting the workflow. The runner calls only these read-only endpoints:

- `/v2/charts/historical`
- `/v2/charts/intraday`

It never imports or calls an order endpoint.

In addition to the original trade statistics, the long report includes equal-notional capital-slot usage: peak concurrent positions, average concurrent positions, open positions at the end, and marked return divided by the observed peak number of slots. This exposes capital lock-up from the no-stop/no-forced-exit rule.

## Free daily robustness approximation

The workflow `research-etf-dip-recovery-daily-3y.yml` requires no broker account or paid API. It downloads official NSE daily bhavcopy archives and tests 2023-08-28 through 2026-08-27.

It is intentionally labelled an approximation because it changes two data-dependent parts of the creator strategy: daily close replaces the 15:15 price and full-session volume replaces volume accumulated by 15:15. The entry-day high is ignored because it occurred before a closing-price entry. Split-like ETF unit changes are mechanically adjusted and disclosed in the artifact.

This free run is suitable for rejecting a weak strategy or deciding whether exact intraday validation is worth paying for. It must not be presented as an exact replay.
