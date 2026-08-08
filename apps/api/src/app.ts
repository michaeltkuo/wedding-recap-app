import express from "express";
import cors from "cors";

import { PipelineStartRequestSchema, SignUploadRequestSchema } from "./contracts.js";

import { API_CONFIG } from "./config.js";
import {
  assertContractorToken,
  createSession,
  draftSession,
  extractSession,
  getSessionTimelineEntries,
  getSessionResult,
  metricsRegistry,
  persistUploadedAudio,
  publishSession,
  runPipeline,
  signUpload
} from "./lib/pipeline.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.post("/api/sessions", async (request, response) => {
    try {
      assertContractorToken(request.header("x-contractor-token"));
      response.status(201).json(await createSession(API_CONFIG.contractorToken));
    } catch (error) {
      response.status(401).json({ error: error instanceof Error ? error.message : "Unauthorized" });
    }
  });

  app.post("/api/uploads/sign-url", (request, response) => {
    try {
      assertContractorToken(request.header("x-contractor-token"));
      const payload = SignUploadRequestSchema.parse(request.body);
      response.status(201).json(signUpload(payload));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "Invalid upload request" });
    }
  });

  app.put("/api/uploads/:uploadToken", express.raw({ type: () => true, limit: API_CONFIG.upload.maxSizeBytes }), async (request, response) => {
    try {
      assertContractorToken(request.header("x-contractor-token"));
      const body = Buffer.isBuffer(request.body) ? request.body : Buffer.from(request.body ?? []);
      response.status(201).json(await persistUploadedAudio(request.params.uploadToken, body));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "Upload failed" });
    }
  });

  app.post("/api/transcriptions", async (request, response) => {
    try {
      assertContractorToken(request.header("x-contractor-token"));
      const payload = PipelineStartRequestSchema.parse(request.body);
      void runPipeline(payload);
      response.status(202).json({ accepted: true, sessionId: payload.sessionId });
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "Invalid pipeline request" });
    }
  });

  app.post("/api/recaps/extract", async (request, response) => {
    try {
      assertContractorToken(request.header("x-contractor-token"));
      response.json(await extractSession(request.body.sessionId));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "Extraction failed" });
    }
  });

  app.post("/api/recaps/draft", async (request, response) => {
    try {
      assertContractorToken(request.header("x-contractor-token"));
      response.json(await draftSession(request.body.sessionId));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "Draft failed" });
    }
  });

  app.post("/api/docs/publish", async (request, response) => {
    try {
      assertContractorToken(request.header("x-contractor-token"));
      response.json(await publishSession(request.body.sessionId));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "Publish failed" });
    }
  });

  app.get("/api/sessions/:sessionId", async (request, response) => {
    try {
      assertContractorToken(request.header("x-contractor-token"));
      response.json(await getSessionResult(request.params.sessionId));
    } catch (error) {
      response.status(404).json({ error: error instanceof Error ? error.message : "Session not found" });
    }
  });

  app.get("/api/sessions/:sessionId/timeline", async (request, response) => {
    try {
      assertContractorToken(request.header("x-contractor-token"));
      response.json({ sessionId: request.params.sessionId, events: await getSessionTimelineEntries(request.params.sessionId) });
    } catch (error) {
      response.status(404).json({ error: error instanceof Error ? error.message : "Session not found" });
    }
  });

  app.get("/api/observability/metrics", (_request, response) => {
    response.json(metricsRegistry.snapshot());
  });

  return app;
}