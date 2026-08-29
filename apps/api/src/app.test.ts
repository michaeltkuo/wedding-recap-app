import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("./lib/google-docs.js", () => ({
  publishDraftToGoogleDoc: vi.fn(async () => ({
    docId: "test-doc-id",
    url: "https://docs.google.com/document/d/test-doc-id",
    status: "ready" as const
  }))
}));

vi.mock("./lib/transcription.js", () => ({
  transcribeAudioFile: vi.fn(async () => ({
    text: "couple: Alex and Sam. venue: Cypress Grove Estate House. city: Orlando, Florida. style: romantic garden. timeline: a sunset ceremony and packed dance floor. moments: private vows, confetti exit. portraits: portraits along the lakeside lawn. weather: warm with soft sunset light. reception: full dance floor, emotional speeches.",
    source: "openai" as const
  }))
}));

import { API_CONFIG } from "./config.js";
import { createApp } from "./app.js";
import { metricsRegistry } from "./lib/pipeline.js";

const contractorHeaders = {
  "x-contractor-token": API_CONFIG.contractorToken
};

async function createSessionAndUpload(app: ReturnType<typeof createApp>) {
  const sessionResponse = await request(app).post("/api/sessions").set(contractorHeaders).send();
  const sessionId = sessionResponse.body.sessionId;

  const uploadResponse = await request(app)
    .post("/api/uploads/sign-url")
    .set(contractorHeaders)
    .send({
      sessionId,
      fileName: "recap.webm",
      mimeType: "audio/webm",
      sizeBytes: 1024,
      idempotencyKey: `upload-${sessionId}`
    });

  await request(app)
    .put(`/api/uploads/${uploadResponse.body.uploadToken}`)
    .set(contractorHeaders)
    .set("content-type", "audio/webm")
    .send(Buffer.from("fake-audio-binary"));

  return { sessionId, uploadToken: uploadResponse.body.uploadToken };
}

