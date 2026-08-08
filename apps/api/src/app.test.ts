import request from "supertest";
import { describe, expect, it } from "vitest";

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
  it("reports Google auth as unconfigured when oauth env is missing", async () => {
    const app = createApp();

    const response = await request(app).get("/api/auth/google/status");

    expect(response.status).toBe(200);
    expect(response.body.configured).toBe(false);
    expect(response.body.connected).toBe(false);
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
          "couple: Alex and Sam. venue: Cypress Grove Estate House. city: Orlando, Florida. style: romantic garden. timeline: a sunset ceremony and packed dance floor. moments: private vows, confetti exit. portraits: portraits along the lakeside lawn. weather: warm with soft sunset light. reception: full dance floor, emotional speeches.",
        simulate: {
          extractionMode: "normal"
        }
      });

    expect(startResponse.status).toBe(202);

    const result = await waitForCompletion(app, sessionId);
    expect(result.stage).toBe("completed");
    expect(result.googleDoc.url).toContain("docs.google.com");
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
        transcriptText: "style: editorial. moments: first look, ceremony. portraits: clean portraits.",
        simulate: {
          extractionMode: "missing_fields"
        }
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
        transcriptText:
          "couple: Alex and Sam. venue: Cypress Grove Estate House. city: Orlando, Florida. style: romantic garden.",
        simulate: {
          extractionMode: "invalid_twice"
        }
      });

    const result = await waitForCompletion(app, sessionId);
    expect(result.stage).toBe("partial");
    expect(result.partial).toBe(true);
  });

  it("keeps the pipeline idempotent for duplicate submissions", async () => {
    const app = createApp();
    const { sessionId, uploadToken } = await createSessionAndUpload(app);
    const payload = {
      sessionId,
      uploadToken,
      idempotencyKey: `pipeline-duplicate-${sessionId}`,
      transcriptText:
        "couple: Alex and Sam. venue: Cypress Grove Estate House. city: Orlando, Florida. style: romantic garden. timeline: heartfelt vows and dance floor.",
      simulate: {
        extractionMode: "normal"
      }
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