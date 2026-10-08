# NIFTY Options Lab — Master Strategy Ledger

**As of:** 2026-10-08

This is the single human-readable tracker of the strategy families and numbered ideas researched in this repository. It records what each strategy does, why it was tested, why it was rejected or retained, and what is still running. Primary repository artifacts, commits, and workflow runs are authoritative.

## Current state

- **ACTIVE CLOSURE TEST:** Idea 17 — prior completed-day decisive bias (>=0.5%).
- **ACTIVE RESEARCH:** Idea 20 — exit-side research.
- **PAPER / CONTROL:** Idea 10A and V2–V11 premium variants. These are observation/control lanes, not promoted live strategies.
- **REJECTED / CLOSED:** Ideas 13 H1/H2, 14, 15 Fixed10, 15 Width25, and 16.
- **CLOSED DIAGNOSTICS:** Ideas 18 and 19.
- Ideas 1, 2, 4, 5, 6 remain protocol-defined runnable hypotheses but are not proven candidates. Idea 3 is method-blocked. Ideas 9, 11 and 12 have no authoritative numbered definition in the primary material available here; this ledger does not invent one.

## V2–V11 premium family

### V2 — Original continuous trail
**How it works:** Original premium-cross strategy with ₹220 activation and a continuous 20-point trailing mechanism.
**Why tested:** Baseline premium-management strategy and reference control for subsequent exit variants.
**Why not selected:** No evidence sufficient for promotion; retained as a paper/control observation only.

### V3-5 — 5-point stepped trail
**How it works:** 5-point stepped trailing with a 20-point gap.
**Why tested:** Test whether a less reactive stepped trail improves economics versus V2.
**Why not selected:** No promotion-quality evidence; paper observation only.

### V3-10 — 10-point stepped trail
**How it works:** 10-point stepped trailing with a 20-point gap.
**Why tested:** Test a wider step that may reduce premature exits.
**Why not selected:** No promotion-quality evidence; paper observation only.

### V4 — NIFTY-confirmed entry
**How it works:** NIFTY-confirmed entry, fail-fast below ₹180, V2 exit logic.
**Why tested:** Test whether underlying-index confirmation improves entry quality.
**Why not selected:** No promotion-quality evidence; paper observation only.

### V5 — NIFTY-confirmed + V3-10 exit
**How it works:** NIFTY-confirmed entry, fail-fast below ₹180, V3-10 exit.
**Why tested:** Combine underlying confirmation with the wider stepped exit.
**Why not selected:** No promotion-quality evidence; paper observation only.

### V6 — Fixed conservative 2R
**How it works:** Fixed 2R target using the defined initial-risk structure.
**Why tested:** Clean fixed-risk/fixed-reward control against trailing exits.
**Why not selected:** Poor economics; historical diagnostics did not justify promotion.

### V7 — Causal 15-bar failure exit
**How it works:** V3-10 trailing logic plus a causal 15-bar failure exit.
**Why tested:** Test whether stale/failed premium moves can be cut without lookahead.
**Why not selected:** No promotion-quality evidence; paper observation only.

### V8 — ₹160 floor
**How it works:** V3-10 with initial stop max(₹160, entry-20).
**Why tested:** Test a bounded downside floor.
**Why not selected:** No promotion-quality evidence; paper observation only.

### V9 — ₹170 continuous trail
**How it works:** ₹170 initial stop; continuous 20-point trail activates at ₹210.
**Why tested:** Test whether moving the initial stop from ₹160 toward ₹170 improves economics.
**Why not selected:** Economically rejected in matched 2026 diagnostic; PF remained poor (~0.748).

### V10-5 / V10-10 — ₹170 stepped variants
**How they work:** ₹170 initial stop with V3-5 or V3-10 entry-anchored stepped trailing.
**Why tested:** Determine whether the ₹170 stop combined with stepped trailing improves the family.
**Why not selected:** ₹170 variants did not establish a durable edge; economically rejected.

### V11 — ₹170 fixed 2R
**How it works:** Fixed 2R using the ₹170 initial stop.
**Why tested:** Compare the ₹170 risk base against fixed 2R exits.
**Why not selected:** Economically rejected; poor PF (~0.657 in matched diagnostic).

**Accounting rule:** V2–V11 are counterfactual variants, not independent accounts. Their P&Ls must never be added together.

## Numbered Ideas 1–8

### Idea 1 — Concentration throttle
**How it works:** Retest-15 + BE10 host; trigger at the 90th percentile of strictly profitable corrected dated-lot discovery trades and halve whole lots for the next five sessions.
**Why tested:** Reduce dependence on unusually large winners.
**Status:** Runnable hypothesis, not proven. Must pass the frozen normal/0.5/1.0 execution, trade-count, year/month, bootstrap and concentration gates; additionally its bootstrap lower bound must improve from negative to positive.

