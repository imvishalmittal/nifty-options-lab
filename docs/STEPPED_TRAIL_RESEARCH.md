# Stepped trailing-stop research

## Hypothesis

The prior Momentum V2 paper rule kept the initial ₹160 stop unchanged until the option premium reached ₹220. That can allow a materially favorable move to reverse into a full initial-stop loss.

This research path tests a stepped trailing stop while preserving the same contract selection and entry signal.

## Frozen comparison

- reference premium: ₹180;
- executable entry: next 1-minute bar open, strictly above ₹160 and below ₹220;
- initial stop: ₹160;
- trailing gap: 20 premium points;
- step variants: 5 points and 10 points;
- candidate forward-paper step: 10 points;
- stop changes use completed 1-minute highs only;
- a stop calculated from a bar becomes effective from the next bar;
- stop never moves downward;
- no overnight position; session fallback through 15:29;
- ₹60,000 model capital;
- costs remain included in net P/L.

For an actual entry of ₹184.15 with the 10-point step variant:

| Completed favorable move | Stepped reference peak | New stop |
| ---: | ---: | ---: |
| < ₹10 | — | ₹160.00 |
| ₹10 | ₹194.15 | ₹174.15 |
| ₹20 | ₹204.15 | ₹184.15 |
| ₹30 | ₹214.15 | ₹194.15 |
| ₹40 | ₹224.15 | ₹204.15 |

The ₹20 favorable move therefore reaches **gross** breakeven. Net P/L at an entry-price stop can still be modestly negative after brokerage, taxes, exchange charges, and slippage.

## Research discipline

The existing V2 engine and historical V2 artifacts remain unchanged. The 5-point and 10-point stepped variants are a new hypothesis and are evaluated separately so historical results remain reproducible.
