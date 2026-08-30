import express from "express";
import cors from "cors";

import { PipelineStartRequestSchema, SignUploadRequestSchema } from "./contracts.js";

import { API_CONFIG } from "./config.js";
import {
  clearGoogleAuth,
  createGoogleOAuthState,
  getGoogleAuthStatus,
  getGoogleOAuthDiagnostics,
  getGoogleOAuthStartUrl,
  handleGoogleOAuthCallback,
  isGoogleOAuthConfigured
} from "./lib/google-auth.js";
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
  app.use(cors({ origin: API_CONFIG.web.origin, credentials: true }));
  app.use(express.json());

  function readCookie(cookieHeader: string | undefined, cookieName: string) {
    if (!cookieHeader) {
      return undefined;
    }

    const match = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`));
    if (!match) {
      return undefined;
    }

    return decodeURIComponent(match.slice(cookieName.length + 1));
  }

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/api/auth/google/status", (_request, response) => {
    response.json(getGoogleAuthStatus());
  });

  app.get("/api/auth/google/diagnostics", (_request, response) => {
    response.json(getGoogleOAuthDiagnostics());
  });

  app.get("/api/auth/google/start", (_request, response) => {
    if (!isGoogleOAuthConfigured()) {
      response.status(503).json({
        error: "Google OAuth is not configured.",
        diagnostics: getGoogleOAuthDiagnostics()
      });
      return;
    }

    const state = createGoogleOAuthState();
    response.cookie("wedding_google_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/api/auth/google",
      maxAge: 10 * 60 * 1000
    });

    response.redirect(302, getGoogleOAuthStartUrl(state));
  });

  app.get("/api/auth/google/callback", async (request, response) => {
    try {
      const expectedState = readCookie(request.header("cookie"), "wedding_google_oauth_state");
      const returnedState = typeof request.query.state === "string" ? request.query.state : "";
      const code = typeof request.query.code === "string" ? request.query.code : "";
      const googleError = typeof request.query.error === "string" ? request.query.error : "";

      if (googleError) {
        const errorMessage = googleError === "redirect_uri_mismatch"
          ? `Google OAuth redirect URI mismatch. The app expected ${API_CONFIG.google.redirectUri}. Add that exact value to the Google OAuth client Authorized redirect URIs and confirm GOOGLE_OAUTH_REDIRECT_URI matches.`
          : `Google OAuth failed: ${googleError}. Check the Google client configuration and try again.`;
        throw new Error(errorMessage);
      }

      if (!expectedState || expectedState !== returnedState) {
        throw new Error(`Google OAuth state did not match. The browser session may have expired or the OAuth client redirect URI does not match the expected value: ${API_CONFIG.google.redirectUri}. Clear cookies and retry the Connect Google flow.`);
      }

      if (!code) {
        throw new Error(`Google OAuth code is missing. Verify the redirect URI is allowed in Google Cloud and retry the Connect Google flow. Expected redirect URI: ${API_CONFIG.google.redirectUri}`);
      }

      await handleGoogleOAuthCallback(code);
      response.clearCookie("wedding_google_oauth_state", { path: "/api/auth/google" });
      response.redirect(302, `${API_CONFIG.web.origin}/recap/new?googleAuth=connected`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google OAuth failed";
      const payload = {
        error: message,
        diagnostics: getGoogleOAuthDiagnostics()
      };

      if (request.accepts("html")) {
        const redirectUrl = new URL(`${API_CONFIG.web.origin}/recap/new`);
        redirectUrl.searchParams.set("googleAuthError", message);
        redirectUrl.searchParams.set("expectedRedirectUri", API_CONFIG.google.redirectUri);
        response.redirect(302, redirectUrl.toString());
        return;
      }

      response.status(400).json(payload);
    }
  });

  app.post("/api/auth/google/logout", (_request, response) => {
    clearGoogleAuth();
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