import { randomUUID } from "node:crypto";

import {
  BlogOutputSchema,
  buildObjectKey,
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
import { canPublishToGoogleDocs, publishGoogleDoc } from "./google-docs.js";
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

function extensionForMimeType(mimeType: string) {
  return (
    {
      "audio/webm": "webm",
      "audio/mp4": "m4a",
      "audio/mpeg": "mp3",
      "audio/wav": "wav"
    }[mimeType] ?? "audio"
  );
}

type OpenAiMessage = {
  role: "system" | "user";
  content: string;
};

async function callOpenAi(endpoint: string, init: RequestInit) {
  if (!API_CONFIG.openai.apiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  const response = await fetch(`https://api.openai.com/v1/${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_CONFIG.openai.apiKey}`,
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI ${endpoint} failed: ${response.status} ${errorBody}`);
  }

  return response;
}

async function transcribeAudioFromUpload(content: Buffer, mimeType: string) {
  const audioBytes = Uint8Array.from(content);
  const audioBlob = new Blob([audioBytes.buffer], { type: mimeType });
  const form = new FormData();
  form.set("model", API_CONFIG.openai.transcriptionModel);
  form.set("response_format", "text");
  form.set("file", audioBlob, `recap.${extensionForMimeType(mimeType)}`);

  const response = await callOpenAi("audio/transcriptions", {
    method: "POST",
    body: form
  });

  const transcriptText = (await response.text()).trim();
  if (!transcriptText) {
    throw new Error("Transcription returned empty text");
  }

  return transcriptText;
}

async function extractRecapWithModel(transcriptText: string) {
  const response = await callOpenAi("chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: API_CONFIG.openai.extractionModel,
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "recap",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              couple_names: { type: "string" },
              venue_name: { type: "string" },
              venue_city_state: { type: "string" },
              wedding_style: { type: "string" },
              timeline_summary: { type: "string" },
              signature_moments: {
                type: "array",
                items: { type: "string" },
                minItems: 1
              },
              portrait_notes: { type: "string" },
              weather_notes: { type: "string" },
              vendor_notes: {
                type: "array",
                items: { type: "string" }
              },
              cultural_traditions: {
                type: "array",
                items: { type: "string" }
              },
              reception_highlights: {
                type: "array",
                items: { type: "string" }
              }
            },
            required: [
              "couple_names",
              "venue_name",
              "venue_city_state",
              "wedding_style",
              "timeline_summary",
              "signature_moments",
              "portrait_notes",
              "weather_notes"
            ]
          }
        }
      },
      messages: [
        {
          role: "system",
          content: "Extract a wedding recap object from transcript text. Return only factual fields from the transcript."
        } satisfies OpenAiMessage,
        {
          role: "user",
          content: transcriptText
        } satisfies OpenAiMessage
      ]
    })
  });

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Extraction model returned no JSON content");
  }

  const parsed = JSON.parse(content);
  return RecapSchema.parse(parsed);
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
    wedding_style: extractField(transcriptText, "style") ?? "",
    timeline_summary: extractField(transcriptText, "timeline") ?? "",
    signature_moments: (extractField(transcriptText, "moments") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    portrait_notes: extractField(transcriptText, "portraits") ?? "",
    weather_notes: extractField(transcriptText, "weather") ?? "",
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
  if (simulation?.extractionMode === "missing_fields") {
    return { followUps: followUpPrompts(transcriptText), recap: undefined, partial: false };
  }

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    sessionStore.incrementExtractAttempt(sessionId);
    const failThisAttempt =
      (simulation?.extractionMode === "invalid_once" && attempt === 1) ||
      (simulation?.extractionMode === "invalid_twice" && attempt <= 2);

    if (failThisAttempt) {
      if (attempt === 2) {
        throw new Error("Extraction schema failed twice");
      }
      continue;
    }

    if (simulation) {
      return { recap: buildRecap(transcriptText), partial: false, followUps: [] };
    }

    return { recap: await extractRecapWithModel(transcriptText), partial: false, followUps: [] };
  }

  throw new Error("Unknown extraction failure");
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
    uploadUrl: `${API_CONFIG.origin}/api/uploads/${uploadToken}`,
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

  return response;
}

export function uploadAudio(uploadToken: string, content: Buffer, contentType: string) {
  const upload = sessionStore.getUpload(uploadToken);
  const mimeType = contentType.split(";", 1)[0]?.trim().toLowerCase();

  if (!mimeType || upload.mimeType !== mimeType) {
    throw new Error("Audio content type does not match the signed upload");
  }
  if (content.length === 0) {
    throw new Error("Audio upload is empty");
  }
  if (content.length !== upload.sizeBytes) {
    throw new Error("Audio upload size does not match the signed upload");
  }

  const session = sessionStore.getSession(upload.sessionId);
  if (session.stage !== "uploading") {
    throw new Error("Session is not ready to receive audio");
  }

  sessionStore.saveUploadContent(uploadToken, content, mimeType);
  sessionStore.updateStage(upload.sessionId, transitionStage("uploading", "uploaded"), 20);
  return { accepted: true, sessionId: upload.sessionId };
}

export function runPipeline(request: PipelineStartRequest) {
  const parsed = PipelineStartRequestSchema.parse(request);

  const result = sessionStore.rememberIdempotent(parsed.idempotencyKey, () => {
    let uploadContent: Buffer | undefined;
    let uploadMimeType: string | undefined;
    const existing = sessionStore.getSession(parsed.sessionId);
    if (existing.stage !== "follow_up_required") {
      const upload = sessionStore.getUpload(parsed.uploadToken);
      if (upload.sessionId !== parsed.sessionId) {
        throw new Error("Upload does not belong to this session");
      }
      const consumedUpload = sessionStore.consumeUpload(parsed.uploadToken);
      uploadContent = consumedUpload.content;
      uploadMimeType = consumedUpload.contentType;
    }

    const nextStage = ["uploaded", "follow_up_required", "error"].includes(existing.stage) ? "transcribing" : existing.stage;
    sessionStore.updateStage(parsed.sessionId, transitionStage(existing.stage, nextStage as SessionResult["stage"]), 25);
    sessionStore.updateSession(parsed.sessionId, { simulation: parsed.simulate });

    return jobQueue.enqueue(parsed.idempotencyKey, async () => {
      try {
        const transcriptionStart = Date.now();
        if (parsed.simulate?.transcriptionDelayMs) {
          await delay(parsed.simulate.transcriptionDelayMs);
        }

        const transcriptText = parsed.simulate
          ? parsed.transcriptText ?? ""
          : await transcribeAudioFromUpload(uploadContent ?? Buffer.alloc(0), uploadMimeType ?? "application/octet-stream");

        if (!transcriptText) {
          throw new Error("Transcription returned no usable text");
        }

        const transcript = buildTranscript(parsed.sessionId, transcriptText);
        sessionStore.saveTranscript(parsed.sessionId, transcript, transcriptText);

        const transcriptionMs = Date.now() - transcriptionStart;
        sessionStore.updateSession(parsed.sessionId, {
          metrics: {
            ...sessionStore.getSession(parsed.sessionId).metrics,
            transcriptionMs
          }
        });
        metricsRegistry.record("transcriptionMs", transcriptionMs);

        sessionStore.updateStage(parsed.sessionId, transitionStage("transcribing", "extracting"), 50);
        const extractionStart = Date.now();
        const extractionResult = await extractRecapWithRetry(parsed.sessionId, transcriptText, parsed.simulate);
        const extractionMs = Date.now() - extractionStart;
        sessionStore.updateSession(parsed.sessionId, {
          metrics: {
            ...sessionStore.getSession(parsed.sessionId).metrics,
            extractionMs
          }
        });
        metricsRegistry.record("extractionMs", extractionMs);

        if (extractionResult.followUps.length > 0 && !extractionResult.recap) {
          sessionStore.setFollowUps(parsed.sessionId, extractionResult.followUps, false);
          sessionStore.updateStage(parsed.sessionId, transitionStage("extracting", "follow_up_required"), 70);
          return;
        }

        const recap = extractionResult.recap!;
        sessionStore.saveRecap(parsed.sessionId, recap, []);
        sessionStore.updateStage(parsed.sessionId, transitionStage("extracting", "review_ready"), 75);
        SessionResultSchema.parse(sessionStore.getSession(parsed.sessionId));
      } catch (pipelineError) {
        const message = pipelineError instanceof Error ? pipelineError.message : "Pipeline failed";
        sessionStore.updateStage(parsed.sessionId, transitionStage(sessionStore.getSession(parsed.sessionId).stage, "error"), 100, message);
      }
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

  if (session.stage === "review_ready") {
    sessionStore.updateStage(sessionId, transitionStage("review_ready", "drafting"), 85);
  }

  const draftDelayMs = session.simulation?.generationDelayMs ?? 25;
  const blogOutput = buildBlogOutput(session.recap);
  sessionStore.saveBlogOutput(sessionId, blogOutput);
  sessionStore.updateSession(sessionId, {
    metrics: {
      ...sessionStore.getSession(sessionId).metrics,
      draftMs: draftDelayMs
    }
  });
  metricsRegistry.record("draftMs", draftDelayMs);
  return { status: "success", blogOutput };
}

export async function publishSession(sessionId: string, publishMode: "normal" | "queued" | "failed" = "normal") {
  const session = sessionStore.getSession(sessionId);
  if (!session.recap) {
    throw new Error("Recap is not available");
  }

  const blogOutput = session.blogOutput ?? draftSession(sessionId).blogOutput;
  const afterDraft = sessionStore.getSession(sessionId);
  if (afterDraft.stage === "drafting") {
    sessionStore.updateStage(sessionId, transitionStage("drafting", "publishing"), 90);
  } else if (afterDraft.stage !== "publishing") {
    throw new Error("Recap is not ready to send");
  }

  if (publishMode !== "normal") {
    sessionStore.updateStage(sessionId, transitionStage("publishing", "error"), 100, "Google Docs publish failed");
    throw new Error("Google Docs publish failed");
  }

  const publishStart = Date.now();
  if (!canPublishToGoogleDocs()) {
    sessionStore.updateStage(sessionId, transitionStage("publishing", "error"), 100, "Google Docs publishing is unavailable: connect Google OAuth first");
    throw new Error("Google Docs publishing is unavailable: connect Google OAuth first");
  }

  const googleDoc = await publishGoogleDoc(blogOutput);

  sessionStore.updateSession(sessionId, { googleDoc });
  const publishMs = Date.now() - publishStart;
  sessionStore.updateSession(sessionId, {
    metrics: {
      ...sessionStore.getSession(sessionId).metrics,
      publishMs
    }
  });
  metricsRegistry.record("publishMs", publishMs);
  const beforeCompletion = sessionStore.getSession(sessionId);
  sessionStore.updateStage(sessionId, transitionStage(beforeCompletion.stage, "completed"), 100);
  return { status: publishMode, googleDoc };
}