# Security Policy

## Supported version

Only the latest commit on `main` is supported during the pre-1.0 phase.

## Reporting

Do not disclose a vulnerability through a public issue if it could expose
credentials, personal trading records, uploaded screenshots, or a route to
unauthorized execution. Report it privately to the repository owner through
GitHub's private vulnerability reporting feature when enabled.

## Sensitive areas

Future work involving any of the following requires a dedicated security
review:

- market-data or OpenAI API keys;
- screenshot upload or durable storage;
- user identity and access control;
- trade journals;
- broker authentication or order APIs;
- webhooks and notifications;
- server-side logging of financial data.

## Credential policy

- no secrets in Git, client code, screenshots, fixtures, or logs;
- use hosting/runtime secret storage;
- use least-privilege, read-only market-data access where possible;
- rotate any credential that is accidentally exposed;
- keep broker execution credentials outside the project unless a separately
  reviewed execution architecture is explicitly approved.
