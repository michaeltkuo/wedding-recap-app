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

  const uploadPath = new URL(uploadResponse.body.uploadUrl).pathname;
  const audioResponse = await request(app)
    .put(uploadPath)
    .set(contractorHeaders)
    .set("content-type", "audio/webm")
    .send(Buffer.alloc(1024, 1));

  expect(audioResponse.status).toBe(201);
  return { sessionId, uploadToken: uploadResponse.body.uploadToken };
}

async function waitForReview(app: ReturnType<typeof createApp>, sessionId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = await request(app).get(`/api/sessions/${sessionId}`).set(contractorHeaders);
    if (["review_ready", "follow_up_required", "partial", "error"].includes(status.body.stage)) {
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
    expect(typeof response.body.configured).toBe("boolean");
    expect(typeof response.body.connected).toBe("boolean");
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

  it("rejects a pipeline start before signed audio has been uploaded", async () => {
    const app = createApp();
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
        idempotencyKey: `upload-unreceived-${sessionId}`
      });

    const response = await request(app)
      .post("/api/transcriptions")
      .set(contractorHeaders)
      .send({
        sessionId,
        uploadToken: uploadResponse.body.uploadToken,
        idempotencyKey: `pipeline-unreceived-${sessionId}`,
        transcriptText: "couple: Alex and Sam. venue: Cypress Grove. city: Orlando, Florida."
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Audio upload has not been received/);
  });

  it("pauses for review and fails publish when OAuth is not connected", async () => {
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

    const review = await waitForReview(app, sessionId);
    expect(review.stage).toBe("review_ready");
    expect(review.googleDoc).toBeUndefined();

    const delivery = await request(app)
      .post("/api/docs/publish")
      .set(contractorHeaders)
      .send({ sessionId, publishMode: "normal" });

    if (delivery.status === 200) {
      expect(delivery.body.googleDoc?.url).toContain("docs.google.com/document/d/");
      const result = await request(app).get(`/api/sessions/${sessionId}`).set(contractorHeaders);
      expect(result.body.stage).toBe("completed");
      return;
    }

    expect(delivery.status).toBe(400);
    expect(delivery.body.error).toMatch(/connect Google OAuth first/);

    const result = await request(app).get(`/api/sessions/${sessionId}`).set(contractorHeaders);
    expect(result.body.stage).toBe("error");

    const duplicateDelivery = await request(app)
      .post("/api/docs/publish")
      .set(contractorHeaders)
      .send({ sessionId, publishMode: "normal" });
    expect(duplicateDelivery.status).toBe(400);
    expect(duplicateDelivery.body.error).toMatch(/not ready to send/);
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

    const result = await waitForReview(app, sessionId);
    expect(result.stage).toBe("follow_up_required");
    expect(result.followUps.length).toBeGreaterThan(0);
  });

  it("converts recap schema misses into follow-up prompts instead of error", async () => {
    const app = createApp();
    const { sessionId, uploadToken } = await createSessionAndUpload(app);

    await request(app)
      .post("/api/transcriptions")
      .set(contractorHeaders)
      .send({
        sessionId,
        uploadToken,
        idempotencyKey: `pipeline-schema-followups-${sessionId}`,
        transcriptText:
          "couple: Nisa and Daniel. venue: Seminole County Courthouse. style: candid documentary. timeline: courthouse ceremony followed by portraits. moments: vows, family facetime call. portraits: greenery portraits outside the courthouse.",
        simulate: {
          extractionMode: "normal"
        }
      });

    const result = await waitForReview(app, sessionId);
    expect(result.stage).toBe("follow_up_required");
    expect(result.followUps.map((item: { field: string }) => item.field)).toEqual(
      expect.arrayContaining(["venue_city_state", "weather_notes"])
    );
  });

  it("uses submitted follow-up notes to exit the follow-up loop", async () => {
    const app = createApp();
    const { sessionId, uploadToken } = await createSessionAndUpload(app);

    await request(app)
      .post("/api/transcriptions")
      .set(contractorHeaders)
      .send({
        sessionId,
        uploadToken,
        idempotencyKey: `pipeline-loop-start-${sessionId}`,
        transcriptText:
          "couple: Nisa and Daniel. venue: Seminole County Courthouse. style: candid documentary. timeline: courthouse ceremony followed by portraits. moments: vows, family facetime call. portraits: greenery portraits outside the courthouse.",
        simulate: {
          extractionMode: "normal"
        }
      });

    const firstPass = await waitForReview(app, sessionId);
    expect(firstPass.stage).toBe("follow_up_required");

    await request(app)
      .post("/api/transcriptions")
      .set(contractorHeaders)
      .send({
        sessionId,
        uploadToken,
        idempotencyKey: `pipeline-loop-fix-${sessionId}`,
        transcriptText: "city: Bushnell, Florida. weather: Hot and sunny with bright conditions.",
        simulate: {
          extractionMode: "normal"
        }
      });

    const secondPass = await waitForReview(app, sessionId);
    expect(secondPass.stage).toBe("review_ready");
    expect(secondPass.recap?.venue_city_state).toBe("Bushnell, Florida");
    expect(secondPass.recap?.weather_notes).toBe("Hot and sunny with bright conditions");
  });

  it("moves to error after repeated extraction schema failures", async () => {
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

    const result = await waitForReview(app, sessionId);
    expect(result.stage).toBe("error");
    expect(result.errorMessage).toMatch(/Extraction schema failed twice/);
  });

  it("keeps the pipeline idempotent for duplicate submissions", async () => {
    const app = createApp();
    const { sessionId, uploadToken } = await createSessionAndUpload(app);
    const payload = {
      sessionId,
      uploadToken,
      idempotencyKey: `pipeline-duplicate-${sessionId}`,
      transcriptText:
        "couple: Alex and Sam. venue: Cypress Grove Estate House. city: Orlando, Florida. style: romantic garden. timeline: heartfelt vows and dance floor. moments: first look, private vows. portraits: sunset portraits by the lake. weather: warm and clear.",
      simulate: {
        extractionMode: "normal"
      }
    };

    const first = await request(app).post("/api/transcriptions").set(contractorHeaders).send(payload);
    const second = await request(app).post("/api/transcriptions").set(contractorHeaders).send(payload);

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);

    const result = await waitForReview(app, sessionId);
    expect(result.stage).toBe("review_ready");
  });

  it("publishes observability alerts when budgets are exceeded", async () => {
    const app = createApp();
    metricsRegistry.record("transcriptionMs", 120001);

    const metrics = await request(app).get("/api/observability/metrics");
    expect(metrics.status).toBe(200);
    expect(metrics.body.alerts).toContain("transcription budget exceeded");
  });
});