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
  "uploadUrl": "http://127.0.0.1:8787/api/uploads/...",
  "expiresAt": "2026-08-07T00:00:00.000Z",
  "ttlSeconds": 900,
  "singleUse": true
}
```

### PUT /api/uploads/:uploadToken

Uploads the raw audio bytes associated with a signed upload. Send the contractor
token and a matching `Content-Type` header. The byte length and MIME type must
match the signed policy.

Success `201`:

```json
{
  "accepted": true,
  "sessionId": "..."
}
```

## Pipeline Start

### POST /api/transcriptions

Starts async transcription and recap extraction after audio has been received.
Successful extraction stops at `review_ready`; it does not create or deliver a
draft until the contractor explicitly sends the recap.

Request:

```json
{
  "sessionId": "...",
  "uploadToken": "...",
  "idempotencyKey": "pipeline-...",
  "transcriptText": "couple: ... venue: ... city: ...",
  "details": {
    "partnerOne": "Elisha",
    "partnerTwo": "Thomas",
    "ceremonyVenue": { "name": "St. Augustine Catholic Church & Student Center", "kind": "house_of_worship" },
    "receptionVenue": { "name": "Thomas Center" },
    "city": "Gainesville",
    "state": "FL",
    "team": [{ "memberId": "michael-kuo", "role": "photo" }, { "memberId": "austin-taft", "role": "video" }],
    "childrenFeatured": false,
    "vendors": [{ "role": "Florals", "name": "Wendy Anne", "url": "https://wendyanne.com/" }],
    "coupleStory": { "howTheyMet": "...", "whyThisVenue": "...", "funFacts": [], "quotes": [] }
  },
  "simulate": {
    "extractionMode": "normal",
    "publishMode": "normal"
  }
}
```

`details` is optional and every field in it is optional. It is stored on the session and drives the
templated blog fields (title, intro credit, credits, categories, slug). Anything missing becomes a
review flag at the top of the Google Doc instead of a failure.

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

The session must be at `review_ready` (or have a previously generated draft).
The endpoint builds the draft when necessary, then publishes it and marks the
session as `completed`.

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

Successful processing reaches `review_ready` before the explicit publish call.

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
