import fs from "node:fs";
import path from "node:path";
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
  type Recap,
  type SessionResult,
  type SessionStage,
  type SignUploadRequest,
  type TranscriptionSource,
  type Transcript
} from "../contracts.js";

import { API_CONFIG } from "../config.js";
import { MetricsRegistry } from "./metrics.js";
import { publishDraftToGoogleDoc } from "./google-docs.js";
import {
  getSessionTimeline,
  logSessionAttempt,
  logSessionCreated,
  logSessionFinal,
  logSessionStageTransition
} from "./session-log-db.js";
import { transitionStage } from "./session-machine.js";
import { sessionStore } from "./store.js";
import { transcribeAudioFile } from "./transcription.js";

export const metricsRegistry = new MetricsRegistry();

const uploadsRoot = path.join(API_CONFIG.storageDir, "uploads");
fs.mkdirSync(uploadsRoot, { recursive: true });

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

function formatList(values: string[] | undefined, fallback: string) {
  const list = (values ?? []).filter(Boolean);
  return list.length > 0 ? list.join(", ") : fallback;
}

function buildBlogOutput(recap: Recap): BlogOutput {
  const primary_title = `${recap.couple_names} ${recap.wedding_style} Wedding at ${recap.venue_name} ${recap.venue_city_state}`;
  const signatureMomentText = formatList(recap.signature_moments, "their meaningful wedding moments");
  const receptionText = formatList(recap.reception_highlights, "a joyful celebration with heartfelt toasts and a full dance floor");
  const vendorText = formatList(recap.vendor_notes, "thoughtful planning and design details");
  const traditionText = formatList(recap.cultural_traditions, "personal traditions that made the day feel uniquely theirs");

  const output = BlogOutputSchema.parse({
    primary_title,
    meta_description: `${recap.couple_names} celebrated a ${recap.wedding_style} wedding at ${recap.venue_name} in ${recap.venue_city_state}, with a warm, personal atmosphere and meaningful moments designed for a modern editorial wedding feature.`,
    h2_outline: [
      "The Wedding Day Setting",
      "Ceremony Highlights",
      "Portraits and Venue Moments",
      "Family, Traditions, and Personal Details",
      "Reception Energy and Final Impressions"
    ],
    section_blocks: [
      {
        heading: "The Wedding Day Setting",
        body: `${recap.couple_names} chose ${recap.venue_name} in ${recap.venue_city_state} as the backdrop for a ${recap.wedding_style} celebration that felt polished, relaxed, and deeply personal. The setting gave the day an unmistakable sense of place, offering a location that supported both the ceremony atmosphere and the overall story of their wedding day. From the moment guests arrived, the couple’s style and priorities were clear: a meaningful celebration rooted in connection, beauty, and a natural flow from one moment to the next.`
      },
      {
        heading: "Ceremony Highlights",
        body: `The ceremony unfolded through ${recap.timeline_summary}, with the couple’s focus on emotion and intention creating a memorable start to the day. Standout moments included ${signatureMomentText}, which gave the event the kind of energy that feels both intimate and cinematic. Rather than relying on excess or show, the couple let the meaningful details do the work, letting the ceremony remain grounded in sincerity while still feeling visually elevated and fully in tune with the venue.`
      },
      {
        heading: "Portraits and Venue Moments",
        body: `${recap.portrait_notes} The pacing of the day allowed these portraits to feel natural rather than forced, with ${recap.weather_notes.toLowerCase()} helping the photos carry a warm, flattering mood. Whether it was a quiet stretch before the celebration or a more active moment around the property, the couple’s interactions felt effortless and genuine. That kind of atmosphere is what makes a wedding feel timeless: not a set of staged poses, but a series of genuine moments that reflect how the couple really felt in the middle of the celebration.`
      },
      {
        heading: "Family, Traditions, and Personal Details",
        body: `The details that made this wedding feel personal were the ones that told the story best. ${traditionText} became part of the day in a way that felt organic and meaningful, while the couple’s family and closest loved ones shaped the emotional texture of the celebration. These touches gave the event more depth than a simple venue summary ever could, turning a beautiful wedding into a memorable one. It is those lived-in moments—shared laughter, quiet tears, family involvement, and careful planning—that make a day feel distinct and unforgettable.`
      },
      {
        heading: "Reception Energy and Final Impressions",
        body: `The reception brought the celebration into full focus, with ${receptionText} creating a lively and heartfelt atmosphere that felt true to the couple’s energy. Guests were clearly invested in the experience, and the overall mood balanced joy, elegance, and ease. The evening felt like the natural culmination of everything that came before it: thoughtful design, a strong sense of place, and a couple who clearly wanted to celebrate in a way that was rooted in real connection. In the end, this wedding was memorable not because it tried to be anything more than itself, but because every detail, from the venue to the final dance, felt sincere, warm, and beautifully personal. ${vendorText} helped bring the vision fully to life.`
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

async function extractRecapWithRetry(sessionId: string, transcriptText: string) {
  const followUps = followUpPrompts(transcriptText);
  if (followUps.length > 0) {
    return { followUps, recap: undefined, partial: false };
  }

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const attemptNo = sessionStore.incrementExtractAttempt(sessionId);
    try {
      const recap = buildRecap(transcriptText);
      await logSessionAttempt(sessionId, "extraction", attemptNo, true);
      return { recap, partial: false, followUps: [] };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown extraction error";
      await logSessionAttempt(sessionId, "extraction", attemptNo, false, reason);
      sessionStore.updateSession(sessionId, {
        retryMetadata: {
          ...sessionStore.getSession(sessionId).retryMetadata,
          lastFailureReason: reason
        }
      });

      if (attempt === 2) {
        return {
          recap: undefined,
          partial: true,
          followUps: [
            { field: "schema", prompt: "Extraction schema failed twice. Please review the highlighted gaps." }
          ]
        };
      }
    }
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

export async function createSession(contractorToken: string) {
  const sessionId = randomUUID();
  const session = sessionStore.createSession(sessionId, contractorToken);
  await logSessionCreated(sessionId);

  return {
    sessionId,
    expiresAt: new Date(Date.now() + API_CONFIG.upload.ttlSeconds * 1000).toISOString(),
    stage: session.stage
  };
}

export function signUpload(request: SignUploadRequest) {
  const parsed = SignUploadRequestSchema.parse(request);
  const uploadToken = randomUUID();
  const objectKey = buildObjectKey(parsed.sessionId, parsed.fileName);

  const response = SignUploadResponseSchema.parse({
    uploadToken,
    objectKey,
    uploadUrl: `${API_CONFIG.baseUrl}/api/uploads/${uploadToken}`,
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
  void logSessionStageTransition(parsed.sessionId, session.stage, "uploading");

  return response;
}

export async function persistUploadedAudio(uploadToken: string, body: Buffer) {
  const upload = sessionStore.consumeUpload(uploadToken);
  if (body.byteLength > upload.sizeBytes) {
    throw new Error("Uploaded payload exceeds requested size");
  }

  const uploadPath = path.join(uploadsRoot, upload.objectKey);
  fs.mkdirSync(path.dirname(uploadPath), { recursive: true });
  await fs.promises.writeFile(uploadPath, body);

  sessionStore.markUploadStored(uploadToken, uploadPath);
  const current = sessionStore.getSession(upload.sessionId);
  sessionStore.updateStage(upload.sessionId, transitionStage(current.stage, "uploaded"), 20);
  void logSessionStageTransition(upload.sessionId, current.stage, "uploaded");

  return { stored: true, objectKey: upload.objectKey };
}

function mergeFollowUpAnswers(baseTranscript: string, followUpAnswers: Record<string, string> | undefined) {
  if (!followUpAnswers || Object.keys(followUpAnswers).length === 0) {
    return baseTranscript;
  }

  const fieldLabelMap: Record<string, string> = {
    couple_names: "couple",
    venue_name: "venue",
    venue_city_state: "city"
  };

  const additions = Object.entries(followUpAnswers)
    .map(([field, value]) => `${fieldLabelMap[field] ?? field.replaceAll("_", " ")}: ${value}.`)
    .join(" ");

  return `${baseTranscript} ${additions}`.trim();
}

async function runGenerationWithRetry(sessionId: string, recap: Recap) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const attemptNo = sessionStore.incrementGenerationAttempt(sessionId);
    try {
      const blogOutput = buildBlogOutput(recap);
      await logSessionAttempt(sessionId, "generation", attemptNo, true);
      return blogOutput;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown generation error";
      await logSessionAttempt(sessionId, "generation", attemptNo, false, reason);
      sessionStore.updateSession(sessionId, {
        retryMetadata: {
          ...sessionStore.getSession(sessionId).retryMetadata,
          lastFailureReason: reason
        }
      });
      if (attempt === 2) {
        throw new Error(`Generation failed twice: ${reason}`);
      }
    }
  }

  throw new Error("Generation failed after retries");
}

export function runPipeline(request: unknown) {
  const parsed = PipelineStartRequestSchema.parse(request);

  const result = sessionStore.rememberIdempotent(parsed.idempotencyKey, () => {
    const existing = sessionStore.getSession(parsed.sessionId);
    const needsFreshTranscription = !["follow_up_required", "partial"].includes(existing.stage);
    const upload = parsed.uploadToken ? sessionStore.getUpload(parsed.uploadToken) : undefined;

    if (upload && upload.sessionId !== parsed.sessionId) {
      throw new Error("Upload token does not belong to this session");
    }

    if (needsFreshTranscription && !parsed.transcriptText && !upload?.filePath) {
      throw new Error("Uploaded audio payload was not found for transcription");
    }

    if (existing.stage === "uploading" && (parsed.transcriptText || upload?.filePath)) {
      sessionStore.updateStage(parsed.sessionId, transitionStage("uploading", "uploaded"), 20);
      void logSessionStageTransition(parsed.sessionId, "uploading", "uploaded");
    }

    const currentStage = sessionStore.getSession(parsed.sessionId).stage;
    const nextStage: SessionStage = ["uploaded", "follow_up_required", "error"].includes(currentStage)
      ? "transcribing"
      : currentStage;
    sessionStore.updateStage(parsed.sessionId, transitionStage(currentStage, nextStage), 25);
    void logSessionStageTransition(parsed.sessionId, currentStage, nextStage);

    return jobQueue.enqueue(parsed.idempotencyKey, async () => {
      const startedAt = Date.now();
      try {
        const transcriptionStart = Date.now();
        let transcriptText = parsed.transcriptText;
        let transcriptionSource: TranscriptionSource = "provided_text";
        if (!transcriptText) {
          if (!needsFreshTranscription) {
            transcriptText = sessionStore.getSession(parsed.sessionId).transcriptText;
            if (transcriptText) {
              transcriptionSource = sessionStore.getSession(parsed.sessionId).transcription?.source ?? "provided_text";
            }
          }

          if (!transcriptText) {
            if (!upload?.filePath) {
              throw new Error("Uploaded audio payload was not found for transcription");
            }
            const transcriptionResult = await transcribeAudioFile(upload.filePath, upload.mimeType);
            transcriptText = transcriptionResult.text;
            transcriptionSource = transcriptionResult.source;
          }
        }
        const transcriptionMs = Date.now() - transcriptionStart;

        const transcript = buildTranscript(parsed.sessionId, transcriptText);
        sessionStore.saveTranscript(parsed.sessionId, transcript, transcriptText);
        sessionStore.updateSession(parsed.sessionId, {
          transcription: { source: transcriptionSource },
          metrics: {
            ...sessionStore.getSession(parsed.sessionId).metrics,
            transcriptionMs
          }
        });
        metricsRegistry.record("transcriptionMs", transcriptionMs);

        sessionStore.updateStage(parsed.sessionId, transitionStage("transcribing", "extracting"), 50);
        await logSessionStageTransition(parsed.sessionId, "transcribing", "extracting");

        const extractionStart = Date.now();
        const mergedTranscript = mergeFollowUpAnswers(transcriptText, parsed.followUpAnswers);
        const extractionResult = await extractRecapWithRetry(parsed.sessionId, mergedTranscript);
        const extractionMs = Date.now() - extractionStart;

        sessionStore.updateSession(parsed.sessionId, {
          metrics: {
            ...sessionStore.getSession(parsed.sessionId).metrics,
            extractionMs
          }
        });
        metricsRegistry.record("extractionMs", extractionMs);

        if (extractionResult.followUps.length > 0 && !extractionResult.recap) {
          const stage: SessionStage = extractionResult.partial ? "partial" : "follow_up_required";
          sessionStore.setFollowUps(parsed.sessionId, extractionResult.followUps, extractionResult.partial);
          sessionStore.updateStage(parsed.sessionId, transitionStage("extracting", stage), extractionResult.partial ? 85 : 70);
          await logSessionStageTransition(parsed.sessionId, "extracting", stage);
          await logSessionFinal(parsed.sessionId, stage, extractionResult.partial, undefined);
          return;
        }

        const recap = extractionResult.recap!;
        sessionStore.saveRecap(parsed.sessionId, recap, []);
        sessionStore.updateStage(parsed.sessionId, transitionStage("extracting", "drafting"), 75);
        await logSessionStageTransition(parsed.sessionId, "extracting", "drafting");

        const draftStart = Date.now();
        const blogOutput = await runGenerationWithRetry(parsed.sessionId, recap);
        const draftMs = Date.now() - draftStart;

        sessionStore.saveBlogOutput(parsed.sessionId, blogOutput);
        sessionStore.updateSession(parsed.sessionId, {
          metrics: {
            ...sessionStore.getSession(parsed.sessionId).metrics,
            draftMs
          }
        });
        metricsRegistry.record("draftMs", draftMs);

        sessionStore.updateStage(parsed.sessionId, transitionStage("drafting", "publishing"), 90);
        await logSessionStageTransition(parsed.sessionId, "drafting", "publishing");

        const publishStart = Date.now();
        const googleDoc = await publishDraftToGoogleDoc(blogOutput);
        const publishMs = Date.now() - publishStart;

        sessionStore.updateSession(parsed.sessionId, {
          googleDoc,
          metrics: {
            ...sessionStore.getSession(parsed.sessionId).metrics,
            uploadMs: Math.min(transcriptionMs, 10),
            publishMs
          }
        });
        metricsRegistry.record("publishMs", publishMs);
        await logSessionAttempt(parsed.sessionId, "publish", 1, true);

        sessionStore.updateStage(parsed.sessionId, transitionStage("publishing", "completed"), 100);
        await logSessionStageTransition(parsed.sessionId, "publishing", "completed");
        await logSessionFinal(parsed.sessionId, "completed", false, undefined, googleDoc.url);

        const totalElapsed = Date.now() - startedAt;
        if (totalElapsed > PERFORMANCE_BUDGETS_MS.endToEnd) {
          sessionStore.updateSession(parsed.sessionId, {
            errorMessage: "Generation exceeded budget; contractor should be notified asynchronously."
          });
        }

        SessionResultSchema.parse(sessionStore.getSession(parsed.sessionId));
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Pipeline failed";
        await logSessionAttempt(parsed.sessionId, "publish", 1, false, reason);
        const currentStage = sessionStore.getSession(parsed.sessionId).stage;
        const nextStage = transitionStage(currentStage, "error");
        const uploadSucceeded = currentStage !== "idle" && currentStage !== "recording";
        const errorMessage = uploadSucceeded && /transcription/i.test(reason)
          ? `Upload succeeded, but transcription failed: ${reason}`
          : reason;
        sessionStore.updateSession(parsed.sessionId, {
          retryMetadata: {
            ...sessionStore.getSession(parsed.sessionId).retryMetadata,
            lastFailureReason: errorMessage
          }
        });
        sessionStore.updateStage(parsed.sessionId, nextStage, 100, errorMessage);
        await logSessionStageTransition(parsed.sessionId, currentStage, "error", errorMessage);
        await logSessionFinal(parsed.sessionId, "error", false, errorMessage);
      }
    });
  });

  return result;
}

export async function getSessionResult(sessionId: string) {
  const session = sessionStore.getSession(sessionId);
  return SessionResultSchema.parse({
    ...session,
    retryMetadata: {
      extractionAttempts: session.extractAttempts,
      generationAttempts: session.generationAttempts,
      lastFailureReason: session.retryMetadata.lastFailureReason
    }
  });
}

export async function getSessionTimelineEntries(sessionId: string) {
  return getSessionTimeline(sessionId);
}

export async function extractSession(sessionId: string) {
  const session = sessionStore.getSession(sessionId);
  if (!session.transcriptText) {
    throw new Error("Transcript is not available");
  }
  const extraction = await extractRecapWithRetry(sessionId, session.transcriptText);
  if (extraction.recap) {
    sessionStore.saveRecap(sessionId, extraction.recap, []);
    return { status: "success", recap: extraction.recap };
  }
  sessionStore.setFollowUps(sessionId, extraction.followUps, extraction.partial);
  return { status: extraction.partial ? "partial" : "follow_up_required", followUps: extraction.followUps };
}

export async function draftSession(sessionId: string) {
  const session = sessionStore.getSession(sessionId);
  if (!session.recap) {
    throw new Error("Recap is not available");
  }
  const blogOutput = await runGenerationWithRetry(sessionId, session.recap);
  sessionStore.saveBlogOutput(sessionId, blogOutput);
  return { status: "success", blogOutput };
}

export async function publishSession(sessionId: string) {
  const session = sessionStore.getSession(sessionId);
  if (!session.blogOutput) {
    throw new Error("Draft is not available");
  }
  const googleDoc = await publishDraftToGoogleDoc(session.blogOutput);
  sessionStore.updateSession(sessionId, { googleDoc });
  await logSessionFinal(sessionId, "completed", false, undefined, googleDoc.url);
  return { status: "ready", googleDoc };
}
