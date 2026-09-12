# Profitable Indian F&O traders — strategy provenance review

Status date: 11 September 2026

## Decision

The public evidence does **not** reveal the deterministic strategies used by
the roughly 7% of individual Indian equity-F&O traders who were net profitable
over FY22–FY24. The SEBI study measures account-level outcomes and broad product
categories; it does not publish trader identities, long/short option direction,
entry and exit rules, holding periods, days to expiry, Greeks, position sizing,
or full trade ledgers.

No publicly promoted individual trader located in this review supplied all of
the following at once: a continuous multi-year broker-verified record, every
relevant account and hedge, charges, a complete trade ledger, and deterministic
rules stated before the results. Consequently, this review does not copy an
individual's claimed strategy into the backtest queue.

This is a useful result rather than a dead end. It tells the project what the
official evidence actually supports, which hypotheses are worth specifying,
and which popular conclusions would be inventions.

## What “7.2% profitable” means

SEBI reported that 93% of more than one crore individual equity-F&O traders
lost money in aggregate over FY22–FY24, with combined losses above ₹1.8 lakh
crore. Contemporary reporting gave the more precise profitable share as 7.2%.
Only 1% of individuals earned more than ₹1 lakh after transaction costs over
the three-year period.

The profitable group is not demonstrated to be a stable set of consistently
profitable people. An account can finish the aggregate period slightly positive
after one unusual trade, and annual membership can change. The statistic must
not be read as “7.2% possess a repeatable published strategy.”

Sources:

