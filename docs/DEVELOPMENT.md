# Development Guide

## Commands

Install dependencies:

```bash
npm install
```

Run both services:

```bash
npm run dev
```

Run only API:

```bash
npm run dev:api
```

Run only web:

```bash
npm run dev:web
```

Build all packages:

```bash
npm run build
```

Typecheck all packages:

```bash
npm run typecheck
```

Run all tests:

```bash
npm run test
```

Run E2E tests:

```bash
npm run test:e2e
```

## Package-Specific Commands

Contracts package:

```bash
npm --workspace @wedding/contracts run build
npm --workspace @wedding/contracts run test
```

API package:

```bash
npm --workspace @wedding/api run build
npm --workspace @wedding/api run test
```

Google Docs publishing requires OAuth configuration in local beta:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI` (defaults to `http://localhost:8787/api/auth/google/callback`)
- `GOOGLE_DOC_FOLDER_ID` (optional)
- `WEB_ORIGIN` (defaults to `http://127.0.0.1:4173`)

## Local OAuth Runbook

This repo uses Google OAuth in local beta. The most common failure is `redirect_uri_mismatch`, which occurs when the URL registered in Google Cloud does not exactly match the callback URL the app generates.

### Use one canonical localhost host

Pick one and use it everywhere for the local stack:

- Option A: `http://localhost:8787`
- Option B: `http://127.0.0.1:8787`

Do not mix them across the app, browser, and Google Console. Google treats `localhost` and `127.0.0.1` as different origins.

### Recommended local env values

For a localhost-only setup, set the following explicitly in `.env`:

```bash
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8787/api/auth/google/callback
WEB_ORIGIN=http://127.0.0.1:4173
VITE_API_BASE_URL=http://127.0.0.1:8787
```

If you prefer loopback-only values instead, use this version instead:

```bash
GOOGLE_OAUTH_REDIRECT_URI=http://127.0.0.1:8787/api/auth/google/callback
WEB_ORIGIN=http://127.0.0.1:4173
VITE_API_BASE_URL=http://127.0.0.1:8787
```

### Register the exact URI in Google Cloud

1. Open Google Cloud Console.
2. Go to APIs & Services → Credentials.
3. Open the OAuth 2.0 Client ID.
4. In Authorized redirect URIs, add the exact value from `GOOGLE_OAUTH_REDIRECT_URI`.
5. Save the change.
6. Restart the local API process after changing env values.

### Reproduce and validate locally

```bash
npm run dev
```

Then open the app at `http://127.0.0.1:4173` and click `Connect Google`.

If it still fails:

1. Check the browser URL after clicking Connect Google.
2. Confirm the redirect URI in the Google error matches your exact `GOOGLE_OAUTH_REDIRECT_URI` value.
3. Make sure the browser is not already using a stale session or stale OAuth cookie.
4. Clear cookies for `localhost` or `127.0.0.1` and retry.
5. Verify the runtime process actually sees the env value:

```bash
PID=$(lsof -iTCP:8787 -sTCP:LISTEN -n -P 2>/dev/null | awk 'NR==2{print $2}')
ps eww -p "$PID" | tr ' ' '\n' | grep '^GOOGLE_OAUTH_REDIRECT_URI=' || echo 'GOOGLE_OAUTH_REDIRECT_URI=NOT_SET_IN_PROCESS_ENV'
```

### Failure signatures to watch for

- `redirect_uri_mismatch` → redirect URI in Google Cloud does not match the generated callback URL.
- `state did not match` → browser cookie/state expired or the OAuth initiation/callback flow was interrupted.
- Missing auth code → callback came back without a valid Google authorization code.

Pipeline behavior note:

- This repo no longer treats missing integrations as successful fallbacks.
- If OAuth is not configured or publish/transcription inputs are invalid, the session transitions to explicit `error`, `partial`, or `follow_up_required` states.

Web package:

```bash
npm --workspace @wedding/web run build
npm --workspace @wedding/web run test
```

## Test Strategy

- Unit tests for schema and utility behavior.
- Integration tests for API route contracts and pipeline state transitions.
- E2E tests for contractor happy path and recovery flow.

## Local QA Artifacts

Manual and automated QA outputs are saved under:

- `.gstack/qa-reports/`

## Contribution Notes

- Make contract changes in `packages/contracts` first.
- Keep API and web behavior aligned with shared schema updates.
- Prefer minimal, test-backed changes for pipeline logic.
