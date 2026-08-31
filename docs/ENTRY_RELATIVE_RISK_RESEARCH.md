# Entry-relative NIFTY risk research

This isolated discovery track tests the invariant identified during the 2026-08-25 paper session:

- ₹180 remains the contract-selection and completed-candle signal reference.
- The executable next-bar entry determines risk and reward.
- Initial stop is `entry - 20` premium points.
- Fixed 2R target and continuous-trail activation are `entry + 40` premium points.
- The existing `160 < entry < 220` eligibility band remains frozen so this test changes risk geometry rather than contract selection.

Five predeclared exits are compared. The first four use the same trades: fixed 2R, continuous 20-point trail after +40, and 5/10-point stepped trails with a 20-point gap. The fifth is the separately requested fixed-level comparator:

- signal and next-bar execution remain unchanged;
- stop is exactly ₹170;
- target is exactly ₹210;
- because those levels are meaningful only around the ₹180 reference, it is eligible only when `₹170 < entry < ₹210`;
- same-minute stop/target ambiguity is scored stop first;
- unresolved positions exit at the normal intraday session fallback.

The ₹170/₹210 labels describe a 10-point reference risk and 30-point reference reward around ₹180. Actual entry slippage means an individual executable trade need not realize exactly 1:3.

The discovery sample is 2020-01-01 through 2024-12-31. The untouched 2025 validation and 2026 holdout are opened only if a variant passes every frozen gate, including one-point-per-leg slippage stress and clustered-bootstrap robustness.

This workflow cannot promote a variant to paper trading automatically. Existing V2-V8 paper definitions and journals remain unchanged until a separately reviewed promotion decision.

Provider fragments sharing one one-minute timestamp are merged into one completed OHLC candle before signal detection and next-bar execution, matching the existing opportunity-research normalization rule.