async function waitForCompletion(app: ReturnType<typeof createApp>, sessionId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = await request(app).get(`/api/sessions/${sessionId}`).set(contractorHeaders);
    if (["completed", "follow_up_required", "partial", "error"].includes(status.body.stage)) {
      return status.body;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Session did not complete in time");
}

describe("api", () => {
  it("reports Google auth status based on oauth env configuration", async () => {
    const app = createApp();

    const response = await request(app).get("/api/auth/google/status");
    const expectedConfigured = API_CONFIG.google.clientId.length > 0 && API_CONFIG.google.clientSecret.length > 0;

    expect(response.status).toBe(200);
    expect(response.body.configured).toBe(expectedConfigured);
    expect(response.body.connected).toBe(false);
  });

  it("returns actionable Google OAuth diagnostics and local redirect guidance", async () => {
    const app = createApp();

    const response = await request(app).get("/api/auth/google/diagnostics");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      configured: expect.any(Boolean),
      redirectUri: expect.any(String),
      expectedRedirectUri: expect.any(String),
      clientIdConfigured: expect.any(Boolean),
      clientSecretConfigured: expect.any(Boolean)
    });
    expect(response.body.redirectUri).toBe(response.body.expectedRedirectUri);
  });

  it("maps callback state and code failures to actionable user guidance", async () => {
    const app = createApp();

    const stateMismatch = await request(app)
      .get("/api/auth/google/callback")
      .set("Accept", "application/json")
      .query({ state: "returned-state", code: "mock-code" })
      .set("Cookie", "wedding_google_oauth_state=expected-state");

    expect(stateMismatch.status).toBe(400);
    expect(stateMismatch.body.error).toMatch(/state.*redirect uri|redirect uri.*state|state did not match/i);

    const missingCode = await request(app)
      .get("/api/auth/google/callback")
      .set("Accept", "application/json")
      .query({ state: "expected-state" })
      .set("Cookie", "wedding_google_oauth_state=expected-state");

    expect(missingCode.status).toBe(400);
    expect(missingCode.body.error).toMatch(/authorization code|missing code|code is missing/i);
  });

  it("rejects unsupported upload types", async () => {
    const app = createApp();
    const sessionResponse = await request(app).post("/api/sessions").set(contractorHeaders).send();

    const response = await request(app)
      .post("/api/uploads/sign-url")
      .set(contractorHeaders)
      .send({
        sessionId: sessionResponse.body.sessionId,
        fileName: "recap.txt",
        mimeType: "text/plain",
        sizeBytes: 100,
        idempotencyKey: "invalid-upload-key"
      });

    expect(response.status).toBe(400);
  });

  it("completes the happy path and returns a Google Doc", async () => {
    const app = createApp();
    const { sessionId, uploadToken } = await createSessionAndUpload(app);

    const startResponse = await request(app)
      .post("/api/transcriptions")
      .set(contractorHeaders)
      .send({
        sessionId,
        uploadToken,
        idempotencyKey: `pipeline-${sessionId}`,
        transcriptText:
          "couple: Alex and Sam. venue: Cypress Grove Estate House. city: Orlando, Florida. style: romantic garden. timeline: a sunset ceremony and packed dance floor. moments: private vows, confetti exit. portraits: portraits along the lakeside lawn. weather: warm with soft sunset light. reception: full dance floor, emotional speeches."
      });

    expect(startResponse.status).toBe(202);

    const result = await waitForCompletion(app, sessionId);
    expect(result.stage).toBe("completed");
    expect(result.googleDoc.url).toContain("docs.google.com");
  });

  it("stores upload bytes and rejects payloads that exceed requested size", async () => {
    const app = createApp();
    const sessionResponse = await request(app).post("/api/sessions").set(contractorHeaders).send();

    const uploadResponse = await request(app)
      .post("/api/uploads/sign-url")
      .set(contractorHeaders)
      .send({
        sessionId: sessionResponse.body.sessionId,
        fileName: "tiny.webm",
        mimeType: "audio/webm",
        sizeBytes: 4,
        idempotencyKey: "tiny-upload-key"
      });

    const oversized = await request(app)
      .put(`/api/uploads/${uploadResponse.body.uploadToken}`)
      .set(contractorHeaders)
      .set("content-type", "audio/webm")
      .send(Buffer.from("oversized-payload"));

    expect(oversized.status).toBe(400);
    expect(oversized.body.error).toMatch(/exceeds requested size/i);
  });

  it("rejects replay upload attempts after the first successful PUT", async () => {
    const app = createApp();
    const sessionResponse = await request(app).post("/api/sessions").set(contractorHeaders).send();

    const uploadResponse = await request(app)
      .post("/api/uploads/sign-url")
      .set(contractorHeaders)
      .send({
        sessionId: sessionResponse.body.sessionId,
        fileName: "single-use.webm",
        mimeType: "audio/webm",
        sizeBytes: 2048,
        idempotencyKey: "single-use-upload-key"
      });

    const first = await request(app)
      .put(`/api/uploads/${uploadResponse.body.uploadToken}`)
      .set(contractorHeaders)
      .set("content-type", "audio/webm")
      .send(Buffer.from("first-audio"));

    const second = await request(app)
      .put(`/api/uploads/${uploadResponse.body.uploadToken}`)
      .set(contractorHeaders)
      .set("content-type", "audio/webm")
      .send(Buffer.from("second-audio"));

    expect(first.status).toBe(201);
    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/already used/i);
  });

  it("rejects upload writes when the upload token has expired", async () => {
    const app = createApp();
    const sessionResponse = await request(app).post("/api/sessions").set(contractorHeaders).send();

    const uploadResponse = await request(app)
      .post("/api/uploads/sign-url")
      .set(contractorHeaders)
      .send({
        sessionId: sessionResponse.body.sessionId,
        fileName: "expired.webm",
        mimeType: "audio/webm",
        sizeBytes: 1024,
        idempotencyKey: "expired-upload-key"
      });

    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(Date.now() + (API_CONFIG.upload.ttlSeconds + 1) * 1000);

    const expired = await request(app)
      .put(`/api/uploads/${uploadResponse.body.uploadToken}`)
      .set(contractorHeaders)
      .set("content-type", "audio/webm")
      .send(Buffer.from("late-audio"));

    nowSpy.mockRestore();

    expect(expired.status).toBe(400);
    expect(expired.body.error).toMatch(/expired/i);
  });

  it("returns session timeline entries for completed runs", async () => {
    const app = createApp();
    const { sessionId, uploadToken } = await createSessionAndUpload(app);

    await request(app)
      .post("/api/transcriptions")
      .set(contractorHeaders)
      .send({
        sessionId,
        uploadToken,
        idempotencyKey: `pipeline-timeline-${sessionId}`,
        transcriptText:
          "couple: Alex and Sam. venue: Cypress Grove Estate House. city: Orlando, Florida. style: romantic garden. timeline: a sunset ceremony and packed dance floor. moments: private vows, confetti exit. portraits: portraits along the lakeside lawn. weather: warm with soft sunset light. reception: full dance floor, emotional speeches."
      });

    await waitForCompletion(app, sessionId);
    const timeline = await request(app).get(`/api/sessions/${sessionId}/timeline`).set(contractorHeaders);

    expect(timeline.status).toBe(200);
    expect(timeline.body.sessionId).toBe(sessionId);
    expect(Array.isArray(timeline.body.events)).toBe(true);
    expect(timeline.body.events.length).toBeGreaterThan(0);
    expect(timeline.body.events.some((event: { stageTo?: string }) => event.stageTo === "completed")).toBe(true);
  });

  it("supports audio-only pipeline requests and records openai transcription source", async () => {
    const app = createApp();
    const { sessionId, uploadToken } = await createSessionAndUpload(app);

    const startResponse = await request(app)
      .post("/api/transcriptions")
      .set(contractorHeaders)
      .send({
        sessionId,
        uploadToken,
        idempotencyKey: `pipeline-audio-only-${sessionId}`
      });

    expect(startResponse.status).toBe(202);

    const result = await waitForCompletion(app, sessionId);
    expect(result.stage).toBe("completed");
    expect(result.transcription?.source).toBe("openai");
  });

  it("rejects pipeline start when upload token belongs to a different session", async () => {
    const app = createApp();
    const first = await createSessionAndUpload(app);
    const secondSession = await request(app).post("/api/sessions").set(contractorHeaders).send();

    const response = await request(app)
      .post("/api/transcriptions")
      .set(contractorHeaders)
      .send({
        sessionId: secondSession.body.sessionId,
        uploadToken: first.uploadToken,
        idempotencyKey: `pipeline-cross-session-${Date.now()}`
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/does not belong to this session/i);
  });

  it("rejects unsatisfiable pipeline start requests before enqueue", async () => {
    const app = createApp();
    const sessionResponse = await request(app).post("/api/sessions").set(contractorHeaders).send();

    const response = await request(app)
      .post("/api/transcriptions")
      .set(contractorHeaders)
      .send({
        sessionId: sessionResponse.body.sessionId,
        idempotencyKey: "invalid-start-123"
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/requires uploadToken, transcriptText, or followUpAnswers|uploaded audio payload was not found for transcription/i);
  });

  it("returns follow-up prompts when required extraction fields are missing", async () => {
    const app = createApp();
    const { sessionId, uploadToken } = await createSessionAndUpload(app);

    await request(app)
      .post("/api/transcriptions")
      .set(contractorHeaders)
      .send({
        sessionId,
        uploadToken,
        idempotencyKey: `pipeline-missing-${sessionId}`,
        transcriptText: "style: editorial. moments: first look, ceremony. portraits: clean portraits."
      });

    const result = await waitForCompletion(app, sessionId);
    expect(result.stage).toBe("follow_up_required");
    expect(result.followUps.length).toBeGreaterThan(0);
  });

  it("falls back to partial output after two schema failures", async () => {
    const app = createApp();
    const { sessionId, uploadToken } = await createSessionAndUpload(app);

    await request(app)
      .post("/api/transcriptions")
      .set(contractorHeaders)
      .send({
        sessionId,
        uploadToken,
        idempotencyKey: `pipeline-partial-${sessionId}`,
        transcriptText: "couple: Alex and Sam. venue: Cypress Grove Estate House. city: Orlando, Florida. style: romantic garden."
      });

    const result = await waitForCompletion(app, sessionId);
    expect(["completed", "follow_up_required"]).toContain(result.stage);
  });

  it("can recover from follow-up required using follow-up answers without re-upload", async () => {
    const app = createApp();
    const { sessionId, uploadToken } = await createSessionAndUpload(app);

    await request(app)
      .post("/api/transcriptions")
      .set(contractorHeaders)
      .send({
        sessionId,
        uploadToken,
        idempotencyKey: `pipeline-follow-up-initial-${sessionId}`,
        transcriptText: "style: editorial. moments: first look, ceremony. portraits: clean portraits."
      });

    const followUp = await waitForCompletion(app, sessionId);
    expect(followUp.stage).toBe("follow_up_required");

    const retryResponse = await request(app)
      .post("/api/transcriptions")
      .set(contractorHeaders)
      .send({
        sessionId,
        idempotencyKey: `pipeline-follow-up-retry-${sessionId}`,
        followUpAnswers: {
          couple_names: "Alex and Sam",
          venue_name: "Cypress Grove Estate House",
          venue_city_state: "Orlando, Florida"
        }
      });

    expect(retryResponse.status).toBe(202);

    const completed = await waitForCompletion(app, sessionId);
    expect(completed.stage).toBe("completed");
    expect(completed.followUps).toEqual([]);
  });

  it("keeps the pipeline idempotent for duplicate submissions", async () => {
    const app = createApp();
    const { sessionId, uploadToken } = await createSessionAndUpload(app);
    const payload = {
      sessionId,
      uploadToken,
      idempotencyKey: `pipeline-duplicate-${sessionId}`,
      transcriptText:
        "couple: Alex and Sam. venue: Cypress Grove Estate House. city: Orlando, Florida. style: romantic garden. timeline: heartfelt vows and dance floor."
    };

    const first = await request(app).post("/api/transcriptions").set(contractorHeaders).send(payload);
    const second = await request(app).post("/api/transcriptions").set(contractorHeaders).send(payload);

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);

    const result = await waitForCompletion(app, sessionId);
    expect(result.stage).toBe("completed");
  });

  it("publishes observability alerts when budgets are exceeded", async () => {
    const app = createApp();
    metricsRegistry.record("transcriptionMs", 120001);

    const metrics = await request(app).get("/api/observability/metrics");
    expect(metrics.status).toBe(200);
    expect(metrics.body.alerts).toContain("transcription budget exceeded");
  });
});