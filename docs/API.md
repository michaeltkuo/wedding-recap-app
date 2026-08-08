# API Reference

Base URL (local dev): `http://127.0.0.1:8787`

Auth header for protected routes:

- `x-contractor-token: <token>`

Google OAuth routes are available for docs publishing and do not require the contractor token:

- `GET /api/auth/google/status`
- `GET /api/auth/google/start`
- `GET /api/auth/google/callback`
- `POST /api/auth/google/logout`

## Health

### GET /health

Returns:

```json
{ "ok": true }
```

## Sessions

### POST /api/sessions

Creates a new recap session.

Success `201`:

```json
{
  "sessionId": "...",
  "expiresAt": "2026-08-07T00:00:00.000Z",
  "stage": "idle"
}
```

## Upload Signing

### POST /api/uploads/sign-url

Request:

```json
{
  "sessionId": "...",
  "fileName": "recap.webm",
  "mimeType": "audio/webm",
  "sizeBytes": 2048,
  "idempotencyKey": "upload-..."
}
```

Success `201`:

```json
{
  "uploadToken": "...",
  "objectKey": "sessions/.../recap.webm",
  "uploadUrl": "https://storage.local/upload/...",
  "expiresAt": "2026-08-07T00:00:00.000Z",
  "ttlSeconds": 900,
  "singleUse": true
}
```

## Pipeline Start

### POST /api/transcriptions

Starts async processing.

Request:

```json
{
  "sessionId": "...",
  "uploadToken": "...",
  "idempotencyKey": "pipeline-...",
  "transcriptText": "couple: ... venue: ... city: ...",
  "simulate": {
    "extractionMode": "normal",
    "publishMode": "normal"
  }
}
```

Success `202`:

```json
{
  "accepted": true,
  "sessionId": "..."
}
```

## Explicit Extraction

### POST /api/recaps/extract

Request:

```json
{ "sessionId": "..." }
```

Response shape depends on stage:

- success with recap payload
- follow-up-required with prompts
- partial with schema failure follow-up

## Explicit Drafting

### POST /api/recaps/draft

Request:

```json
{ "sessionId": "..." }
```

Success includes `blogOutput`.

## Publish

### POST /api/docs/publish

Request:

```json
{
  "sessionId": "...",
  "publishMode": "normal"
}
```

Success returns Google Doc metadata.

## Google OAuth Status

### GET /api/auth/google/status

Returns whether Google OAuth is configured and whether the app currently has a connected account in memory.

## Session Polling

### GET /api/sessions/:sessionId

Returns full session result payload including:

- stage and progress
- transcript, recap, and blog output (when available)
- follow-up prompts
- googleDoc metadata
- timing metrics

## Observability

### GET /api/observability/metrics

Returns:

- stage aggregate timings
- performance budgets
- alert flags

## Error Conventions

- `400` for validation and request-shape failures.
- `401` for missing/invalid contractor token.
- `404` for missing sessions on polling routes.
