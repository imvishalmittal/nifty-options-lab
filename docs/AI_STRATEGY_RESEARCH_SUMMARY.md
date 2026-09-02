# AI Handoff — NIFTY Options Strategy Research

```yaml
document_type: ai_project_handoff
repository: imvishalmittal/nifty-options-lab
as_of: 2026-09-02
primary_objective: Find causal, executable, cost-robust NIFTY/options strategies suitable for unchanged forward paper observation.
live_trading_authorized: false
live_selected_strategies: 0
paper_suite: V2-V11 counterfactual NIFTY premium-entry outcomes
experimental_shadow: 30-minute opening-range ATM credit spread
active_research:
  - weekly 0.08-delta NIFTY smart condor
  - monthly large-cap RSI iron condor
source_of_truth: docs/STRATEGY_STATUS.md
```

## 1. Read this first

This repository is a research and paper-trading laboratory. It does not place broker orders. The project objective is not to find a backtest with a positive headline P&L; it is to find a rule set whose result remains credible after causal execution, actual listed contracts, date-correct lot sizes, normal charges, adverse slippage, missing-data checks, drawdown analysis, temporal stability, concentration controls, and clustered robustness.

The most important current conclusions are:

1. **No strategy has been selected for live trading.**
2. **Paper observation is not selection.** V2–V11 are counterfactual simulations used to compare exit/risk rules on shared signals.
3. **The ₹170-risk family is not proven profitable.** It reduced losses relative to some ₹160 counterparts, especially V9 versus V2 and V11 versus V6, but every tested variant remained negative in the 2026 diagnostic and every six-variant discovery candidate failed the frozen gates.
4. **A positive profit factor above 1.0 is not sufficient.** A result can still fail on sample size, slippage, drawdown, temporal instability, concentration, bootstrap confidence, or data quality.
5. **The 30-minute opening-range ATM credit spread remains historically rejected.** A separately authorized prospective shadow journal is collecting observations, but it is not a promotion or a live strategy.
6. **Two option-selling discoveries are still in progress:** the weekly 0.08-delta NIFTY smart condor and the monthly large-cap RSI iron condor. Their parameters are frozen and must not be tuned after results.

## 2. Objective and operating constraints

### Objective

Identify deterministic NIFTY or liquid-stock option strategies that can survive realistic execution and then earn promotion, sequentially, through:

```text
frozen hypothesis
  → causal discovery backtest
  → untouched validation
  → untouched holdout
  → unchanged forward paper observation
  → separately authorized live engineering
```

Failure at any decisive gate stops that path. A rejected discovery does not access later years. Operational failures such as authentication, rate limiting, or a malformed integrity checker may be repaired without changing trading parameters.

### Non-negotiable controls

- Decisions use completed bars; fills occur no earlier than the next executable bar.
- Actual listed option contracts are required. Synthetic strikes or prices are prohibited.
- Historical lot sizes and normal Groww charges are applied where the protocol supports them.
- Adverse slippage is tested, normally at 0.5 and 1.0 option point per leg at entry and exit.
- Multi-leg quotes must be synchronized; a missing leg invalidates the candidate, not the market result.
- If one bar can touch both stop and target, the stop is counted first.
- Missing, invalid, rate-limited, authentication-failed, or integrity-failed periods are not performance evidence.
- Strategy parameters and gates are frozen before viewing the decision sample.
- Paper variants are non-additive alternative outcomes; their P&L must never be summed as one account.
- No overnight position is allowed in the current intraday paper suite.

### Common option-selling discovery gates

The currently active option-selling studies use these frozen gates:

