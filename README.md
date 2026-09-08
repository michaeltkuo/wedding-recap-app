# Wedding Recap App

Web app for turning contractor voice recaps into structured, SEO-ready wedding blog drafts.

## What This Repo Contains

This workspace is a TypeScript monorepo with three packages:

- `apps/web`: React + Vite frontend for one-button recap capture.
- `apps/api`: Express API for session, upload, extraction, draft, and publish flow.
- `packages/contracts`: Shared Zod schemas and contract types used by web and API.

## Product Flow

1. Contractor records a field recap in the browser or imports a supported audio file.
2. Frontend requests a signed upload policy and PUTs the captured audio bytes to the scoped upload URL.
3. API asynchronously transcribes and extracts coverage, then pauses at review readiness.
4. Contractor reviews the coverage map, supplies required follow-up details when needed, and explicitly sends the recap.
5. API generates the working draft and delivers the Google Doc; the app keeps a device-local recap library.

## Quick Start

Prerequisites:

- Node.js 20+
- npm 10+

Install dependencies:

```bash
npm install
```

Run web + API together:

```bash
npm run dev
```

- Web: `http://127.0.0.1:4173`
- API: `http://127.0.0.1:8787`

## Build and Test

Build all packages:

```bash
npm run build
```

Run unit/integration tests:

```bash
npm run test
```

Run browser E2E tests:

```bash
npm run test:e2e
```

## Key Endpoints

- `POST /api/sessions`
- `POST /api/uploads/sign-url`
- `POST /api/transcriptions`
- `POST /api/recaps/extract`
- `POST /api/recaps/draft`
- `POST /api/docs/publish`
- `GET /api/sessions/:sessionId`
- `GET /api/observability/metrics`

See [docs/API.md](docs/API.md) for request and response details.

## Important Notes

- This repo does not use fallback publish behavior. Google Docs delivery fails unless Google OAuth is connected.
- Audio transcription and recap extraction are provider-backed and require `OPENAI_API_KEY`.
- Contracts are the source of truth. Update shared schemas in `packages/contracts/src/index.ts` first when changing payload shapes.
- QA artifacts are written under `.gstack/qa-reports/`.

## Documentation Index

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/API.md](docs/API.md)
- [TODOS.md](TODOS.md)
