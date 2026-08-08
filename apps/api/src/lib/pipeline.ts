import { randomUUID } from "node:crypto";

import {
  BlogOutputSchema,
  buildObjectKey,
  PERFORMANCE_BUDGETS_MS,
  PipelineStartRequestSchema,
  RecapSchema,
  SessionResultSchema,
  SignUploadRequestSchema,
  SignUploadResponseSchema,
  TranscriptSchema,
  validateBlogTitle,
  type BlogOutput,
  type FollowUp,
  type PipelineStartRequest,
  type Recap,
  type SessionResult,
  type SignUploadRequest,
  type Transcript
} from "../contracts.js";

import { API_CONFIG } from "../config.js";
import { buildFallbackGoogleDoc, canPublishToGoogleDocs, publishGoogleDoc } from "./google-docs.js";
import { MetricsRegistry } from "./metrics.js";
import { transitionStage } from "./session-machine.js";
import { sessionStore } from "./store.js";

export const metricsRegistry = new MetricsRegistry();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractField(transcriptText: string, label: string) {
  const pattern = new RegExp(`${label}\\s*:\\s*([^\\n.]+)`, "i");
  return transcriptText.match(pattern)?.[1]?.trim();
}

function buildTranscript(sessionId: string, transcriptText: string): Transcript {
  return TranscriptSchema.parse({
    sessionId,
    entries: [
      {
        session_id: sessionId,
        speaker_role: "contractor",
        utterance_text: transcriptText,
        timestamp_start: 0,
        timestamp_end: Math.max(1, transcriptText.split(/\s+/).length),
        confidence: 0.94,
        device_type: "web",
        ambient_noise_flag: false
      }
    ]
  });
}

function followUpPrompts(transcriptText: string): FollowUp[] {
  const prompts: FollowUp[] = [];

  if (!extractField(transcriptText, "couple")) {
    prompts.push({ field: "couple_names", prompt: "Who are the couple names for this wedding recap?" });
  }

  if (!extractField(transcriptText, "venue")) {
    prompts.push({ field: "venue_name", prompt: "What was the wedding venue?" });
  }

  if (!extractField(transcriptText, "city")) {
    prompts.push({ field: "venue_city_state", prompt: "Which city and state should be used in the post?" });
  }

  return prompts;
}

