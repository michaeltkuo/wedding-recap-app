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
- `GOOGLE_OAUTH_REDIRECT_URI` (defaults to `http://127.0.0.1:8787/api/auth/google/callback`)
- `GOOGLE_DOC_FOLDER_ID` (optional)
- `WEB_ORIGIN` (defaults to `http://127.0.0.1:4173`)

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
