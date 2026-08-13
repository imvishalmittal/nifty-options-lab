# Contributing

## Scope

Contributions should strengthen education, deterministic evaluation, data
quality, testing, accessibility, privacy, or safe failure.

Changes that add automatic order placement, option selling, leverage, hidden
threshold changes, or weaker safety gates are outside the current scope.

## Workflow

1. Create a focused branch.
2. Make the smallest coherent change.
3. Update relevant documentation.
4. Run:

   ```bash
   npm run lint
   npm test
   ```

5. Open a pull request explaining the behavioral change and validation.

## Strategy changes

A pull request that changes decision behavior must include:

- the before/after rule;
- rationale;
- deterministic boundary tests;
- effect on historical comparability;
- documentation and changelog updates;
- a separate named variant when evidence is not yet sufficient to replace the
  baseline.

## Safety and privacy

- Never include real broker credentials, API keys, account statements, or
  personal screenshots in commits or fixtures.
- Use synthetic market examples.
- Do not log uploaded image contents or personal trading data.
- Preserve `DATA UNCERTAIN` as the default for unverifiable inputs.
