# Development and Deployment

## Toolchain

- Node.js 22.13+
- npm with committed lockfile
- React 19
- Next.js compatibility APIs
- Vinext/Vite
- Cloudflare-compatible worker output
- OpenAI Sites project integration
- GitHub Actions for CI, research, ledger backfill, and paper sessions

## Setup

```bash
git clone https://github.com/imvishalmittal/nifty-options-lab.git
cd nifty-options-lab
npm ci
```

## Core commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start local dashboard |
| `npm run lint` | Run ESLint |
| `npm run build` | Build and validate worker artifact |
| `npm test` | Build, validate, and test rendered HTML |
| `node --test tests/paper-engine.test.mjs` | Test paper strategy mechanics |
| `npm run validate:artifact` | Validate an existing build artifact |

Research workflows run additional strategy-specific tests directly with Node's test runner.

## Current source responsibilities

- `app/page.tsx` — legacy learning dashboard.
- `app/paper/page.tsx` — paper dashboard route.
- `app/paper-ledger.tsx` — filters/sorting/table presentation.
- `paper/paper-engine.mjs` — deterministic forward paper mechanics.
- `paper/run-session.mjs` — Groww-backed continuous paper session.
- `paper/build-ledger.mjs` — validated artifact normalization.
- `research/` — historical strategy and robustness tooling.
- `public/paper/` — ledger/status files consumed by the dashboard.

## Implementation rules

- Keep strategy mechanics deterministic and separate from display text.
- Never use an incomplete one-minute candle to create a signal or tighten a stop.
- A trailing stop derived from a completed bar becomes effective only on the next bar.
- Do not silently change frozen paper thresholds.
- Treat a different rule as a separately named strategy version/hypothesis.
- Do not add broker execution under a generic paper/dashboard feature.
- Reject partial, stale, missing, authentication-failed, rate-limited, CI-failed, or integrity-failed artifacts as accepted evidence.
- Update `STRATEGY_SPEC.md`, tests, `DECISIONS.md`, and `CHANGELOG.md` when mechanics change.

## CI expectations

Every material UI/paper change should run at least:

```bash
npm run lint
npm test
node --test tests/paper-engine.test.mjs
```

Strategy research changes should also run the relevant V1/V2 runner and integrity tests.

## GitHub workflows

The repository currently uses GitHub Actions for:

- CI;
- 2025/2026 NIFTY ₹180 historical research;
- negative-control research;
- validated artifact backfill;
- one continuous weekday paper session.

The paper session intentionally does **not** schedule a job every minute. A single job begins around 09:20 IST and polls market data throughout the session. This is acceptable for paper observation, not an endorsement of GitHub Actions for production live-order execution.

Groww-heavy jobs share a serialized concurrency group and request spacing to reduce provider throttling/rate-limit failures.

## Secrets

- `GROWW_ACCESS_TOKEN` is stored as a GitHub Actions secret and must never be committed.
- Do not commit `.env*` files.
- Prefer read-only market-data credentials.
- No broker order credentials are required or permitted by the current paper workflow.

## ChatGPT Sites deployment

`.openai/hosting.json` binds the repository to the existing Sites project. Preserve that identity.

Important release distinction:

```text
GitHub main updated + CI green
        ≠
public chatgpt.site build automatically updated
```

The public Sites project may need an explicit republish after source changes. Verify the public route after deployment rather than assuming it from repository state.

## Paper ledger updates

Historical backfill writes normalized validated rows into `public/paper/trades.json`. Forward paper sessions append completed `PAPER` rows while preserving existing validated `BACKTEST` rows. Avoid manual edits to trade outcomes except to repair a demonstrable data/serialization bug with an auditable commit.