| Gate | Requirement |
|---|---|
| Integrity | Strict causal and structural checks pass |
| Sample | At least 100 trades for daily/weekly strategies; at least 40 for monthly aggregate |
| Normal | Net P&L > 0 and PF ≥ 1.20 |
| 0.5-point stress | Net P&L > 0 and PF ≥ 1.05 |
| 1-point stress | Net P&L > 0 |
| Year stability | At least 3 of 5 profitable discovery years |
| Month stability | At least 55% of active months profitable |
| Clustered robustness | Monthly-clustered 95% bootstrap lower bound > 0 |
| Concentration | No year contributes more than 50% of gross positive P&L |
| Coverage | Missing/structurally invalid eligible sessions ≤ 2% |

## 3. Status vocabulary

| Status | Exact meaning |
|---|---|
| `PAPER` | Simulated prospective observation only; no broker order |
| `EXPERIMENTAL SHADOW` | Isolated prospective diagnostic lane; not a selected strategy |
| `ACTIVE RESEARCH` | Frozen backtest is running or queued; no verdict may be inferred |
| `DIAGNOSTIC` | Measures execution/data behavior; not an untouched selection sample |
| `REJECTED` | Completed evidence failed at least one predeclared gate |
| `INCONCLUSIVE` | Valid implementation produced too little evidence for a decision |
| `INCOMPLETE SPEC` | Source idea lacks deterministic rules for a defensible test |
| `SELECTED` | Passed the required evidence stages; currently no strategy has this status |

## 4. What is currently in paper observation

### NIFTY ₹180 premium-entry family: V2–V11

All variants buy a weekly NIFTY CE or PE. At 09:25, the engine searches actual nearby ITM contracts and chooses premiums closest to ₹180. A signal requires a completed one-minute cross from `close ≤ 180` to `close > 180` between 09:30 and before 09:45. Entry is the next one-minute open. BASE variants require `160 < entry < 220`; the ₹170 family requires `170 < entry < 210`.

| Variant | Frozen paper rule | Role |
|---|---|---|
| V2 | ₹160 initial stop; 20-point continuous trail activates after completed peak reaches ₹220 | Original control |
| V3-5 | ₹160 stop; entry-anchored 5-point stepped peak; 20-point trail gap | Exit comparison |
| V3-10 | ₹160 stop; entry-anchored 10-point stepped peak; 20-point trail gap | Exit comparison |
| V4 | NIFTY-confirmed entry; fail-fast below ₹180; then V2 trail | Confirmation comparison |
| V5 | Same confirmed entry as V4; V3-10 exit | Confirmation/exit isolation |
| V6 | ₹160 stop; target = `entry + 2 × (entry − 160)` | Fixed-2R control |
| V7 | V3-10 plus causal 15-bar failure exit | Stagnation-exit test |
| V8 | V3-10 with initial stop `max(160, entry − 20)` | Capped-risk test |
| V9 | ₹170 stop; continuous 20-point trail activates at completed peak ₹210 | V2 mirror |
| V10-5 | ₹170 stop; entry-anchored 5-point steps with 20-point gap | V3-5 mirror |
| V10-10 | ₹170 stop; entry-anchored 10-point steps with 20-point gap | V3-10 mirror |
| V11 | ₹170 stop; target = `entry + 2 × (entry − 170)` | V6 mirror |

V9–V11 began prospectively on 1 September 2026 and were not backfilled. The suite uses ₹60,000 model capital and whole-lot sizing. It produces no broker order.

### Opening-range credit-spread shadow

The user separately authorized one-lot prospective observation of the rejected 30-minute opening-range ATM credit spread from 2 September 2026. It is isolated from V2–V11, excluded from account totals, never backfilled, and has no broker-order path. Its purpose is to collect at least 100 new observations under unchanged rules. Historical status remains `REJECTED · EXPERIMENTAL SHADOW`.

## 5. Master evidence ledger

Amounts below include the repository's normal cost model. `0.5` and `1.0` denote adverse option-point slippage stress unless noted. PF means profit factor; DD means maximum drawdown; R means return normalized by initial trade risk.

