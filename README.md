# NIFTY Options Lab

A conservative, mobile-friendly learning dashboard for evaluating one specific
intraday NIFTY options setup.

**Live dashboard:** [nifty-options-lab.imvishalmittal.chatgpt.site](https://nifty-options-lab.imvishalmittal.chatgpt.site)

> This project is for education, paper trading, and decision support. It does
> not provide investment advice, guarantee outcomes, connect to a broker, or
> place orders.

## What it does

The dashboard turns user-verified chart facts into a deterministic decision:

```text
15-minute trend facts
        +
5-minute entry facts
        +
weekly option and risk facts
        ↓
fixed rules and safety gates
        ↓
DATA UNCERTAIN / NO TRADE / WAIT / CALL READY / PUT READY
```

Current capabilities:

- upload and preview 15-minute and 5-minute NIFTY screenshots;
- optionally upload an option-chain screenshot;
- review or edit the facts visible in those screenshots;
- apply EMA22, ADX(14), and directional-indicator rules;
- distinguish no-trade, pullback-waiting, confirmation-waiting, and ready states;
- resolve the nearest 50-point ATM strike and exactly one OTM strike;
- calculate one-lot capital, stop risk, 2R target, and tracked 3R level;
- block trades that exceed ₹5,000 capital or ₹300 intended risk;
- block expiry-day trades and a second trade on the same day;
- load a guided sample for learning and regression checks.

## Frozen V0.1 strategy

| Parameter | Rule |
| --- | --- |
| Underlying | NIFTY only |
| Direction | Buy CE or PE only; never sell options |
| Expiry | Nearest weekly expiry |
| Strike | Exactly one strike OTM |
| Position | One lot |
| Learning capital | ₹5,000 |
| Intended maximum loss | ₹300 per trade |
| Trend timeframe | 15 minutes |
| Entry timeframe | 5 minutes |
| Bullish filter | Price above rising EMA22, ADX > 20, +DI > -DI |
| Bearish filter | Price below falling EMA22, ADX > 20, -DI > +DI |
| Setup | Pullback toward 5-minute EMA22 |
| Trigger | Rejection followed by breakout confirmation |
| Exit | 2R; record whether 3R was subsequently reached |
| Daily frequency | Maximum one learning trade |
| Exclusions | No expiry day, averaging, overnight holding, or automatic execution |

The full, testable definition is in
[docs/STRATEGY_SPEC.md](docs/STRATEGY_SPEC.md).

## Important current limitation

Screenshot files are previewed locally in the browser, but **V0.1 does not yet
extract chart values with AI**. The user must verify or enter the displayed
facts before running the rules engine. This is intentional: the deterministic
engine should never convert an uncertain image interpretation directly into a
trade-ready result.

The currently configured lot size is `65` and the strike interval is `50`.
Both are exchange-controlled values and must be verified against current NSE
contract specifications before any live use.

## Decision states

| State | Meaning |
| --- | --- |
| `DATA UNCERTAIN` | Required chart evidence, timeframe, or freshness is not verified |
| `NO TRADE` | Trend rules fail or a safety gate blocks the setup |
| `WAIT FOR PULLBACK` | The 15-minute direction is valid, but the 5-minute pullback is absent |
| `WAIT FOR CONFIRMATION` | The pullback exists, but rejection/breakout confirmation is incomplete |
| `CALL READY` | Every bullish rule and safety gate passes |
| `PUT READY` | Every bearish rule and safety gate passes |

`READY` means eligible for a **paper learning trade**, not a prediction that
the trade will be profitable.

## Local development

### Prerequisites

- Node.js 22.13 or newer
- npm
- Linux tooling used by the verified build scripts: `flock`, `curl`,
  `sha256sum`, and GNU `timeout`

### Run

```bash
npm ci
npm run dev
```

### Validate

```bash
npm run lint
npm test
```

`npm test` creates and validates the production worker artifact, then checks
the rendered HTML contract.

## Repository map

```text
app/
  page.tsx              Dashboard state, calculations, and UI
  globals.css           Responsive design
  layout.tsx            Metadata and root layout
worker/
  index.ts              Cloudflare worker entry point
build/
  sites-vite-plugin.ts  Hosting artifact integration
scripts/                Reproducible install/build validation
tests/                  Rendered artifact test
docs/                   Strategy, architecture, safety, roadmap, and operations
.github/workflows/      GitHub Actions CI
.openai/hosting.json    Existing ChatGPT Sites project identity
```

## Documentation

- [Strategy specification](docs/STRATEGY_SPEC.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Safety and limitations](docs/SAFETY_AND_LIMITATIONS.md)
- [Development and deployment](docs/DEVELOPMENT.md)
- [Roadmap](docs/ROADMAP.md)
- [Architecture decisions](docs/DECISIONS.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

## Project boundaries

This repository is intentionally separate from `global-trading-lab`. That
system covers broader India/US research and automated observation. NIFTY
Options Lab has a narrower intraday learning workflow, screenshot inputs,
stricter safety requirements, and a different future path for market-data and
broker integrations.

## License

No open-source license has been granted yet. Copyright remains with the
repository owner.
