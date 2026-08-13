# Development and Deployment

## Toolchain

- Node.js 22.13+
- npm with the committed lockfile
- React 19
- Next.js compatibility APIs
- Vinext/Vite
- Cloudflare-compatible worker output

The verified build scripts expect Linux utilities including `flock`, `curl`,
`sha256sum`, and GNU `timeout`.

## Setup

```bash
git clone https://github.com/imvishalmittal/nifty-options-lab.git
cd nifty-options-lab
npm ci
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run lint` | Run ESLint |
| `npm run build` | Build and validate the worker artifact |
| `npm test` | Build, validate, and test rendered HTML |
| `npm run validate:artifact` | Validate an existing `dist/` artifact |
| `npm run db:generate` | Generate migrations if D1 is introduced |

## Implementation rules

- Keep strategy logic deterministic and independent from explanation text.
- Treat screenshot/AI output as proposed facts, never as a direct trade state.
- Make safety failures explicit.
- Do not silently change frozen thresholds.
- Do not add broker execution under a generic dashboard feature.
- Update `STRATEGY_SPEC.md`, tests, and `CHANGELOG.md` with rule changes.
- Verify mobile behavior because the primary usage context includes a phone.

## Testing expectations

Every material change should run:

```bash
npm run lint
npm test
```

Before automated data or AI integration, add unit coverage for:

- all six decision states;
- exact ADX boundary behavior;
- bullish and bearish DI ties;
- ATM rounding at strike midpoints;
- one-OTM CE and PE selection;
- capital exactly at and just over ₹5,000;
- risk exactly at and just over ₹300;
- invalid stop premiums;
- expiry-day and daily-trade blocks;
- stale and uncertain data.

## GitHub workflow

The CI workflow runs on pushes to `main` and pull requests:

1. install from `package-lock.json`;
2. lint;
3. run the verified production build and rendered test.

## ChatGPT Sites deployment

`.openai/hosting.json` binds this source to the existing Sites project.
Do not replace or remove its project identity when updating the deployed
dashboard.

GitHub Actions validates the source but does not provide five-minute signal
scheduling. GitHub cron jobs can be delayed and should not be used as an
intraday execution trigger.

## Environment and secrets

- Do not commit `.env*` files.
- Future provider or AI keys must be configured as runtime secrets.
- Never expose broker credentials to the client bundle.
- Use read-only market-data credentials where possible.
- Broker integration, if ever considered, requires a separate threat model and
  explicit authorization boundary.
