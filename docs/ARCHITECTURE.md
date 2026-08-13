# Architecture

## Current system

V0.1 is a client-side decision-support dashboard built with React, Next.js
compatibility APIs, Vinext, Vite, and a Cloudflare-compatible worker artifact.

```text
Browser
  ├─ screenshot selection and local preview
  ├─ user-verified normalized facts
  ├─ deterministic strategy rules
  ├─ contract and risk calculations
  └─ decision and explanation
        ↓
Cloudflare-compatible Sites worker
```

There is currently no database, market-data provider, AI call, broker
connection, or server-side journal.

## Trust boundary

V0.1 separates three concerns:

1. **Evidence:** screenshots and values visible to the user.
2. **Facts:** normalized, editable fields confirmed by the user.
3. **Decision:** deterministic rules operating only on those facts.

This boundary is essential. A future vision model may propose facts and attach
confidence, but it must never bypass the verification and safety layers.

## Decision pipeline

```text
Required evidence?
      ↓
Data fresh and correct timeframes?
      ↓
15m bullish or bearish filter?
      ↓
5m pullback?
      ↓
Rejection and breakout confirmation?
      ↓
Resolve nearest-weekly one-OTM contract
      ↓
Capital, stop, loss, frequency, expiry gates
      ↓
READY or blocked
```

State precedence is documented in
[STRATEGY_SPEC.md](STRATEGY_SPEC.md).

## Source structure

- `app/page.tsx`: UI state, input normalization, rule evaluation, option
  resolution, risk calculations, and result rendering.
- `app/globals.css`: responsive desktop/mobile visual system.
- `app/layout.tsx`: page metadata and root document.
- `worker/index.ts`: worker runtime entry.
- `vite.config.ts`: Vinext and Cloudflare build configuration.
- `build/sites-vite-plugin.ts`: ensures a valid Sites artifact.
- `scripts/`: bounded dependency installation, production build, and artifact
  verification.
- `tests/rendered-html.test.mjs`: checks the built worker's HTML response.
- `.openai/hosting.json`: binding to the existing hosted project.

## Target architecture

```text
Market data adapter ─┐
Screenshot analyzer ─┼─> normalized fact schema
Manual verification ─┘            ↓
                           indicator engine
                                  ↓
                           strategy engine
                             ↙          ↘
                    contract resolver   risk engine
                             ↘          ↙
                               decision
                                  ↓
                         journal and dashboard
```

The normalized fact schema is the stable boundary. Automated market data and
screenshot analysis should feed the same strategy engine rather than
reimplementing rules.

## Future persistence

When journaling is added, records should distinguish:

- raw evidence;
- machine-extracted facts and confidence;
- user-confirmed facts;
- engine version and configuration;
- recommendation time;
- hypothetical or actual execution;
- exit and realized result.

Screenshots and personal trading records require explicit retention,
authorization, and deletion policies before durable storage is enabled.

## Deployment

The current production deployment is managed by ChatGPT Sites. GitHub is the
durable public source mirror and CI surface. The hosting manifest must remain
present so future Sites checkpoints retain project identity.
