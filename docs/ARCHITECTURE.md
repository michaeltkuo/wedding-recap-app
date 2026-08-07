# Architecture

## Monorepo Layout

- `apps/web`: contractor capture UI and editor checklist gate.
- `apps/api`: stateful pipeline orchestration and API surface.
- `packages/contracts`: shared schemas, validation rules, and utility helpers.

## Runtime Boundaries

Frontend (`apps/web`):

- Manages UI stage transitions and polling.
- Validates local upload MIME constraints before submitting.
- Handles recovery by patching transcript with follow-up answers.

Backend (`apps/api`):

- Enforces contractor token boundary.
- Enforces signed-upload policy contract.
- Orchestrates async pipeline and idempotency behavior.
- Publishes observability metrics and stage timing snapshots.

Contracts (`packages/contracts`):

- Defines `Transcript`, `Recap`, `BlogOutput`, upload policy, and session result schemas.
- Defines shared state enums and performance budgets.
- Provides helper utilities for object key creation and title validation.

## Session State Model

Backend state machine includes:

- `idle`
- `recording`
- `uploading`
- `uploaded`
- `transcribing`
- `extracting`
- `follow_up_required`
- `drafting`
- `publishing`
- `completed`
- `partial`
- `error`

Frontend presents a simplified UX state model:

- `idle`
- `recording`
- `uploading`
- `processing`
- `follow_up_required`
- `completed`
- `partial`
- `error`

## Data Flow

1. `POST /api/sessions` creates a session.
2. `POST /api/uploads/sign-url` creates single-use upload metadata.
3. `POST /api/transcriptions` starts async pipeline processing.
4. Frontend polls `GET /api/sessions/:sessionId`.
5. Optional follow-up flow patches transcript and retries pipeline submission.
6. Completed flow surfaces draft payload and Google Doc info.

## Reliability and Guardrails

- Signed upload constraints: MIME, size, TTL, and single-use token behavior.
- Extraction retry policy: one automatic retry before partial fallback.
- Follow-up prompts generated when required recap fields are missing.
- Idempotency map prevents duplicate pipeline execution per idempotency key.

## Observability

`GET /api/observability/metrics` returns:

- per-stage count, average, and max times
- budget thresholds
- alert flags when thresholds are exceeded

## Current Gaps

- Pipeline provider integrations are simulated rather than wired to production services.
- In-memory store and queue are process-local.
- Publish flow currently returns stub Google Doc metadata.
