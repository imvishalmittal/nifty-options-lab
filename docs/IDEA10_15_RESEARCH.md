# Idea 10–15 Research Record

Last updated: 25 September 2026

## Scope

This document records the continuation from the Idea10 dual-chart confirmation diagnostic through Ideas 13–15. It is separate from the original More Ideas queue and does not modify the V2–V11 paper family.

**Live trading authorized:** No  
**Idea15 Fixed10 paper promotion:** No  
**Current state:** Robustness analysis completed; Fixed10 remains on hold

## Idea10A frozen mechanics

- NIFTY 3-minute underlying 9/21 EMA band.
- Selected ATM option also evaluated on 3-minute EMA confirmation.
- Same-direction underlying and option confirmation on the same completed bar.
- Entry at the option confirmation-bar close.
- CE stop = confirmation-bar low; PE stop = confirmation-bar high.
- Stop can trigger only on subsequent option bars.
- Gap through stop fills at the subsequent bar open.
- EOD exit on the first option bar at or after 15:15.
- ₹60,000 model capital.
- Slippage scenarios: 0, 0.5 and 1.0 premium points per leg.
- No stop widening or theta compensation.

### Idea10 diagnostic

2026 holdout through 19 September:
- 156 trades
- normal net -₹4,420
- PF 0.994
- 136 stopouts
- 126/136 stopouts occurred after the underlying had reversed
- 10/136 occurred while the underlying remained intact

This diagnostic is the reason the follow-up research focuses on improving the underlying confirmation rather than widening the option stop.

## Ideas 13–15

| Idea | Frozen change | Result |
|---|---|---|
| 13 H1 | Hold one additional 3-minute underlying bar | Rejected |
| 13 H2 | Hold two additional 3-minute underlying bars | Rejected |
| 14 | Prior completed trading-day O→C bias must agree with break | Rejected |
| 15 Fixed10 | Close must exceed outer 9/21 EMA by ≥10 NIFTY points | **Candidate — hold** |
| 15 Width25 | Close must exceed outer EMA by ≥25% of EMA-band width | Rejected |

## Idea15 Fixed10 full backtest

Frozen rule:

> 9/21 EMA; the completed NIFTY 3-minute close must exceed the outer EMA by at least 10 NIFTY points. All other Idea10A mechanics remain unchanged.

No parameter was selected or changed after viewing the validation/holdout results.

| Period | Trades | Normal net | PF | 0.5 stress net | 0.5 PF | 1.0 stress net | 1.0 PF | DD |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Discovery 2020–2024 | 439 | +₹15,00,650 | 1.549 | +₹11,04,142 | 1.366 | +₹7,07,635 | 1.214 | ₹2,76,087 |
| Validation 2025 | 88 | +₹1,267 | 1.002 | -₹63,326 | 0.897 | -₹1,27,920 | 0.809 | ₹2,52,450 |
| Holdout 2026 YTD | 81 | +₹1,46,887 | 1.280 | +₹88,599 | 1.155 | +₹30,310 | 1.049 | ₹1,83,853 |

Holdout data ends 18 September 2026.

### Interpretation

The complete chain does **not** pass promotion gates. The main failure is the untouched 2025 validation: normal PF is approximately flat and both stress cases are negative. The 2026 holdout is positive and stronger than Idea10A's 2026 holdout, but its 5,000-bootstrap lower bounds remain negative.

Current research status:

**IDEA15_FIXED10 = RESEARCH CANDIDATE — HOLD; NOT PAPER**

It must not be promoted merely because the 2026 holdout is positive.

## Robustness work in progress

The active robustness run is descriptive only. It will measure:

1. Annual P&L/PF/trades/win rate/DD.
2. Monthly P&L/PF and profitable-month percentage.
3. CE versus PE.
4. Up-break versus down-break.
5. Largest trade and top-five trade concentration.
6. Whether 2025 weakness or 2026 recovery is concentrated in a small subset of observations.

These analyses cannot change the frozen 10-point threshold, delete adverse periods, or create a new filter after seeing the result.

## Robustness review — completed

GitHub Actions run `36031321822` completed successfully. Artifact `idea13-15-2026-diagnostic` (artifact `10823008117`) contains the frozen 2026 robustness analysis.

For **IDEA15_FIXED10**:
- 81 trades; 17 winners; 20.99% win rate.
- Normal net **+₹1,46,887**; PF **1.280**; DD **₹1,83,853**.
- 0.5-point stress **+₹88,599**; PF **1.155**.
- 1.0-point stress **+₹30,310**; PF **1.049**.
- Only **4/9 months** were profitable: February–May.
- All 81 trades were **CE / UP-break** trades in this holdout; there were no PE / DOWN trades.
- Largest absolute trade: **₹1,80,809 (15.1%)** of aggregate absolute trade P&L; top five absolute trades: **38.1%**.
- Largest winner: **27.0%** of total winning P&L.
- 5,000-bootstrap lower bounds remained negative: **-₹3,874 normal, -₹4,619 at 0.5-point stress, -₹5,381 at 1.0-point stress**.

Normal monthly P&L was: Jan -₹28,339; Feb +₹33,036; Mar +₹1,11,378; Apr +₹1,41,642; May +₹57,988; Jun -₹69,737; Jul -₹73,031; Aug -₹21,315; Sep -₹4,735.

The robustness review therefore does **not** justify paper promotion. The positive 2026 aggregate is concentrated in a small number of months/trades and entirely in the CE/UP slice. No side filter, month filter, threshold retuning, or other post-result rule has been authorized.

**Current status remains: IDEA15_FIXED10 = RESEARCH CANDIDATE — HOLD; NOT PAPER.**

## Paper separation

Idea10A is separately implemented as an isolated paper/shadow runner. On 24 September 2026 it recorded one CE trade:
- NIFTY 23,300 CE, 29 September expiry
- entry 11:06 at ₹89.20
- exit 11:15 at ₹81.00
- 26 lots / 650 units
- net -₹5,504.43

BASE/V4/V5 had no trade that session. This prospective paper observation does not change the historical Fixed10 decision.

## Promotion sequence

Frozen specification → discovery → untouched validation → holdout → robustness review → separately frozen paper hypothesis → prospective paper observation → separately authorized live engineering.

No live automation is authorized by this research thread.
