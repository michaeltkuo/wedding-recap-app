import { z } from "zod";

export const SupportedMimeTypes = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav"
] as const;

export const SessionStageSchema = z.enum([
  "idle",
  "recording",
  "uploading",
  "uploaded",
  "transcribing",
  "extracting",
  "follow_up_required",
  "drafting",
  "publishing",
  "completed",
  "partial",
  "error"
]);

export const TranscriptEntrySchema = z.object({
  session_id: z.string().min(1),
  speaker_role: z.string().min(1),
  utterance_text: z.string().min(1),
  timestamp_start: z.number().min(0),
  timestamp_end: z.number().min(0),
  confidence: z.number().min(0).max(1).optional(),
  device_type: z.string().optional(),
  ambient_noise_flag: z.boolean().optional()
});

export const TranscriptSchema = z.object({
  sessionId: z.string().min(1),
  entries: z.array(TranscriptEntrySchema).min(1)
});

export const RecapSchema = z.object({
  couple_names: z.string().min(1),
  venue_name: z.string().min(1),
  venue_city_state: z.string().min(1),
  wedding_style: z.string().min(1),
  timeline_summary: z.string().min(1),
  signature_moments: z.array(z.string().min(1)).min(1),
  portrait_notes: z.string().min(1),
  weather_notes: z.string().min(1),
  vendor_notes: z.array(z.string().min(1)).optional(),
  cultural_traditions: z.array(z.string().min(1)).optional(),
  reception_highlights: z.array(z.string().min(1)).optional()
});

export const BlogSectionSchema = z.object({
  heading: z.string().min(1),
  body: z.string().min(1)
});

export const BlogOutputSchema = z.object({
  primary_title: z.string().min(1),
  meta_description: z.string().min(1),
  h2_outline: z.array(z.string().min(1)).min(4),
  section_blocks: z.array(BlogSectionSchema).min(4),
  recommended_image_slugs: z.array(z.string().min(1)).min(1),
  internal_link_suggestions: z.array(z.string().min(1)).optional(),
  alt_text_suggestions: z.array(z.string().min(1)).optional()
}).superRefine((value, ctx) => {
  const normalizedTitle = value.primary_title.toLowerCase();
  if (value.section_blocks.length < 4) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Blog output must contain at least 4 narrative sections"
    });
  }

  const titleTokens = normalizedTitle.split(/\s+/);
  if (titleTokens.length < 4) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Primary title must be descriptive and include multiple tokens"
    });
  }
});

export const UploadPolicySchema = z.object({
  sessionId: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.enum(SupportedMimeTypes),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
  ttlSeconds: z.number().int().positive().max(900),
  singleUse: z.literal(true),
  objectKey: z.string().min(1)
});

export const FollowUpSchema = z.object({
  field: z.string().min(1),
  prompt: z.string().min(1)
});

export const GoogleDocSchema = z.object({
  docId: z.string().min(1),
  url: z.string().url(),
  status: z.enum(["ready", "queued", "failed"])
});

export const GoogleAuthStatusSchema = z.object({
  configured: z.boolean(),
  connected: z.boolean(),
  email: z.string().email().optional(),
  connectedAt: z.string().datetime().optional(),
  authorizationUrl: z.string().url().optional()
});

export const SessionResultSchema = z.object({
  sessionId: z.string().min(1),
  stage: SessionStageSchema,
  progressPercent: z.number().min(0).max(100),
  transcript: TranscriptSchema.optional(),
  recap: RecapSchema.optional(),
  blogOutput: BlogOutputSchema.optional(),
  followUps: z.array(FollowUpSchema).default([]),
  googleDoc: GoogleDocSchema.optional(),
  errorMessage: z.string().optional(),
  partial: z.boolean().default(false),
  metrics: z.object({
    uploadMs: z.number().min(0).default(0),
    transcriptionMs: z.number().min(0).default(0),
    extractionMs: z.number().min(0).default(0),
    draftMs: z.number().min(0).default(0),
    publishMs: z.number().min(0).default(0)
  })
});

export const SignUploadRequestSchema = z.object({
  sessionId: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.enum(SupportedMimeTypes),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
  idempotencyKey: z.string().min(8)
});

export const SignUploadResponseSchema = z.object({
  uploadToken: z.string().min(1),
  objectKey: z.string().min(1),
  uploadUrl: z.string().url(),
  expiresAt: z.string().datetime(),
  ttlSeconds: z.number().int().positive(),
  singleUse: z.literal(true)
});

export const SessionCreateResponseSchema = z.object({
  sessionId: z.string().min(1),
  expiresAt: z.string().datetime(),
  stage: SessionStageSchema
});

export const PipelineSimulationSchema = z.object({
  transcriptionDelayMs: z.number().int().min(0).optional(),
  extractionMode: z.enum(["normal", "missing_fields", "invalid_once", "invalid_twice"]).optional(),
  generationDelayMs: z.number().int().min(0).optional(),
  publishMode: z.enum(["normal", "queued", "failed"]).optional()
}).optional();

export const PipelineStartRequestSchema = z.object({
  sessionId: z.string().min(1),
  uploadToken: z.string().min(1),
  idempotencyKey: z.string().min(8),
  transcriptText: z.string().min(1),
  simulate: PipelineSimulationSchema
});

export type SessionStage = z.infer<typeof SessionStageSchema>;
export type Transcript = z.infer<typeof TranscriptSchema>;
export type Recap = z.infer<typeof RecapSchema>;
export type BlogOutput = z.infer<typeof BlogOutputSchema>;
export type FollowUp = z.infer<typeof FollowUpSchema>;
export type SessionResult = z.infer<typeof SessionResultSchema>;
export type SignUploadRequest = z.infer<typeof SignUploadRequestSchema>;
export type SignUploadResponse = z.infer<typeof SignUploadResponseSchema>;
export type PipelineStartRequest = z.infer<typeof PipelineStartRequestSchema>;
export type GoogleAuthStatus = z.infer<typeof GoogleAuthStatusSchema>;

export const PERFORMANCE_BUDGETS_MS = {
  uploadAndTranscription: 120_000,
  extractionAndDraft: 180_000,
  endToEnd: 300_000
} as const;

export function buildObjectKey(sessionId: string, fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase();
  return `sessions/${sessionId}/${safeName}`;
}

export function validateBlogTitle(title: string, recap: Pick<Recap, "couple_names" | "venue_name" | "venue_city_state">) {
  const normalizedTitle = title.toLowerCase();
  const couplesOk = recap.couple_names
    .toLowerCase()
    .split(/\s+/)
    .some((token) => normalizedTitle.includes(token));
  const venueOk = normalizedTitle.includes(recap.venue_name.toLowerCase()) || normalizedTitle.includes(recap.venue_city_state.toLowerCase());

  return couplesOk && venueOk;
}