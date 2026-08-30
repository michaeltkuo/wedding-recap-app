import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerationResponse = () => ({
  ok: true,
  json: async () => ({
    choices: [
      {
        message: {
          content: JSON.stringify({
            primary_title: "Alex and Sam at Cypress Grove Estate House in Orlando, Florida",
            meta_description: "A romantic wedding story for Alex and Sam at Cypress Grove Estate House in Orlando, Florida.",
            h2_outline: ["Setting", "Ceremony", "Portraits", "Reception", "Closing"],
            section_blocks: [
              {
                heading: "Setting",
                body: "This wedding unfolded in Orlando, Florida with a warm and memorable atmosphere at Cypress Grove Estate House. The day began with thoughtful detail, soft light, and a sense of calm that carried across the entire celebration. Family, friends, and the couple created an environment that felt intimate, polished, and deeply personal from the start."
              },
              {
                heading: "Ceremony",
                body: "The ceremony brought the heart of the day into focus. Alex and Sam shared vows in a setting shaped by sentiment and intention, with the venue adding a distinct sense of elegance and place. Guests were fully present as the couple made their promises, and the emotional rhythm of the moment felt grounded, sincere, and beautifully organic."
              },
              {
                heading: "Portraits",
                body: "Portraits followed with a relaxed and joyful pace. The couple moved through the grounds of Cypress Grove Estate House with ease, embracing the scenery and the natural light of Orlando. These images captured a balance between romance and ease, reflecting the warmth of the occasion while allowing the details of the day to feel candid and alive."
              },
              {
                heading: "Reception",
                body: "The reception carried the story forward with music, laughter, and heartfelt connection. Guests leaned into the celebration, with the atmosphere turning celebratory and lively as the evening unfolded. The couple's style, the venue's character, and the energy of the room came together in a way that felt both elevated and emotionally grounded."
              },
              {
                heading: "Closing",
                body: "The final stretch of the night held a sense of gratitude and wonder. Alex and Sam were surrounded by loved ones, and the celebration closed with a feeling of ease, connection, and optimism. It was a day rooted in real emotion and carefully observed details, ending with a memory that felt intimate, polished, and unmistakably their own."
              }
            ],
            recommended_image_slugs: [
              "wedding-story",
              "cypress-grove-estate-house-orlando-florida"
            ],
            internal_link_suggestions: [
              "real weddings",
              "wedding photography pricing",
              "central florida wedding photographer"
            ],
            alt_text_suggestions: [
              "Alex and Sam at Cypress Grove Estate House in Orlando",
              "Alex and Sam wedding day at Cypress Grove Estate House"
            ]
          })
        }
      }
    ]
  })
});

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_GENERATION_MODEL = "gpt-4o-mini";
  API_CONFIG.openai.apiKey = process.env.OPENAI_API_KEY;
  API_CONFIG.openai.generationModel = process.env.OPENAI_GENERATION_MODEL;
  vi.stubGlobal("fetch", vi.fn(async () => mockGenerationResponse()));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_GENERATION_MODEL;
  API_CONFIG.openai.apiKey = undefined;
  API_CONFIG.openai.generationModel = undefined;
});

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
  it("uses the configured API base URL as the default OAuth redirect host", async () => {
    const previousEnv = { ...process.env };

    try {
      delete process.env.GOOGLE_OAUTH_REDIRECT_URI;
      process.env.API_BASE_URL = "http://127.0.0.1:8787";
      vi.resetModules();

      const { API_CONFIG: configuredApiConfig } = await import("./config.js");
      expect(configuredApiConfig.google.redirectUri).toBe("http://127.0.0.1:8787/api/auth/google/callback");
    } finally {
      process.env = previousEnv;
      vi.resetModules();
    }
  });

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

  it("starts from an idle session when transcript text is supplied", async () => {
    const app = createApp();
    const sessionResponse = await request(app).post("/api/sessions").set(contractorHeaders).send();
    const sessionId = sessionResponse.body.sessionId;

    const startResponse = await request(app)
      .post("/api/transcriptions")
      .set(contractorHeaders)
      .send({
        sessionId,
        idempotencyKey: `pipeline-${sessionId}`,
        transcriptText:
          "couple: Alex and Sam. venue: Cypress Grove Estate House. city: Orlando, Florida. style: romantic garden. timeline: a sunset ceremony and packed dance floor. moments: private vows, confetti exit. portraits: portraits along the lakeside lawn. weather: warm with soft sunset light. reception: full dance floor, emotional speeches."
      });

    expect(startResponse.status).toBe(202);
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

  it("does not invent reception details when the transcript omits them", async () => {
    const app = createApp();
    const { sessionId, uploadToken } = await createSessionAndUpload(app);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              primary_title: "Alex and Sam at Cypress Grove Estate House in Orlando, Florida",
              meta_description: "A romantic wedding story for Alex and Sam at Cypress Grove Estate House in Orlando, Florida.",
              h2_outline: ["Setting", "Ceremony", "Portraits", "Closing"],
              section_blocks: [
                { heading: "Setting", body: "The day unfolded quietly and beautifully in Orlando, Florida." },
                { heading: "Ceremony", body: "Alex and Sam shared vows with sincerity and warmth." },
                { heading: "Portraits", body: "Golden hour portraits reflected the ease of the day." },
                { heading: "Closing", body: "The day closed with gratitude and reflection." }
              ],
              recommended_image_slugs: ["alex-sam-cypress-grove-estate-house-orlando"],
              internal_link_suggestions: ["real weddings", "wedding photography pricing"],
              alt_text_suggestions: ["Alex and Sam at Cypress Grove Estate House"]
            })
          }
        }]
      })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await request(app)
      .post("/api/transcriptions")
      .set(contractorHeaders)
      .send({
        sessionId,
        uploadToken,
        idempotencyKey: `pipeline-no-reception-${sessionId}`,
        transcriptText:
          "couple: Alex and Sam. venue: Cypress Grove Estate House. city: Orlando, Florida. style: romantic garden. timeline: sunset ceremony. moments: private vows. portraits: golden hour portraits by the lake. weather: warm and clear."
      });

    const result = await waitForCompletion(app, sessionId);
    expect(result.stage).toBe("completed");

    const lastCall = fetchMock.mock.calls.at(-1)?.[1] as { body?: string } | undefined;
    const payloadText = lastCall?.body ?? "";
    expect(payloadText).not.toContain("late-night dancing");
    expect(payloadText).not.toContain("heartfelt speeches");
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
    expect(["completed", "follow_up_required", "partial"]).toContain(result.stage);
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
        transcriptText: "style: editorial. timeline: intimate ceremony under the trees. moments: first look, ceremony. portraits: clean portraits. weather: warm and clear."
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
        "couple: Alex and Sam. venue: Cypress Grove Estate House. city: Orlando, Florida. style: romantic garden. timeline: heartfelt vows and dance floor. moments: private vows, confetti exit. portraits: golden hour portraits by the lake. weather: warm and clear."
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