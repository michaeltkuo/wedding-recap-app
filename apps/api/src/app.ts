import express from "express";
import cors from "cors";

import { PipelineStartRequestSchema, SignUploadRequestSchema } from "./contracts.js";

import { API_CONFIG } from "./config.js";
import {
  assertContractorToken,
  createSession,
  draftSession,
  extractSession,
  getSessionResult,
  metricsRegistry,
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

  app.post("/api/sessions", (request, response) => {
    try {
      assertContractorToken(request.header("x-contractor-token"));
      response.status(201).json(createSession(API_CONFIG.contractorToken));
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

  app.post("/api/recaps/draft", (request, response) => {
    try {
      assertContractorToken(request.header("x-contractor-token"));
      response.json(draftSession(request.body.sessionId));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "Draft failed" });
    }
  });

  app.post("/api/docs/publish", (request, response) => {
    try {
      assertContractorToken(request.header("x-contractor-token"));
      response.json(publishSession(request.body.sessionId, request.body.publishMode));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "Publish failed" });
    }
  });

  app.get("/api/sessions/:sessionId", (request, response) => {
    try {
      assertContractorToken(request.header("x-contractor-token"));
      response.json(getSessionResult(request.params.sessionId));
    } catch (error) {
      response.status(404).json({ error: error instanceof Error ? error.message : "Session not found" });
    }
  });

  app.get("/api/observability/metrics", (_request, response) => {
    response.json(metricsRegistry.snapshot());
  });

  return app;
}