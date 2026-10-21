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
  "review_ready",
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
  reception_highlights: z.array(z.string().min(1)).optional(),
  // Story material the blog needs; extraction keeps these close to the photographer's own words.
  anecdotes: z.array(z.string().min(1)).optional(),
  quotes: z.array(z.string().min(1)).optional(),
  behind_the_scenes: z.array(z.string().min(1)).optional()
});

// Studio team as it appears on the blog: intro credit, vendor credits, and Squarespace categories.
export const TEAM_ROSTER = [
  { id: "michael-kuo", firstName: "Michael", fullName: "Michael Kuo", category: "Michael K", title: "creative lead and co-owner" },
  { id: "kelly-jazwa", firstName: "Kelly", fullName: "Kelly Jazwa", category: "Kelly" },
  { id: "maddie-zahn", firstName: "Maddie", fullName: "Maddie Zahn", category: "Maddie" },
  { id: "rob-shannon", firstName: "Rob", fullName: "Rob Shannon", category: "Rob" },
  { id: "austin-taft", firstName: "Austin", fullName: "Austin Taft", category: "Austin" }
] as const;

export type TeamMember = (typeof TEAM_ROSTER)[number];
export type TeamMemberId = TeamMember["id"];

export const TeamRoleSchema = z.enum(["photo", "video", "assistant"]);

export const TeamAssignmentSchema = z.object({
  memberId: z.enum(TEAM_ROSTER.map((member) => member.id) as [TeamMemberId, ...TeamMemberId[]]),
  role: TeamRoleSchema
});

// A house of worship is handled differently from an event venue in titles, keyword lines, and slugs.
export const VenueKindSchema = z.enum(["venue", "house_of_worship"]);

export const VenueSchema = z.object({
  name: z.string().trim().min(1),
  kind: VenueKindSchema.default("venue"),
  url: z.string().url().optional()
});

export const VendorSchema = z.object({
  role: z.string().trim().min(1),
  name: z.string().trim().min(1),
  url: z.string().url().optional()
});

export const CoupleStorySchema = z.object({
  howTheyMet: z.string().trim().optional(),
  whyThisVenue: z.string().trim().optional(),
  funFacts: z.array(z.string().trim().min(1)).default([]),
  quotes: z.array(z.string().trim().min(1)).default([])
});

// Intake from the web app. Everything is optional so a recap can still go out; gaps become review flags.
export const WeddingDetailsSchema = z.object({
  partnerOne: z.string().trim().min(1).optional(),
  partnerTwo: z.string().trim().min(1).optional(),
  ceremonyVenue: VenueSchema.optional(),
  receptionVenue: VenueSchema.optional(),
  city: z.string().trim().min(1).optional(),
  state: z.string().trim().length(2).optional(),
  team: z.array(TeamAssignmentSchema).default([]),
  childrenFeatured: z.boolean().default(false),
  vendors: z.array(VendorSchema).default([]),
  coupleStory: CoupleStorySchema.optional()
});

export const BlogSectionSchema = z.object({
  heading: z.string().trim().min(1),
  paragraphs: z.array(z.string().trim().min(1)).min(1)
});

export const CreditLineSchema = z.object({
  label: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url().optional()
});

export const LinkSchema = z.object({
  text: z.string().min(1),
  url: z.string().url()
});

// The Squarespace "paste sheet": body copy in publish order, then the post settings Amy fills by hand.
export const BlogOutputSchema = z.object({
  post_title: z.string().min(1),
  keyword_line: z.string().min(1),
  intro_credit: z.string().min(1),
  opening: z.array(z.string().trim().min(1)).min(1),
  sections: z.array(BlogSectionSchema).min(2).max(6),
  closing: z.string().trim().min(1),
  venue_review_link: LinkSchema.extend({ afterSection: z.number().int().min(-1) }).optional(),
  credits: z.array(CreditLineSchema).min(1),
  kids_note: z.string().optional(),
  settings: z.object({
    excerpt: z.string().min(1),
    url_slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    seo_title: z.string().min(1),
    seo_description: z.string().min(1),
    categories: z.array(z.string().min(1)).min(1),
    tags: z.array(z.string().min(1)),
    hero_alt_text: z.string().min(1),
    hero_caption_keywords: z.array(z.string().min(1)),
    image_file_prefix: z.string().min(1)
  }),
  review_flags: z.array(z.string().min(1)).default([])
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
  details: WeddingDetailsSchema.optional(),
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
  transcriptText: z.string().optional(),
  details: WeddingDetailsSchema.optional(),
  simulate: PipelineSimulationSchema
});

export type SessionStage = z.infer<typeof SessionStageSchema>;
export type Transcript = z.infer<typeof TranscriptSchema>;
export type Recap = z.infer<typeof RecapSchema>;
export type BlogOutput = z.infer<typeof BlogOutputSchema>;
export type BlogSection = z.infer<typeof BlogSectionSchema>;
export type CreditLine = z.infer<typeof CreditLineSchema>;
export type TeamRole = z.infer<typeof TeamRoleSchema>;
export type TeamAssignment = z.infer<typeof TeamAssignmentSchema>;
export type Venue = z.infer<typeof VenueSchema>;
export type Vendor = z.infer<typeof VendorSchema>;
export type CoupleStory = z.infer<typeof CoupleStorySchema>;
export type WeddingDetails = z.infer<typeof WeddingDetailsSchema>;
export type WeddingDetailsInput = z.input<typeof WeddingDetailsSchema>;
export type FollowUp = z.infer<typeof FollowUpSchema>;
export type SessionResult = z.infer<typeof SessionResultSchema>;
export type SignUploadRequest = z.infer<typeof SignUploadRequestSchema>;
export type SignUploadResponse = z.infer<typeof SignUploadResponseSchema>;
export type PipelineStartRequest = z.infer<typeof PipelineStartRequestSchema>;
export type PipelineStartRequestInput = z.input<typeof PipelineStartRequestSchema>;
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
