# Changelog

All notable changes will be documented here.

## [0.1.0] - 2026-08-13

### Added

- responsive NIFTY options learning dashboard;
- 15-minute, 5-minute, and optional option-chain image upload/preview;
- user-verifiable chart facts;
- deterministic data-uncertain, no-trade, wait, CALL-ready, and PUT-ready
  states;
- one-OTM strike and one-lot capital calculations;
- ₹5,000 affordability and ₹300 intended-risk gates;
- option stop, 2R exit, and tracked 3R calculations;
- expiry-day and one-trade-per-day blocks;
- guided sample mode;
- verified Cloudflare-compatible production artifact;
- project documentation and GitHub Actions CI.

### Limitations

- no automated screenshot extraction;
- no live market-data feed;
- no persistent journal;
- no broker connection or automatic execution;
- lot size and strike interval are currently static configuration in the UI
  logic and require exchange verification.
