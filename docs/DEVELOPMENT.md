# Development and Deployment

## Toolchain

- Node.js 22.13+
- npm with committed lockfile
- React 19
- Next.js compatibility APIs
- Vinext/Vite
- Cloudflare-compatible worker output
- OpenAI Sites integration
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
| `node --test tests/paper-engine.test.mjs` | Test current paper mechanics |
| `node --test tests/nifty-180-stepped-trail.test.mjs` | Test V3 stepped-trail mechanics |
| `npm run validate:artifact` | Validate an existing build artifact |

## Source responsibilities

- `app/page.tsx` — legacy learning dashboard.
- `app/paper/page.tsx` — paper dashboard route.
- `app/paper-ledger.tsx` — version-aware filters/sorting/outcome table.
- `paper/paper-engine.mjs` — current forward paper mechanics.
- `paper/run-session.mjs` — Groww-backed continuous paper session.
- `paper/run-opening-range-shadow.mjs` — isolated causal post-close opening-range observation.
- `paper/build-ledger.mjs` — accepted historical artifact normalization.
- `research/nifty-180-momentum-trail.mjs` — preserved V2 mechanics.
- `research/nifty-180-stepped-trail.mjs` — V3 stepped mechanics.
- `research/groww-backtest-nifty-180-stepped.mjs` — 5-vs-10 step comparison.
- `research/stepped-result-integrity.mjs` — V3 artifact completeness gate.
- `public/paper/` — ledger/status consumed by the dashboard.

## Implementation rules

- Keep strategy mechanics deterministic and separate from display text.
- Never use incomplete one-minute candles to signal or tighten a stop.
- A stop derived from a completed bar becomes effective only on the next bar.
- Stops never move lower.
- Do not silently redefine V2; new mechanics are V3 or a later named version.
- Keep 5-point and 10-point V3 step comparisons on the same 20-point gap and same entry/cost assumptions.
- Do not add broker execution under paper/dashboard work.
- Reject partial, stale, missing, auth-failed, rate-limited, CI-failed, or integrity-failed artifacts as accepted evidence.
- Update strategy spec, tests, decisions, roadmap/safety where applicable, README, and changelog when mechanics change.

## CI expectations

Every material UI/paper change should run:

```bash
npm run lint
npm test
node --test tests/paper-engine.test.mjs tests/nifty-180-stepped-trail.test.mjs
```

Research changes must also run their workflow-specific tests and integrity gates.

## GitHub workflows

- `CI` validates application and deterministic tests.
- `NIFTY Paper Session` starts around 09:20 IST Monday-Friday and runs one continuous paper session.
- `NIFTY Paper Smoke` manually validates paper mechanics, Groww authentication, and a small historical-data request.
- `Experimental Opening-Range Shadow Paper` records the current session after the frozen 15:15 exit and retries once after transient operational failure; it never sends orders or joins V2–V11 totals.
- The isolated `Research - NIFTY ...` workflows run the four active opportunity studies, suite chain, and comparison.

Completed historical studies, diagnostics, and ledger backfills keep their scripts, tests, accepted outputs, documentation, and Git history, but no longer retain one-time workflow YAML files. Restore a historical workflow from Git only when a declared rerun is required; do not leave completed experiments in the active Actions inventory.

The paper workflow intentionally does not schedule every minute. GitHub Actions is being evaluated only for paper observation, not production live-order execution.

## Secrets

`GROWW_TOTP_TOKEN` and `GROWW_TOTP_SECRET` are stored as GitHub Actions secrets. The paper and smoke workflows use them to create a fresh Groww access token at runtime; `GROWW_ACCESS_TOKEN` remains a temporary fallback during provisioning. The resolved access token is masked and exists only in the workflow environment. Do not commit tokens, TOTP secrets, QR codes, or `.env*` files. No current workflow places broker orders.

## ChatGPT Sites deployment

`.openai/hosting.json` preserves the existing Sites project identity. GitHub `main` being current and CI-green does not itself prove the public `chatgpt.site` build is current; republish and direct verification are separate release steps.

## Paper ledger updates

Forward V3 paper rows record strategy version, entry/peak/exit premium, MFE, trail step/gap, gross-breakeven state, exit reason, gross P/L, charges, and net P/L. Existing V2 rows remain untouched; unavailable historical fields display as `—`.