| Strategy | Rules in one sentence | Evidence | Key result | Verdict and reason |
|---|---|---|---|---|
| NIFTY ₹180 Premium V1 | Buy selected option near ₹180 with fixed stop/target | 153 sessions; 72 trades | Normal +₹199.84; 0.5 −₹4,477.22; 1.0 −₹9,154.28 | **REJECTED:** negligible normal edge disappeared under stress; 11 sessions missing |
| Opening-range sweep/reversal control | Trade reversals around opening-range sweeps | 2020–Aug 2026; best 15-minute variant; 604 trades | +13.62R total; 2025 −16.08R; 2026 +19.25R | **REJECTED:** tiny, unstable edge |
| Defined-risk Batman | Bounded multi-leg Batman replication | 2025; 47 trades | Normal −₹44,330, PF 0.652; 1.0 −₹89,122, PF 0.452 | **REJECTED:** negative under every scenario |
| HAI 1:3:2 ratio | Assumption-explicit 1:3:2 option ratio | 2025; 50 trades | Normal +₹32,070, PF 2.435; 0.5 +₹11,562, PF 1.366; 1.0 −₹8,946, PF 0.793 | **REJECTED:** failed 1-point, drawdown, and winner-concentration gates |
| Intraday iron condor | Defined-risk intraday short premium | 2020–2024; 1,243 sessions; 269 trades | Normal −₹53,487, PF 0.362; 1.0 −₹163,158, PF 0.023 | **REJECTED:** severely negative; every stress year negative |
| Intraday iron butterfly | ATM short body with bounded wings | 2020–2024; 1,243 sessions; 146 trades | Normal −₹33,333, PF 0.269; 1.0 −₹95,103, PF 0.017 | **REJECTED:** no target exits; every stress year negative |
| Directional defined-credit spread | ADX/DI/EMA direction expressed as bull-put or bear-call spread | 2020–2024; 227 trades | Normal −₹13,714, PF 0.873; 1.0 −₹61,891, PF 0.523 | **REJECTED:** all profitability and yearly-stress gates failed |
| Quick Flip Scalper | Opening stock scalp using 1/3/5-minute confirmation protocol | 2020–2024; 7,277 trades | −349.84R; PF 0.935; DD 388.54R; 1/5 profitable years | **REJECTED:** negative before costs, unstable, bootstrap/data-quality failures |
| Late breakout/retest | Intraday late breakout with retest confirmation | 2020–2024; 670 trades | Normal −₹42,358; 1.0 −₹116,122; DD ₹133,956 | **REJECTED:** negative and stress-fragile |
| VWAP trend pullback | Trade pullback continuation around VWAP trend | 2020–2024; 1,223 trades | Normal +₹96,140; gross PF 1.195; 1.0 −₹37,345 | **REJECTED:** apparent edge vanished under stress |
| Failed opening-range break | Fade a failed opening-range move | 2020–2024; 976 trades | Normal −₹91,875; PF 0.985; 1.0 −₹198,573 | **REJECTED:** negative |
| Afternoon compression breakout | Trade release from afternoon compression | Discovery: 112 trades; validation: 25 trades | Discovery +₹16,980 and 1.0 +₹4,336; 2025 validation normal −₹3,056 and 1.0 −₹6,804 | **REJECTED:** untouched validation failed |
| Stocks-in-Play ORB | Point-in-time stock selection plus opening-range breakout | 2020–2024; 1,076 trades | PF 0.319 at 2-bps stress; 0.262 at 5-bps; zero profitable years | **REJECTED:** decisively unprofitable |
| Williams %R/EMA bear-call | Williams %R plus 5/15/50 EMA alignment, expressed as bear-call spread | 2025: 1 trade; post-publication 2026: 0 | One trade lost ₹104 normal; no forward sample | **INCONCLUSIVE:** insufficient occurrences; do not tune after viewing |
| Morning Tea stock-options proxy | 09:15 point-in-time gainer→call / loser→put; 09:16 entry; 10% target; opening-candle stop; 09:30 exit | 2025: 226 trades; 2026: 143 trades | 2025 normal +₹79,073 but 0.5 −₹51,939; 2026 normal +₹10,959 but 0.10 −₹6,146 and 0.25 −₹31,802 | **REJECTED:** execution sensitivity and weak monthly stability |
| 30-minute opening-range ATM credit spread | Confirm 30-minute NIFTY range break; sell ATM directional spread with 300-point hedge; 50% target / 2× stop / 15:15 exit | 2020–2024; 41 trades | Normal +₹6,233, PF 1.245; 0.5 +₹1,639, PF 1.061; 1.0 −₹2,921, PF 0.898 | **REJECTED:** sample, 1-point, bootstrap, and concentration gates failed; experimental shadow only |
| Weekly 0.08-delta NIFTY smart condor | Weekly ±0.08 shorts and ±0.03 hedges; 50% target / 2× stop; pre-expiry exit | Frozen 2020–2024 discovery | Result not yet accepted | **ACTIVE RESEARCH:** do not infer from partial shards |
| Monthly large-cap RSI iron condor | Daily and weekly RSI(14)<50; delta-selected monthly condor on frozen large-cap list | Frozen 2020–2024 discovery | Result not yet accepted | **ACTIVE RESEARCH:** queued behind weekly study |

