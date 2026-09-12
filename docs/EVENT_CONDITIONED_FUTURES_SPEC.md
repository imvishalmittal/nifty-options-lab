# P5 — US-close-conditioned NIFTY futures

Status: **REJECT_DISCOVERY — terminal**  
Frozen: 12 September 2026, before strategy results

## Terminal result — 12 September 2026

The unchanged 2016–2022 discovery completed in [run 34687277815](https://github.com/imvishalmittal/nifty-options-lab/actions/runs/34687277815).

- 768 event sessions with zero missing coverage.
- Normal execution lost **₹190,390.98**, with PF **0.9158**, maximum drawdown **₹218,480.51**, and win rate **49.48%**.
- The 1-point and 2-point stress cases lost **₹242,538.24** and **₹346,832.76** respectively.
- Only 3 of 7 years were profitable, and the monthly-clustered bootstrap interval was **−₹800.85 to ₹282.86**.

This was an economic rejection, not an infrastructure or coverage failure. The simple symmetric US-close direction rule did not produce an executable edge after costs. Validation and holdout remain sealed, and P5 was not added to paper or live trading. See [the consolidated new-generation results](NEW_GENERATION_RESULTS.md).

This study converts the earlier descriptive US-close/NIFTY association into a
causal trading test. For each India session it uses only the latest completed
S&P 500 and Nasdaq sessions with calendar dates strictly before the India date.

- Enter long when both US indices returned at least +0.5%.
- Enter short when both returned at most −0.5%.
- Otherwise do not trade.
- Use one actual NIFTY `FUTIDX` lot, selected with at least seven calendar days
  to expiry.
- Enter at the India-session futures open and exit at that session's official
  settlement. There is no overnight India position.
- Apply charges plus 0.5, 1 and 2 futures points of adverse slippage per side.

The threshold is symmetric and frozen as a new causal hypothesis; it is not a
claim that the prior descriptive study proved tradable predictability.
Discovery is 2016–2022, validation is sealed to 2023–2024, and holdout is
sealed to 2025–11 September 2026.

Discovery requires at least 100 trades, at most 2% missing eligible sessions,
normal PF ≥1.20 with positive P&L, 1-point PF ≥1.05 with positive P&L,
positive 2-point P&L, and a positive monthly-clustered 95% bootstrap lower
mean. No paper or live trading is authorized.
