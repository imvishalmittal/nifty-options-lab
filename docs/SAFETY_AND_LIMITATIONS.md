# Safety and Limitations

## Intended use

NIFTY Options Lab is a research, education, and paper-trading system. It is not financial advice, a broker terminal, or an order-management system. The automated path simulates trades only and does not place, modify, or cancel broker orders.

## Financial risk

Options can lose premium rapidly. Volatility, time decay, spreads, slippage, fees, taxes, liquidity, and gaps can make real outcomes materially worse than a one-minute candle simulation. The ₹60,000 paper capital is an observation parameter, not a recommended account size.

## Historical simulation limits

Historical V2/V3 studies use real historical NIFTY option contracts/candles from Groww but simulated causal execution. They cannot know exact sub-minute fills, queue position, bid/ask spread at the execution instant, partial fills, or real broker-stop behavior.

## Forward paper-data limits

The paper session depends on Groww API availability and GitHub Actions runtime reliability. Authentication failures, throttling, missing/delayed candles, runner interruption, or incomplete contract metadata must be recorded as operational/data failures rather than converted into hypothetical successful trades.

The contracts endpoint is not assumed to be a complete near-spot chain. Paper selection validates the expected 50-point grid with actual 09:25 candles. Missing prices remain missing; the system never interpolates or invents an option premium.

Post-close recovery is allowed only for a non-terminal live session and is labeled `PAPER_REPLAY`. A replay must pass cohort, causal-time, entry-band, accounting, uniqueness, and V8 relative-stop checks before it can update the paper journal.

## Candle-completion rule

Signals and stop changes that rely on close/high/low use only fully completed one-minute candles. A higher stop derived from a bar becomes effective only from the following bar.

## V3 stepped-trail interpretation

V3 keeps a 20-point gap and moves the stop in configured 5-point or 10-point peak steps. A tighter step can reduce open risk sooner but may also increase stop-outs during normal option noise. Neither variant is assumed superior until clean historical and forward evidence supports it.

`breakevenReached` means the active stop reached at least the actual entry premium. It does **not** guarantee non-negative net P/L because charges and slippage still apply. A gap below the active stop can also produce a worse fill than the stop level.

## Contract-selection limits

The strategy searches actual weekly NIFTY contracts around ₹180. If the configured search does not bracket the reference premium or required data is missing, the session is classified as boundary/data failure instead of forcing a substitute. Lot sizes and exchange specifications must remain date aware.

## Research integrity

Do not use a period as evidence when it is incomplete, missing critical data, candidate-boundary invalid, authentication failed, materially rate-limited without recovery, CI failed, or integrity-gate failed. A profitable number never overrides bad data quality.

## Strategy-selection risk

V2 and V3 are distinct strategies. V2 history is preserved. V3 predeclares 5-point and 10-point step variants with the same 20-point gap. Do not select a variant because it reproduces one known winning trade or because it looks better on a partial/incomplete sample.

## Hosting limitation

GitHub `main` and the public ChatGPT Sites deployment are separate release states. Public availability must be verified directly after republishing.

## Before live-money use

Require credible historical evidence after realistic costs/slippage, a meaningful unchanged forward paper period, reliable provider/restart behavior, explicit risk limits and kill switches, reconciliation, secure credential architecture, regulatory/security/operational review, and a separate approval decision for live execution.

No current component authorizes automatic real-money trading.