### Idea 2 — Trade-frequency cap
**How it works:** Same Retest-15 + BE10 host, with a maximum of six entries in a rolling 20-session window, first-come-first-served.
**Why tested:** Test whether reducing clustering/overtrading improves robustness.
**Status:** Runnable hypothesis, not proven. Same common evidence gates as Idea 1 except the special Idea 1 bootstrap-improvement gate.

### Idea 3 — Multiple-comparisons audit
**How it works:** Correlated strategy variants are evaluated with aligned trade vectors and correlation-preserving max-statistic resampling.
**Why tested:** Determine whether apparent winners survive correction for multiple related tests.
**Status:** METHOD-BLOCKED; no candidate promotion.

### Idea 4 — Two-family confirmation
**How it works:** V2 premium-cross direction must agree with Retest-15; V2-selected contract, causal next-bar entry, ₹160 stop, ₹220 activation, 20-point continuous trail.
**Why tested:** Test whether independent-ish confirmation improves entry quality.
**Status:** Runnable after engine join; not yet proven. Must pass the frozen evidence gates.

### Idea 5 — Open-interest filter
**How it works:** Retest-15 + BE10 with selected contract OI >=1,000 historical lots; no strike substitution.
**Why tested:** Test whether sufficient historical liquidity/participation improves trade quality.
**Status:** Runnable; not yet proven. Must pass the frozen evidence gates.

### Idea 6 — BANKNIFTY transfer
**How it works:** Retest-15 + BE10 applied to BANKNIFTY only, using actual dated contracts and lot sizes; no pooled result.
**Why tested:** Test whether the mechanism transfers beyond NIFTY.
**Status:** Runnable; not yet proven. Must pass the frozen evidence gates.

### Idea 7 — Day-of-week filter
**Status:** SUPERSEDED. Do not run.

### Idea 8 — Expiry-distance filter
**How it works:** Descriptive audit of expiry distance using calendar days and actual market sessions separately, one V2 row per date.
**Why tested:** Determine whether expiry proximity changes outcomes without duplicate-row contamination.
**Status:** DESCRIPTIVE AUDIT FIRST; no candidate frozen from duplicate rows.

## Idea 10A

### Idea 10A — Isolated EMA baseline
**How it works:** Isolated EMA research baseline used to separate the underlying signal from premium-management variants.
**Why tested:** Establish a clean baseline/control for later confirmation and bias research.
**Status:** PAPER + BASELINE. It remains the baseline for Idea 17 and is not itself promoted.

## Ideas 13–16 — CLOSED

### Idea 13 H1 / H2
**How they work:** The H1/H2 variants test the frozen hypothesis defined in their primary research artifacts.
**Why tested:** Test the corresponding H1/H2 hypothesis under discovery, validation and holdout controls.
**Why rejected:** Independently verified holdout artifacts failed the required evidence gates.
**Status:** REJECTED / CLOSED. No further work.

### Idea 14
**How it works:** Directional variant defined by its primary research artifact, evaluated through discovery, validation and holdout.
**Why tested:** Test whether the defined directional condition produced a robust edge.
**Why rejected:** Independently verified discovery/validation/holdout evidence failed the required gates.
**Status:** REJECTED / CLOSED.

### Idea 15 Fixed10
**How it works:** Fixed10 variant using the defined EMA/premium framework and fixed 10-point profit-taking logic.
**Why tested:** Test whether a fixed small profit objective could improve robustness versus trailing exits.
**Why rejected:** 81-trade forensic ledger: original net **+₹1,46,887**; largest winner **₹1,80,809**. Removing that winner leaves **−₹33,922** and **PF 0.935**. This triggers the frozen automatic-fail rule. Bootstrap convention differences were noted but are not decisive.
**Status:** REJECTED / CLOSED. Forensic work complete.

### Idea 15 Width25
**How it works:** Wider-width variant of Idea 15.
**Why tested:** Test whether increasing the fixed-profit width improved robustness.
**Why rejected:** Independently verified 152-trade ledger failed the required robustness/forensic gates.
**Status:** REJECTED / CLOSED.

### Idea 16 — VIX gating
**How it works:** VIX-based gate on the underlying strategy.
**Why tested:** Test whether volatility regime filtering could improve trade quality.
**Why rejected:** Diagnostic confirmed the gating hypothesis did not provide sufficient robust improvement.
**Status:** REJECTED / CLOSED.

## Ideas 17–20

### Idea 17 — Prior completed-day decisive bias

**How it works:** dailyBias is the **prior completed NIFTY trading day's close versus open**. A decisive day is frozen at **>=0.5%**. The trade direction must agree with that prior-day bias. No same-day/current-session lookahead is permitted.

**Why tested:** A retrospective 2026 diagnostic suggested a possible regime filter: Idea10A baseline 156 trades, −₹4,824, PF 0.994; direction-only bias 71 trades, −₹51,661, PF 0.846; decisive >=0.5% bias 37 trades, +₹30,295, PF 1.159. This required a sequential walk-forward and exact concentration/robustness forensic screen.

