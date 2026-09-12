# P2 / P4 / P6 — longer-DTE directional expression study

Status: **TERMINAL — P2/P6 rejected; P4 descriptive only**  
Frozen: 12 September 2026, before discovery results

## Terminal results — 12 September 2026

The unchanged 2016–2022 discovery completed in [run 34687277815](https://github.com/imvishalmittal/nifty-options-lab/actions/runs/34687277815).

| ID | Samples | Normal economics | Terminal decision |
|---|---:|---|---|
| P2 | 117 | +₹96,082.23; PF 1.1147; drawdown ₹219,998.07 | **REJECT_DISCOVERY** — PF missed the frozen 1.20 minimum and the bootstrap lower bound was −₹3,745.99 |
| P4 | 117 matched signal segments per instrument | Futures +₹494,416.22/PF 1.4051 versus options +₹96,082.23/PF 1.1147 | **DESCRIPTIVE_ONLY** — P1 and P2 both failed independently |
| P6 | 30 | +₹258,929.71; PF 2.6315; drawdown ₹71,553.63 | **REJECT_DISCOVERY** — bootstrap lower bound was −₹3,713.21 and the top 10% of trades supplied 90.22% of gross gains |

P2 and P6 remained profitable under their frozen 0.5- and 1-point stresses, and their missing coverage stayed below 2%. Those facts did not override the failed decisive gates. Validation and holdout remain sealed, and nothing was added to paper or live trading. See [the consolidated new-generation results](NEW_GENERATION_RESULTS.md) for complete stress, annual, concentration, coverage, and integrity evidence.

This shared study holds the underlying signal constant and tests three related
questions without a parameter sweep.

| ID | Question | Frozen expression |
|---|---|---|
| P2 | Can lower-turnover directional options survive time decay and costs? | Actual ATM CE for long / PE for short, expiry 20–45 DTE closest to 30 DTE |
| P4 | Is the result caused by the signal or instrument? | Compare P2 with P1 using the identical SMA100 ± 0.5 ATR20 completed-close signal |
| P6 | Does underlying invalidation beat premium-noise exits? | Compare P2's underlying-reversal exit with a predeclared 35% option-premium stop |

All entries, reversals and rolls execute at the next session's actual contract
open. P2 exits only after the completed underlying signal reverses and rolls at
seven DTE. P6's alternative premium stop uses the actual daily option open/low;
a gap through the stop fills at the open. After a premium stop, it waits for the
underlying direction to change before becoming eligible again.

The period boundary matches P1: 2015 warm-up, 2016–2022 discovery, 2023–2024
sealed validation, and 2025–11 September 2026 sealed holdout. Each options
candidate must have at least 30 segments, no more than 2% missing sessions,
normal net profit and PF ≥1.20, 0.5-point-stress net profit and PF ≥1.05,
positive 1-point-stress P&L, and a positive monthly-clustered 95% bootstrap
lower mean. P4 is descriptive until both instrument tracks independently pass.

Official NSE derivatives bhavcopies supply every option and futures OHLC used
for execution. Yahoo NIFTY OHLC supplies only the shared underlying signal. No
paper or live trading is authorized.
