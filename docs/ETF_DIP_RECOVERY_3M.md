# ETF Dip-Recovery Three-Month Research

This branch-only study replays the ETF strategy discussed on 27 August 2026. It is research-only: it contains no order placement, paper-session scheduling, dashboard wiring, or changes to the NIFTY options engines.

## Frozen signal

- Evaluate NSE cash ETFs at 15:15 IST using the close of the 15:10 five-minute candle.
- Require the price to be down at least 1% from the previous session close.
- Require the previous session's 30-trading-session return to be strictly between -2.5% and 0%. If all daily-drop qualifiers have positive 30-session returns, record `NO_QUALIFIER`.
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

The current Groww instrument master defines the universe. This introduces survivorship limitations for ETFs delisted before the run date, and the result discloses that limitation explicitly.