**Final evidence:** Discovery 2020–2024, Validation 2025, Holdout 2026-01-01 to 2026-09-19. Successful forensic closure run **37712110669**; artifact **idea17-forensic-closure** ID **11526485340**.

**Holdout result:** 37 trades, 13.51% win rate, +₹31,922.42 normal net, PF 1.1689; 0.5-point stress −₹10,998.10 / PF 0.9518; 1-point stress −₹53,918.62 / PF 0.7986. Clustered bootstrap lower 95% bounds were negative.

**Forensic closure:** The largest winner was +₹71,285.25 (13-Apr-2026). Removing it leaves −₹39,362.83 / PF 0.7917. Removing the largest three winners (+₹71,285.25, +₹64,635.28, +₹39,984.93) leaves −₹143,983.05 / PF 0.2382. Both trigger the frozen automatic-reject rule. April 2026 contributed +₹140,697.76 against total holdout net +₹31,922.42, confirming extreme concentration. Discovery also failed the leave-largest test (−₹1,114.76 / PF 0.9989 after removing its +₹182,020.17 winner), while validation was only +₹9,750.23 / PF 1.0364 and failed 0.5-point stress.

**Status:** **REJECTED / CLOSED.** No paper promotion, no live-trading consideration, and no post-result retuning. The next active research thread is Idea 20 exit-side research.

### Idea 18 — Reversal after confirmation

**Why tested:** Diagnose whether late reversals following confirmation could improve the base signal.
**Why rejected:** Diagnostic showed late reversals were about 54.8%, while 3+ favorable-bar cases had only about +0.258% average favorable excursion; no robust promotion case.
**Status:** CLOSED DIAGNOSTIC.

### Idea 19 — Time-of-day
**Why tested:** Determine whether time-of-day segmentation provides a robust edge.
**Finding:** 11:00–13:00 emerged as the discovery leader, but the evidence was diagnostic only and bucket accounting had a boundary artifact that required correction.
**Status:** CLOSED DIAGNOSTIC; no promotion.

### Idea 20 — Exit-side research
**How it works:** Research focuses on whether changing the exit side/exit mechanics can improve the surviving signal rather than creating another entry filter.
**Why tested:** Entry-side filters have repeatedly failed robustness; exit-side behavior remains an open research avenue.
**Status:** ACTIVE RESEARCH; not promoted.

## Other major strategy families already tested

- Retest-15: strong discovery (+₹6,15,899, PF 1.620) but failed untouched validation/stress; rejected.
- Previous-day Break: strong discovery (+₹4,10,004, PF 1.384) but failed validation/stress; rejected.
- Afternoon Compression Breakout: discovery +₹16,980/PF 1.249; 2025 validation −₹3,056/PF 0.946; rejected.
- Quick Flip Scalper: 2020–24 −349.84R/PF 0.935; rejected.
- Opening-range ATM credit spread: 41 trades, +₹6,233/PF 1.245 normal, but failed sample/stress/robustness gates; rejected.
- Weekly 0.08-delta Smart Condor: 255 trades, −₹47,418/PF 0.438; rejected.
- Monthly RSI Iron Condor: zero trades with 26.64% missing; untestable/rejected.
- Intraday Iron Condor: PF ~0.36; rejected.
- Intraday Iron Butterfly: PF ~0.27; rejected.
- Directional defined-credit spread: negative and failed stress/year gates; rejected.
- Morning Tea stock-options proxy: positive 2025 discovery but 2026 validation failed even under low stress; rejected.
- P1 positional NIFTY futures: drawdown/stability/concentration failure; rejected.
- P2 20–45 DTE options: PF 1.115 below 1.20 and negative bootstrap lower bound; rejected.
- P4 futures vs options: descriptive only because underlying candidates failed.
- P5 US-close futures: negative; rejected.
- P6 underlying invalidation vs premium stop: negative robustness/concentration; rejected.
- P3 IV-RV / P7 term structure: data blocked because required point-in-time IV/Greeks/executable multi-leg data were unavailable.

## Evidence hierarchy

1. Primary dated artifacts and source code in this repository.
2. Git commits and workflow run outputs/artifacts.
3. Discovery → Validation → Holdout results.
4. Stress tests at 0.5 and 1.0 adverse execution where defined.
5. 5,000-resample monthly-clustered bootstrap 95% lower bound.
6. Concentration checks: largest winner, largest 3 winners, monthly/yearly contribution.
7. Paper observation is not promotion evidence.

## Important accounting and governance rules

- V2–V11 are counterfactual variants; do not add their P&Ls.
- No strategy is promoted from zero-slippage performance alone.
- High-PF/low-win candidates require concentration, bootstrap and leave-largest checks.
- Frozen automatic rejection applies when net <=0 or PF <=1 after the required leave-largest/leave-largest-3 checks.
- Discovery, validation and holdout must remain separated.
- Live execution is out of scope unless separately authorized and engineered.