## 6. The ₹160 versus ₹170 risk question

### Five-year six-variant discovery

The definitive 2020–2024 study used 1,243 sessions and the same 641-entry cohort for every variant. Integrity passed across all 60 monthly shards.

| Frozen exit | Win rate | Normal P&L / PF / DD | 0.5 P&L | 1.0 P&L / PF / DD | Positive normal months |
|---|---:|---:|---:|---:|---:|
| Fixed ₹160 / ₹220 | 39.00% | −₹238,856 / 0.915 / ₹400,948 | −₹432,337 | −₹625,818 / 0.794 / ₹734,110 | 25/60 |
| Fixed ₹170 / ₹210 | 35.41% | −₹28,473 / 0.983 / ₹151,990 | −₹221,954 | −₹415,435 / 0.784 / ₹474,729 | 26/60 |
| Entry-relative fixed 2R | 34.63% | −₹11,188 / 0.996 / ₹299,860 | −₹204,669 | −₹398,150 / 0.860 / ₹586,367 | 28/60 |
| Continuous trail | 34.63% | −₹89,031 / 0.966 / ₹379,518 | −₹282,512 | −₹475,993 / 0.833 / ₹667,779 | 30/60 |
| 5-point stepped trail | 33.85% | +₹5,366 / 1.003 / ₹191,275 | −₹188,115 | −₹381,596 / 0.800 / ₹491,529 | 33/60 |
| 10-point stepped trail | 30.11% | −₹90,178 / 0.950 / ₹271,101 | −₹283,659 | −₹477,140 / 0.770 / ₹572,406 | 28/60 |

Interpretation: fixed ₹170/₹210 was materially less bad than fixed ₹160/₹220 at normal costs, but it was still negative and failed both stress scenarios. The 5-point trail's tiny normal profit and PF 1.003 are economically indistinguishable from no edge and collapse under slippage. **This study selected no variant.**

