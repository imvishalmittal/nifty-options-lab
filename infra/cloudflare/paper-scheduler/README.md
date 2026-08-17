# Cloudflare paper scheduler

This Worker is the primary scheduler for the weekday NIFTY paper session. GitHub's native cron remains enabled as a secondary fallback.

## Timing

The Worker wakes every five minutes on weekdays and dispatches the paper workflow at:

- 08:55 IST — primary attempt
- 09:10 IST — retry attempt

The GitHub workflow keeps a native 09:00 IST fallback. All three paths share the same workflow-level terminal-session guard, so a completed `CLOSED`, `NO_TRADE`, or `AMBIGUOUS` session suppresses later queued attempts. Data/infrastructure failures remain retryable.

`paper/run-session.mjs` still waits internally until 09:27 before it begins the exact-clock market logic. The scheduler therefore changes reliability only; it does not change the frozen trading rule.

## Security

Create a fine-grained GitHub personal access token with:

1. Resource owner: `imvishalmittal`
2. Repository access: only `nifty-options-lab`
3. Repository permission: **Actions — Read and write**
4. Finite expiration and a rotation reminder

Store it only as an encrypted Cloudflare secret named `GITHUB_TOKEN`. Never commit the token.

## Deploy

From this directory:

```bash
npx wrangler login
npx wrangler secret put GITHUB_TOKEN
npx wrangler deploy
```

The configured Worker cron is `*/5 * * * MON-FRI`.

From the Cloudflare dashboard, the equivalent setup is:

1. Create a Worker named `nifty-options-lab-paper-scheduler`.
2. Deploy `src/index.mjs`.
3. Add encrypted secret `GITHUB_TOKEN`.
4. Add cron trigger `*/5 * * * MON-FRI`.
5. Enable Worker observability/logs.

## Validation

Repository CI runs:

```bash
node --test tests/cloudflare-paper-scheduler.test.mjs tests/paper-session-guard.test.mjs
```

After deployment, confirm the next primary attempt appears in GitHub Actions as a `workflow_dispatch` run and that later retry/fallback runs are skipped after a terminal paper-session record exists.
