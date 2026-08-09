# Wedding Recap App

Web app for turning contractor voice recaps into structured, SEO-ready wedding blog drafts.

## What This Repo Contains

This workspace is a TypeScript monorepo with three packages:

- `apps/web`: React + Vite frontend for one-button recap capture.
- `apps/api`: Express API for session, upload, extraction, draft, and publish flow.
- `packages/contracts`: Shared Zod schemas and contract types used by web and API.

## Product Flow

1. Contractor starts and stops a guided recap capture.
2. Frontend requests a signed upload policy.
3. API starts asynchronous processing for transcript -> recap -> draft.
4. UI polls session state and renders:
   - completed draft + Google Doc link
   - follow-up prompts if required fields are missing
   - partial state when extraction fails twice
5. Editor checklist gates final handoff.

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

- OAuth is the primary Google Docs publishing path. Configure Google OAuth in `.env` before using publish in local beta.
- The pipeline is strict by design: missing required inputs or misconfiguration surfaces explicit error/follow-up states instead of simulated success fallbacks.
- Contracts are the source of truth. Update shared schemas in `packages/contracts/src/index.ts` first when changing payload shapes.
- QA artifacts are written under `.gstack/qa-reports/`.

## Documentation Index

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/API.md](docs/API.md)
- [TODOS.md](TODOS.md)