Evidence: [run 33439891121](https://github.com/imvishalmittal/nifty-options-lab/actions/runs/33439891121).

### Jan–Aug 2026 matched diagnostic

All 76 executable entries were between ₹175.30 and ₹198.00, so the live-policy bands and strict common-entry cohorts were identical. Cohort selection caused exactly zero difference; paired differences came only from exit geometry.

| Pair | ₹160-family normal P&L / PF / DD | ₹170-family normal P&L / PF / DD | Narrow-minus-wide P&L | Interpretation |
|---|---:|---:|---:|---|
| V2 vs V9 continuous | −₹171,740 / 0.545 / ₹180,508 | −₹55,139 / 0.748 / ₹91,393 | +₹116,600 | ₹170 geometry reduced loss, but remained negative |
| V3-5 vs V10-5 | −₹66,351 / 0.679 / ₹104,514 | −₹71,069 / 0.611 / ₹82,230 | −₹4,717 | ₹170 version was worse on P&L/PF, better on DD |
| V3-10 vs V10-10 | −₹99,074 / 0.609 / ₹135,563 | −₹88,169 / 0.549 / ₹94,503 | +₹10,905 | Mixed; lower loss/DD but lower PF |
| V6 vs V11 fixed 2R | −₹241,060 / 0.467 / ₹253,885 | −₹87,295 / 0.657 / ₹94,405 | +₹153,765 | ₹170 geometry sharply reduced loss, but remained negative |

Every variant was negative at normal costs and at 0.5/1-point stress. Eleven of 164 dates were missing, making this a useful but incomplete diagnostic rather than an untouched holdout. It supports continued prospective comparison, not selection.

Evidence: [run 33476628683](https://github.com/imvishalmittal/nifty-options-lab/actions/runs/33476628683).

## 7. Detailed notes on active option-selling studies

### Weekly 0.08-delta NIFTY smart condor

- Entry: first trading session after preceding weekly expiry; decision 09:44, entry 09:45.
- Expiry: next listed weekly NIFTY expiry.
- Shorts: listed CE closest to +0.08 delta and PE closest to −0.08 delta.
- Hedges: farther-OTM CE closest to +0.03 and PE closest to −0.03.
- Exit: 50% of initial credit target, 2× initial credit stop, or 15:15 on the session before expiry.
- No adjustment, rolling, or re-entry.
- Reported on defined maximum-loss capital with actual contracts, historical lots, costs, and stress.
- Discovery run: [33547992564](https://github.com/imvishalmittal/nifty-options-lab/actions/runs/33547992564).

### Monthly large-cap RSI iron condor

- Frozen watchlist: SBIN, RELIANCE, TCS, INFY, WIPRO, CIPLA, DRREDDY, SUNPHARMA, BAJAJ-AUTO, ASIANPAINT.
- Eligibility: RSI(14) from completed daily and weekly underlying bars is below 50 at decision time.
- Entry: first trading day after preceding monthly expiry; decision 09:44, entry 09:45.
- Expiry: next monthly expiry.
- Shorts: listed CE closest to +0.10 delta and PE closest to −0.12 delta.
- Hedges: farther-OTM CE closest to +0.05 and PE closest to −0.06.
- Skip proxy: absolute prior-close to entry-open underlying gap above 12%; report separately.
- Exit: 50% credit target, 2× credit stop, or 15:15 on the trading day before expiry.
- No adjustment, rolling, or re-entry.
- Discovery run: [33554275097](https://github.com/imvishalmittal/nifty-options-lab/actions/runs/33554275097).

Partial results from either active study must not be inspected or used to tune parameters. Only consolidated artifacts that pass integrity can support a verdict.

## 8. Why seemingly good strategies were rejected

Several results illustrate why PF > 1 or positive normal P&L is not enough:

| Example | Attractive headline | Decisive failure |
|---|---|---|
| HAI 1:3:2 | PF 2.435 normal; PF 1.366 at 0.5 | Negative at 1 point; drawdown and winner concentration failed |
| VWAP pullback | +₹96,140 normal | −₹37,345 at 1 point |
| Afternoon compression | Passed 2020–2024 discovery | Untouched 2025 validation lost money |
| Morning Tea | +₹79,073 in 2025 normal case | Negative at realistic stress and negative in 2026 at 0.10/0.25 |
| Opening-range credit spread | PF 1.245 normal; PF 1.061 at 0.5 | Only 41 trades; negative at 1 point; bootstrap and concentration failed |
| 5-point ₹180 trail | PF 1.003 normal | Tiny edge vanished immediately under slippage |

The governing question is: **is the edge large, stable, causal, diversified, and executable enough to survive realistic uncertainty?** None of the terminal strategies has yet answered yes.

## 9. Data and operational lessons

- Groww TOTP tokens and manual access tokens can expire or be rate-limited. HTTP 401/429 is an infrastructure event, not a losing trade.
- Groww-heavy workflows share a serialized concurrency group. Monthly shards are intentionally bounded to avoid GitHub's six-hour job limit and excessive token generation.
- A failed shard may be retried only for authentication/provider/workflow/data-integrity defects. Successful shards and frozen parameters remain untouched.
- Some historical source periods contain missing option candles or incomplete symbol histories. Missingness is explicitly counted and gated.
- Delta-based studies reconstruct signed call/put delta causally from entry-time underlying and option data; selection error is recorded.
- Corporate actions are difficult to reconstruct perfectly. The monthly stock-condor uses a frozen 12% discontinuity proxy and reports skips rather than silently deleting them.
- Backtest green status means the workflow ran; it does not mean the strategy passed. The consolidated gate artifact determines the verdict.

## 10. Instructions for the next AI agent

1. Treat [`docs/STRATEGY_STATUS.md`](STRATEGY_STATUS.md) as the current outcome ledger and the individual protocol/specification as the rule authority.
2. Never call a paper or experimental-shadow strategy “selected,” “approved,” or “profitable” without a new terminal gate decision.
3. Do not add V2–V11 P&L together; they are alternative exits on shared opportunities.
4. Preserve all historical and paper journals. Do not rewrite or backfill V2–V11 or the opening-range shadow.
5. Do not rerun terminally rejected strategies unless a genuinely new, source-supported hypothesis is frozen under a new name.
6. Do not change active weekly/monthly condor parameters after any result is visible.
7. Repair only operational or integrity defects during an active frozen study.
8. If discovery fails any decisive gate, seal 2025/2026 and record `REJECTED`.
9. If discovery passes every gate, run untouched 2025 with identical rules; run 2026 only after validation passes.
10. Never promote to paper/live automatically. Paper addition and live engineering require explicit authorization and separate risk controls.
11. Report samples, win rate, net P&L, PF, drawdown, stress, yearly/monthly stability, clustered confidence, concentration, integrity, missingness, and exact run links.
12. Keep the scheduled 09:20 paper workflow operationally isolated from Groww-heavy research as far as practical; do not sacrifice paper-session integrity to accelerate research.

## 11. Authoritative references

- [`STRATEGY_STATUS.md`](STRATEGY_STATUS.md) — outcome and promotion-status ledger
- [`STRATEGY_SPEC.md`](STRATEGY_SPEC.md) — V2–V11 deterministic paper rules
- [`PAPER_RISK_2026_DIAGNOSTIC.md`](PAPER_RISK_2026_DIAGNOSTIC.md) — matched ₹160/₹170 diagnostic protocol
- [`REMAINING_OPTION_SELLING_PROTOCOL.md`](REMAINING_OPTION_SELLING_PROTOCOL.md) — frozen opening-range and condor rules/gates
- [`MORNING_TEA_SPEC.md`](MORNING_TEA_SPEC.md) — frozen stock-options proxy
- [`OPPORTUNITY_RESEARCH.md`](OPPORTUNITY_RESEARCH.md) — four isolated intraday opportunity modules
- [`STRATEGY_RESEARCH_SUITE.md`](STRATEGY_RESEARCH_SUITE.md) — implementation-oriented research inventory
- [`PAPER_V3_FORWARD_OBSERVATION.md`](PAPER_V3_FORWARD_OBSERVATION.md) — paper operating model
- [`SAFETY_AND_LIMITATIONS.md`](SAFETY_AND_LIMITATIONS.md) — boundaries and known limitations
- [`DECISIONS.md`](DECISIONS.md) — architectural/research decisions

When this handoff conflicts with a newer dated terminal entry in `STRATEGY_STATUS.md`, the newer terminal entry wins.