function buildRecap(transcriptText: string): Recap {
  return RecapSchema.parse({
    couple_names: extractField(transcriptText, "couple") ?? "",
    venue_name: extractField(transcriptText, "venue") ?? "",
    venue_city_state: extractField(transcriptText, "city") ?? "",
    wedding_style: extractField(transcriptText, "style") ?? "documentary romantic",
    timeline_summary: extractField(transcriptText, "timeline") ?? "Ceremony, portraits, and celebration flowed smoothly.",
    signature_moments: (extractField(transcriptText, "moments") ?? "private vows, packed dance floor")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    portrait_notes: extractField(transcriptText, "portraits") ?? "Portraits stayed relaxed and location-forward.",
    weather_notes: extractField(transcriptText, "weather") ?? "Warm weather with soft evening light.",
    vendor_notes: (extractField(transcriptText, "vendors") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    cultural_traditions: (extractField(transcriptText, "traditions") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    reception_highlights: (extractField(transcriptText, "reception") ?? "late-night dancing, heartfelt speeches")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  });
}

function buildBlogOutput(recap: Recap): BlogOutput {
  const primary_title = `${recap.couple_names} ${recap.wedding_style} Wedding at ${recap.venue_name} ${recap.venue_city_state}`;
  const output = BlogOutputSchema.parse({
    primary_title,
    meta_description: `${recap.couple_names} celebrated a ${recap.wedding_style} wedding at ${recap.venue_name} in ${recap.venue_city_state}, with thoughtful coverage from an Orlando wedding photographer team.`,
    h2_outline: [
      "The Wedding Day Setting",
      "Ceremony Highlights",
      "Portraits and Venue Moments",
      "Reception Energy"
    ],
    section_blocks: [
      {
        heading: "The Wedding Day Setting",
        body: `${recap.couple_names} chose ${recap.venue_name} in ${recap.venue_city_state} for a ${recap.wedding_style} celebration grounded in real moments.`
      },
      {
        heading: "Ceremony Highlights",
        body: `The day unfolded through ${recap.timeline_summary} with standout moments like ${recap.signature_moments.join(", ")}.`
      },
      {
        heading: "Portraits and Venue Moments",
        body: `${recap.portrait_notes} Weather conditions stayed ${recap.weather_notes.toLowerCase()}.`
      },
      {
        heading: "Reception Energy",
        body: `Reception highlights included ${recap.reception_highlights?.join(", ") ?? "meaningful toasts and a full dance floor"}, keeping the story useful for local SEO and real client context.`
      }
    ],
    recommended_image_slugs: [
      `${recap.venue_city_state.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${recap.venue_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-wedding`,
      `${recap.couple_names.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${recap.venue_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-portraits`
    ],
    internal_link_suggestions: ["Orlando wedding photography", "Central Florida wedding venues"],
    alt_text_suggestions: [
      `${recap.couple_names} at ${recap.venue_name}`,
      `${recap.venue_name} wedding portraits in ${recap.venue_city_state}`
    ]
  });

  if (!validateBlogTitle(output.primary_title, recap)) {
    throw new Error("Generated blog title failed validation");
  }

  return output;
}

async function extractRecapWithRetry(sessionId: string, transcriptText: string, simulation?: PipelineStartRequest["simulate"]) {
  const followUps = followUpPrompts(transcriptText);
  if (simulation?.extractionMode === "missing_fields" || followUps.length > 0) {
    return { followUps, recap: undefined, partial: false };
  }

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    sessionStore.incrementExtractAttempt(sessionId);
    const failThisAttempt =
      (simulation?.extractionMode === "invalid_once" && attempt === 1) ||
      (simulation?.extractionMode === "invalid_twice" && attempt <= 2);

    if (failThisAttempt) {
      if (attempt === 2) {
        return {
          recap: undefined,
          partial: true,
          followUps: [
            { field: "schema", prompt: "Extraction schema failed twice. Please review the highlighted gaps." }
          ]
        };
      }
      continue;
    }

    return { recap: buildRecap(transcriptText), partial: false, followUps: [] };
  }

  return { recap: undefined, partial: true, followUps: [{ field: "schema", prompt: "Unknown extraction failure." }] };
}

class InMemoryJobQueue {
  private jobs = new Map<string, Promise<void>>();

  enqueue(idempotencyKey: string, work: () => Promise<void>) {
    if (this.jobs.has(idempotencyKey)) {
      return this.jobs.get(idempotencyKey)!;
    }

    const promise = work().finally(() => {
      this.jobs.delete(idempotencyKey);
    });
    this.jobs.set(idempotencyKey, promise);
    return promise;
  }
}

export const jobQueue = new InMemoryJobQueue();

export function assertContractorToken(token: string | undefined) {
  if (token !== API_CONFIG.contractorToken) {
    throw new Error("Unauthorized contractor token");
  }
}

export function createSession(contractorToken: string) {
  const sessionId = randomUUID();
  const session = sessionStore.createSession(sessionId, contractorToken);

  return {
    sessionId,
    expiresAt: new Date(Date.now() + API_CONFIG.upload.ttlSeconds * 1000).toISOString(),
    stage: session.stage
  };
}

export function signUpload(request: SignUploadRequest) {
  const parsed = SignUploadRequestSchema.parse(request);
  const uploadToken = randomUUID();
  const response = SignUploadResponseSchema.parse({
    uploadToken,
    objectKey: buildObjectKey(parsed.sessionId, parsed.fileName),
    uploadUrl: `https://storage.local/upload/${uploadToken}`,
    expiresAt: new Date(Date.now() + API_CONFIG.upload.ttlSeconds * 1000).toISOString(),
    ttlSeconds: API_CONFIG.upload.ttlSeconds,
    singleUse: true
  });

  sessionStore.setUpload({
    ...response,
    sessionId: parsed.sessionId,
    mimeType: parsed.mimeType,
    sizeBytes: parsed.sizeBytes,
    idempotencyKey: parsed.idempotencyKey,
    used: false
  });

  const session = sessionStore.getSession(parsed.sessionId);
  sessionStore.updateStage(parsed.sessionId, transitionStage(session.stage, "uploading"), 10);
  sessionStore.updateStage(parsed.sessionId, transitionStage("uploading", "uploaded"), 20);

  return response;
}

export async function runPipeline(request: PipelineStartRequest) {
  const parsed = PipelineStartRequestSchema.parse(request);

  const result = sessionStore.rememberIdempotent(parsed.idempotencyKey, () => {
    const existing = sessionStore.getSession(parsed.sessionId);
    if (existing.stage !== "follow_up_required") {
      sessionStore.consumeUpload(parsed.uploadToken);
    }

    const nextStage = ["uploaded", "follow_up_required", "error"].includes(existing.stage) ? "transcribing" : existing.stage;
    sessionStore.updateStage(parsed.sessionId, transitionStage(existing.stage, nextStage as SessionResult["stage"]), 25);
    sessionStore.updateSession(parsed.sessionId, { simulation: parsed.simulate });

    return jobQueue.enqueue(parsed.idempotencyKey, async () => {
      const startedAt = Date.now();
      const transcriptionDelayMs = parsed.simulate?.transcriptionDelayMs ?? 25;
      await delay(transcriptionDelayMs);
      const transcript = buildTranscript(parsed.sessionId, parsed.transcriptText);
      sessionStore.saveTranscript(parsed.sessionId, transcript, parsed.transcriptText);
      sessionStore.updateSession(parsed.sessionId, {
        metrics: {
          ...sessionStore.getSession(parsed.sessionId).metrics,
          transcriptionMs: transcriptionDelayMs
        }
      });
      metricsRegistry.record("transcriptionMs", transcriptionDelayMs);

      sessionStore.updateStage(parsed.sessionId, transitionStage("transcribing", "extracting"), 50);
      const extractionStart = Date.now();
      const extractionResult = await extractRecapWithRetry(parsed.sessionId, parsed.transcriptText, parsed.simulate);
      const extractionMs = Date.now() - extractionStart;
      sessionStore.updateSession(parsed.sessionId, {
        metrics: {
          ...sessionStore.getSession(parsed.sessionId).metrics,
          extractionMs
        }
      });
      metricsRegistry.record("extractionMs", extractionMs);

      if (extractionResult.followUps.length > 0 && !extractionResult.recap) {
        const stage = extractionResult.partial ? "partial" : "follow_up_required";
        sessionStore.setFollowUps(parsed.sessionId, extractionResult.followUps, extractionResult.partial);
        sessionStore.updateStage(parsed.sessionId, transitionStage("extracting", stage), extractionResult.partial ? 85 : 70);
        return;
      }

      const recap = extractionResult.recap!;
      sessionStore.saveRecap(parsed.sessionId, recap, []);
      sessionStore.updateStage(parsed.sessionId, transitionStage("extracting", "drafting"), 75);
      const draftDelayMs = parsed.simulate?.generationDelayMs ?? 25;
      await delay(draftDelayMs);
      const blogOutput = buildBlogOutput(recap);
      sessionStore.saveBlogOutput(parsed.sessionId, blogOutput);
      sessionStore.updateSession(parsed.sessionId, {
        metrics: {
          ...sessionStore.getSession(parsed.sessionId).metrics,
          draftMs: draftDelayMs
        }
      });
      metricsRegistry.record("draftMs", draftDelayMs);

      sessionStore.updateStage(parsed.sessionId, transitionStage("drafting", "publishing"), 90);
      const publishStart = Date.now();
      const publishMode = parsed.simulate?.publishMode ?? "normal";
      if (publishMode === "failed") {
        sessionStore.updateStage(parsed.sessionId, transitionStage("publishing", "error"), 100, "Google Docs publish failed");
        return;
      }

      if (publishMode === "queued") {
        sessionStore.updateSession(parsed.sessionId, {
          googleDoc: buildFallbackGoogleDoc(parsed.sessionId, "queued")
        });
      } else if (canPublishToGoogleDocs()) {
        const googleDoc = await publishGoogleDoc(blogOutput);
        sessionStore.updateSession(parsed.sessionId, { googleDoc });
      } else if (API_CONFIG.google.clientId.length > 0 || API_CONFIG.google.clientSecret.length > 0) {
        sessionStore.updateStage(parsed.sessionId, transitionStage("publishing", "error"), 100, "Google OAuth is not connected");
        return;
      } else {
        sessionStore.updateSession(parsed.sessionId, {
          googleDoc: buildFallbackGoogleDoc(parsed.sessionId, "ready")
        });
      }
      const publishMs = Date.now() - publishStart;
      sessionStore.updateSession(parsed.sessionId, {
        metrics: {
          ...sessionStore.getSession(parsed.sessionId).metrics,
          uploadMs: Math.min(transcriptionDelayMs, 10),
          publishMs
        }
      });
      metricsRegistry.record("publishMs", publishMs);

      if (publishMode === "queued") {
        sessionStore.updateStage(parsed.sessionId, transitionStage("publishing", "completed"), 100);
        const totalElapsed = Date.now() - startedAt;
        if (totalElapsed > PERFORMANCE_BUDGETS_MS.endToEnd) {
          sessionStore.updateSession(parsed.sessionId, {
            errorMessage: "Generation exceeded budget; contractor should be notified asynchronously."
          });
        }
        return;
      }

      sessionStore.updateStage(parsed.sessionId, transitionStage("publishing", "completed"), 100);
      SessionResultSchema.parse(sessionStore.getSession(parsed.sessionId));
    });
  });

  return result;
}

export function getSessionResult(sessionId: string) {
  return SessionResultSchema.parse(sessionStore.getSession(sessionId));
}

export async function extractSession(sessionId: string) {
  const session = sessionStore.getSession(sessionId);
  if (!session.transcriptText) {
    throw new Error("Transcript is not available");
  }
  const extraction = await extractRecapWithRetry(sessionId, session.transcriptText, session.simulation);
  if (extraction.recap) {
    sessionStore.saveRecap(sessionId, extraction.recap, []);
    return { status: "success", recap: extraction.recap };
  }
  sessionStore.setFollowUps(sessionId, extraction.followUps, extraction.partial);
  return { status: extraction.partial ? "partial" : "follow_up_required", followUps: extraction.followUps };
}

export function draftSession(sessionId: string) {
  const session = sessionStore.getSession(sessionId);
  if (!session.recap) {
    throw new Error("Recap is not available");
  }
  const blogOutput = buildBlogOutput(session.recap);
  sessionStore.saveBlogOutput(sessionId, blogOutput);
  return { status: "success", blogOutput };
}

export async function publishSession(sessionId: string, publishMode: "normal" | "queued" | "failed" = "normal") {
  const session = sessionStore.getSession(sessionId);
  if (!session.blogOutput) {
    throw new Error("Draft is not available");
  }
  if (publishMode === "failed") {
    throw new Error("Google Docs publish failed");
  }

  if (publishMode === "queued") {
    const googleDoc = buildFallbackGoogleDoc(sessionId, "queued");
    sessionStore.updateSession(sessionId, { googleDoc });
    return { status: publishMode, googleDoc };
  }

  if (canPublishToGoogleDocs()) {
    const googleDoc = await publishGoogleDoc(session.blogOutput);
    sessionStore.updateSession(sessionId, { googleDoc });
    return { status: publishMode, googleDoc };
  }

  if (API_CONFIG.google.clientId.length > 0 || API_CONFIG.google.clientSecret.length > 0) {
    throw new Error("Google OAuth is not connected");
  }

  const googleDoc = buildFallbackGoogleDoc(sessionId, "ready");
  sessionStore.updateSession(sessionId, { googleDoc });
  return { status: publishMode, googleDoc };
}