- [SEBI FY22–FY24 study press release](https://www.sebi.gov.in/media-and-notifications/press-releases/sep-2024/updated-sebi-study-reveals-93-of-individual-traders-incurred-losses-in-equity-fando-between-fy22-and-fy24-aggregate-losses-exceed-1-8-lakh-crores-over-three-years_86906.html)
- [SEBI FY22–FY24 study summary](https://www.sebi.gov.in/sebi_data/attachdocs/sep-2024/1727086965496.pdf)
- [Reuters report of the 7.2% figure](https://www.reuters.com/world/india/indias-retail-derivatives-traders-lost-18-trln-rupees-three-years-regulator-says-2024-09-23/)

## What the official data supports

SEBI's detailed FY22 study contains product category, demographics, net P&L,
and transaction costs. It supports descriptive comparisons, not causal claims
about why a trader won.

| FY22 cohort | Profitable | Loss-making | What it suggests |
|---|---:|---:|---|
| Index futures, all individuals | 26% | 74% | Better profit incidence than index options, but still mostly losing |
| Index options, all individuals | 11% | 89% | Very poor retail base rate |
| Stock futures, all individuals | 33% | 67% | Highest profit incidence of the four product buckets |
| Stock options, all individuals | 18% | 82% | Better than index options, still mostly losing |
| Active-trader trimmed sample, all products | 6% | 94% | Heavy activity was associated with worse outcomes |

Among active profit-makers in the trimmed sample, transaction costs consumed
about 21% of index-option net trading profit, versus 17% for index futures, 11%
for stock futures, and 8% for stock options. Top profit-makers were also highly
concentrated: the top 1% and top 5% of active profit-makers accounted for 51%
and 75% of that group's total net profit.

These observations support two research directions—lower turnover and testing
futures as a benchmark—but do not prove either one causes profitability. The
full source is [SEBI's FY22 individual F&O study](https://www.sebi.gov.in/sebi_data/attachdocs/jan-2023/1674645296493.pdf).

The more recent evidence does not show that the problem disappeared: SEBI's
FY22–FY24 study found average transaction costs of about ₹26,000 per individual
in FY24 and approximately ₹50,000 crore of transaction costs across the three
years. Costs are therefore part of the strategy mechanism, not a reporting
footnote.

## What the evidence does not support

| Claim | Verdict | Reason |
|---|---|---|
| “The profitable 7.2% were option sellers” | **Unsupported** | SEBI does not separate option buyers from writers |
| “They used expiry-day short straddles/strangles” | **Unsupported** | No entry, structure, DTE, or holding-period field exists in the study |
| “Broker-verified P&L proves a repeatable strategy” | **Unsupported** | It authenticates selected broker data, not the completeness of accounts, hedges, dates, or rules |
| “Profit in one account proves the trader was profitable overall” | **Unsupported** | Offset positions or losses can exist elsewhere |
| “The 7.2% were profitable every year” | **Unsupported** | The published statistic is aggregate-period net P&L, not persistent annual membership |
| “Algo profits show a retail strategy to copy” | **Unsupported** | SEBI says 96% of proprietary and 97% of FPI profits were generated by algorithmic entities, which is a different participant class and capability set |

Sensibull says its verification page receives P&L and positions from the broker
backend at the time of sharing, while Zerodha lets publishers choose the date
range, segments, and whether trades are displayed. Those tools are useful for
authenticating the displayed slice, but they are not an audited, all-account,
multi-year strategy record.

Sources:

- [Sensibull verified-P&L description](https://blog.sensibull.com/2022/12/06/verified-pl-by-sensibull/)
- [Zerodha verified-P&L documentation](https://support.zerodha.com/category/console/reports/other-queries/articles/verified-p-l)

## Public-trader provenance screen

A public strategy can enter this project's research queue only if it clears all
of these checks:

1. At least 24 continuous months of broker-verified results, not selected days.
2. Net results after charges, with losing periods included.
3. All material accounts and external hedges disclosed or credibly ruled out.
4. A downloadable trade ledger or enough synchronized trades to reconstruct it.
5. Deterministic signal, entry, sizing, stop, exit, instrument, and timing rules.
6. Rules published before the evaluated trades, not narrated after profitable
   outcomes.
7. No paid-course claim is used as evidence of profitability.

| Evidence tier | Definition | Treatment |
|---|---|---|
| A | Complete multi-year verified ledger plus predeclared deterministic rules | Eligible for independent replication |
| B | Verified P&L but incomplete accounts, ledger, or rules | Context only; cannot supply strategy parameters |
| C | Screenshots, videos, interviews, testimonials, or marketing claims | Excluded from evidence |

Result of this pass: **zero Tier-A public individual strategies identified**.
That does not mean none exist; it means none found in public sources met the
minimum standard needed for a defensible backtest.

## Research hypotheses justified by the aggregate evidence

These are hypotheses derived from SEBI's product and turnover observations.
They are not claimed to be the secret strategies of profitable traders.

| Priority | Candidate | Why it is worth testing | Current readiness |
|---|---|---|---|
| P1 | Low-turnover positional NIFTY futures trend benchmark | Directly tests the higher futures profit incidence and lower cost share without option decay or weekly-option microstructure | **Frozen and implemented; discovery queued** |
| P2 | Low-turnover, 20–45 DTE directional NIFTY options | Tests whether an underlying-based multi-day signal with fewer trades survives costs better than the rejected intraday/weekly families | **Frozen and implemented; discovery next** |
| P3 | Causal IV-minus-realized-volatility defined-risk spread | Tests volatility risk premium only when the observed IV/realized-volatility gap is sufficiently large, rather than selling premium every week | **Blocked on point-in-time IV surface, bid/ask, Greeks, and synchronized legs** |
| P4 | Futures-versus-options expression experiment | Runs the same underlying signal through futures and defined-risk options to isolate whether signal or instrument/cost causes the difference | **Implemented inside the shared P2/P4/P6 study** |
| P5 | Overnight/event-conditioned directional futures | Tests US-close and gap conditions without confusing association with causation | **Underlying alignment exists; deterministic trading rule still to freeze** |
| P6 | Underlying-invalidation versus premium-stop exit | Separates underlying signal failure from noisy option-premium stops | **Implemented inside the shared P2/P4/P6 study** |
| P7 | Calendar/term-structure relative value | Tests systematic term structure rather than outright direction | **Blocked on point-in-time IV, synchronized bid/ask, Greeks, and executable multi-leg data** |

P1 is now frozen in [`POSITIONAL_NIFTY_FUTURES_SPEC.md`](POSITIONAL_NIFTY_FUTURES_SPEC.md)
and implemented against official dated NSE futures bhavcopies. It remains a
benchmark, not a presumption that futures will be profitable.

## Frozen design requirements before any run

For each candidate, freeze the following before opening discovery results:

- underlying signal and completed-bar timing;
- actual dated contract selection and roll rules;
- entry and exit fill conventions, including gap-through treatment;
- maximum capital, whole-lot sizing, margin model, and overnight risk;
- normal charges and adverse slippage;
- discovery, validation, and holdout periods;
- minimum trades, profit factor, drawdown, temporal stability, bootstrap, and
  concentration gates;
- missing-data and synchronized-quote thresholds.

The existing project conventions remain mandatory: causal bars, actual listed
contracts, stop-first ambiguous-bar handling, costs, no silent missing-data
deletion, and no paper promotion based only on a positive headline P&L.

## Operational decision

P1 discovery is scheduled with its rules and gates frozen before results.
P2, P4 and P6 share one frozen actual-contract discovery implementation. P3
and P7 remain blocked by the same point-in-time volatility-surface and
execution-data gap; P5 still needs a deterministic causal trading rule. No
paper strategy or broker order is authorized by this work.
