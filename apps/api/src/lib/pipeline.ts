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

function parseListField(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function chooseSoftFallbackString(transcriptText: string, label: string, fallback: string) {
  return extractField(transcriptText, label) ?? fallback;
}

function buildRecap(transcriptText: string): Recap {
  const signatureMoments = parseListField(extractField(transcriptText, "moments"));
  const receptionHighlights = parseListField(extractField(transcriptText, "reception"));

  return RecapSchema.parse({
    couple_names: chooseSoftFallbackString(transcriptText, "couple", "Couple"),
    venue_name: chooseSoftFallbackString(transcriptText, "venue", "The venue"),
    venue_city_state: chooseSoftFallbackString(transcriptText, "city", "The location"),
    wedding_style: chooseSoftFallbackString(transcriptText, "style", "intimate documentary"),
    timeline_summary: chooseSoftFallbackString(
      transcriptText,
      "timeline",
      "The day unfolded in a calm, intimate rhythm centered on the ceremony and portraits."
    ),
    signature_moments: signatureMoments.length > 0 ? signatureMoments : ["ceremony", "portraits"],
    portrait_notes: chooseSoftFallbackString(
      transcriptText,
      "portraits",
      "Portraits were relaxed and location-forward, shaped by the atmosphere of the day."
    ),
    weather_notes: chooseSoftFallbackString(
      transcriptText,
      "weather",
      "The atmosphere carried a warm, natural feeling throughout the day."
    ),
    vendor_notes: parseListField(extractField(transcriptText, "vendors")),
    cultural_traditions: parseListField(extractField(transcriptText, "traditions")),
    reception_highlights: receptionHighlights.length > 0 ? receptionHighlights : ["celebration with family and friends"]
  });
}

function extractJsonFromModelContent(content: string) {
  const trimmed = content.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}

function buildEditorialArticlePrompt(recap: Recap) {
  return `You are writing a real wedding recap for a premium editorial wedding blog. Use only the facts present in the transcript and do not invent details. If the transcript is sparse, shape a concise but elegant feature from the actual details available rather than forcing a reception, timeline, or vendor story that was never described.

Transcript facts:
${JSON.stringify(recap, null, 2)}

ARTICLE OBJECTIVE
- Write a blog post that feels premium, warm, intimate, and editorial.
- Aim for 1000-1800 words when the details support it, but if the recording is more compact, write a thoughtful shorter feature instead of inventing missing story beats.
- Keep the piece grounded in the real wedding details, but write it with a refined, cinematic, story-driven editorial voice inspired by premium wedding publications.
- The tone should feel personal, elegant, and emotionally observant, with the sensory atmosphere of a luxury wedding feature.
- The article should read like a real feature story for a brand that values aesthetic and emotional storytelling.

ARTICLE STYLE RULES
- Use a polished, warm, naturally conversational editorial tone.
- Focus on emotional rhythm, venue character, meaningful moments, family dynamics, and the couple’s personality.
- Avoid generic filler, vague praise, or template language.
- Write with a clear narrative arc: opening atmosphere, ceremony, portraits, and closing reflection. Include a reception section only if it is supported by the transcript.
- Do not invent vendors, decor, emotional beats, or story details not in the transcript.`;
}

function buildSeoBriefPrompt(recap: Recap) {
  return `SEO BRIEF (STRICT)
Use the following SEO intent and taxonomy constraints when producing the metadata and internal linking suggestions.

Search intent goal:
- Optimize for wedding story + venue + location + service intent.
- Strong entity pattern: [couple names] at [venue] in [city, state] wedding photography and videography.
- Prioritize actual location, venue, and service language that matches the real wedding facts.

Brand taxonomy:
- Favor relevant wedding photographer and videographer language when it is supported by the facts or by the site’s established categories.
- Examples of acceptable service terms: wedding photographer, wedding videographer, Orlando wedding photographer, Central Florida wedding photographer, micro wedding photographer, destination wedding photographer.
- Do not invent service terms that are not supported by the transcript or the brand’s actual offering.

Search intent rules:
- The title, meta description, H2 outline, slugs, alt text, and internal linking suggestions should reinforce real search intent.
- Favor actual venue names, city/state names, and relevant service terminology.
- Keep the language readable first and search-aware second.
- Do not keyword-stuff or force terms that do not feel natural.

Internal linking rules:
- Recommend only internal pages that genuinely match the wedding story and brand taxonomy.
- Good examples: venue pages, local area pages, wedding photography pricing, micro wedding pages, real weddings archive, contact page.
- Do not suggest unrelated or random pages.
- Internal links must still feel natural and human-sensible.

Intent examples for this wedding:
- [couple names] + [venue name] + [city, state]
- [city, state] wedding photographer
- [venue name] wedding venue + wedding photography
- micro wedding photographer / wedding videographer in [city, state]

Transcript facts:
${JSON.stringify(recap, null, 2)}

SEO OUTPUT CONSTRAINTS
- Generate the title, meta description, H2 outline, recommended image slugs, internal link suggestions, and alt text from the same wedding facts and article narrative.
- The primary title must include the couple names, the venue name, and the city/state.
- recommended_image_slugs should be derived from the venue, city, and couple names and match the story and location intent.
- internal_link_suggestions must use relevant internal pages only and should make sense to a human reader.
- alt_text_suggestions must reflect the actual wedding story and location while remaining descriptive and SEO-safe.
- Do not invent page names, links, or terms not logically related to the content.`;
}

async function generateBlogOutputWithAI(recap: Recap) {
  if (!API_CONFIG.openai.apiKey) {
    throw new Error("OPENAI_API_KEY is not configured. AI generation is required and cannot run without a generation key.");
  }

  const prompt = `${buildEditorialArticlePrompt(recap)}

${buildSeoBriefPrompt(recap)}

FINAL OUTPUT REQUIREMENTS
- Return valid JSON only.
- The JSON must match this structure exactly:
  {
    "primary_title": string,
    "meta_description": string,
    "h2_outline": [string, string, string, string, string],
    "section_blocks": [{ "heading": string, "body": string }],
    "recommended_image_slugs": [string],
    "internal_link_suggestions": [string],
    "alt_text_suggestions": [string]
  }
- Use 4-5 H2 headings and 4-5 section blocks depending on how much real detail the transcript contains.
- Keep the total article length within the 1000-1800 word range when details support it; if the story is more compact, prioritize clarity and grounded storytelling instead of forcing length.
- Do not include markdown fences.
- Do not add unsupported details.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_CONFIG.openai.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: API_CONFIG.openai.generationModel,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You write polished editorial wedding blog posts from real wedding facts. Output valid JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI generation failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const modelText = payload.choices?.[0]?.message?.content ?? "";
  const jsonText = extractJsonFromModelContent(modelText);
  const parsed = JSON.parse(jsonText) as unknown;
  const output = BlogOutputSchema.parse(parsed);

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
      const blogOutput = await generateBlogOutputWithAI(recap);
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
    const hasDirectInput = Boolean(parsed.transcriptText && parsed.transcriptText.trim().length > 0);
    const hasUploadedAudio = Boolean(upload?.filePath);
    const nextStage: SessionStage = (currentStage === "idle" && (hasDirectInput || hasUploadedAudio))
      || ["uploaded", "follow_up_required", "error"].includes(currentStage)
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
