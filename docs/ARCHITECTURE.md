# Architecture

## Monorepo Layout

- `apps/web`: contractor audio capture, coverage review, explicit delivery, and device-local recap library.
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

- Defines `Transcript`, `Recap`, `WeddingDetails` (intake), `BlogOutput` (the Squarespace paste sheet), upload policy, and session result schemas.
- Defines the studio `TEAM_ROSTER`, shared state enums, and performance budgets.
- Provides helper utilities for object key creation.

## Blog Generation and House Style

The model writes prose and word choices; code builds everything that follows a template.

- `apps/api/src/lib/prompts.ts`: extraction and generation prompts. The generator gets the full transcript, the structured recap, and the intake details.
- `apps/api/src/lib/house-style/config.ts`: the rules as data (keyword suffix, SEO limits, kids note, banned words, city-to-region table, venue spotlight links, tag vocabulary). Edit this file when a rule changes.
- `house-style/facts.ts`: merges intake details with the recording and raises review flags for gaps.
- `house-style/assemble.ts`: builds the title, keyword line, intro credit, credits, slug, categories, SEO title, excerpt, and tags.
- `house-style/lint.ts`: checks headings (sentence case, no split phrases), banned words, repeated keywords, SEO length, body length, the closing line, and quotes that aren't in the recording. A failing draft gets one revision; anything left goes to the doc as a review flag.
- `google-docs.ts`: writes the paste sheet in Squarespace order with real Heading 3, italics, and links.

Golden tests in `house-style/house-style.test.ts` pin the output to published posts and to Amy's corrections on the Elisha & Thomas draft.

## Session State Model

Backend state machine includes:

- `idle`
- `recording`
- `uploading`
- `uploaded`
- `transcribing`
- `extracting`
- `follow_up_required`
- `review_ready`
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
3. `PUT /api/uploads/:uploadToken` receives the captured audio bytes and advances the session to `uploaded`.
4. `POST /api/transcriptions` starts async transcription/extraction processing.
5. Frontend polls `GET /api/sessions/:sessionId` until it reaches `review_ready`, a follow-up state, or an error.
6. Contractor explicitly dispatches a reviewed recap through `POST /api/docs/publish`.
7. Completed flow surfaces draft payload, Google Doc info, and a device-local history entry.

## Reliability and Guardrails

- Signed upload constraints: MIME, size, TTL, and single-use token behavior.
- Extraction retry policy: one automatic retry; if extraction still fails, the session moves to `error` with notes.
- Follow-up prompts generated when required recap fields are missing.
- Idempotency map prevents duplicate pipeline execution per idempotency key.

## Observability

`GET /api/observability/metrics` returns:

- per-stage count, average, and max times
- budget thresholds
- alert flags when thresholds are exceeded

## Current Gaps

- Pipeline requires external providers and fails fast when provider credentials are missing.
- In-memory store and queue are process-local; received audio bytes are retained only for the process lifetime.
- Publish flow requires active Google OAuth connectivity.
