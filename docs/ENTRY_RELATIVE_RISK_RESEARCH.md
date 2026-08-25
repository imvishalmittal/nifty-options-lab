# Entry-relative NIFTY risk research

This isolated discovery track tests the invariant identified during the 2026-08-25 paper session:

- ₹180 remains the contract-selection and completed-candle signal reference.
- The executable next-bar entry determines risk and reward.
- Initial stop is `entry - 20` premium points.
- Fixed 2R target and continuous-trail activation are `entry + 40` premium points.
- The existing `160 < entry < 220` eligibility band remains frozen so this test changes risk geometry rather than contract selection.

Four predeclared exits are compared on the same trades: fixed 2R, continuous 20-point trail after +40, and 5/10-point stepped trails with a 20-point gap. The discovery sample is 2020-01-01 through 2024-12-31. The untouched 2025 validation and 2026 holdout are opened only if a variant passes every frozen gate, including one-point-per-leg slippage stress and clustered-bootstrap robustness.

This workflow cannot promote a variant to paper trading automatically. Existing V2-V8 paper definitions and journals remain unchanged until a separately reviewed promotion decision.
