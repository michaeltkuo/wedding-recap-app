import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_GENERATION_MODEL;
});

vi.mock("./lib/google-docs.js", () => ({
  publishDraftToGoogleDoc: vi.fn(async () => ({
    docId: "eval-doc-id",
    url: "https://docs.google.com/document/d/eval-doc-id",
    status: "ready" as const
  }))
}));

import { runPipeline, signUpload, createSession, getSessionResult } from "./lib/pipeline.js";
import { API_CONFIG } from "./config.js";

const baselineFixtures = [
  {
    name: "happy-path-orlando-venue",
    transcriptText:
      "couple: Alex and Sam. venue: Cypress Grove Estate House. city: Orlando, Florida. style: romantic garden. timeline: sunset ceremony, candlelit dinner, packed dance floor. moments: private vows, confetti exit. portraits: soft lakeside portraits. weather: warm and clear. reception: crowded dance floor, heartfelt toasts.",
    expectedTitleTerms: ["alex", "sam", "cypress", "orlando"]
  },
  {
    name: "central-florida-local-intent",
    transcriptText:
      "couple: Jamie and Riley. venue: Bella Collina. city: Montverde, Florida. style: editorial classic. timeline: chapel ceremony and lively reception. moments: first look, champagne tower. portraits: terrace portraits at sunset. weather: dry and breezy. reception: packed dance floor, live band.",
    expectedTitleTerms: ["jamie", "riley", "bella", "montverde"]
  }
];

async function waitForCompletion(sessionId: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await getSessionResult(sessionId);
    if (["completed", "follow_up_required", "partial", "error"].includes(result.stage)) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Session did not complete in time");
}

describe("eval gates", () => {
  it("meets baseline title and section thresholds for all fixtures", async () => {
    const results = [] as boolean[];

    for (const fixture of baselineFixtures) {
      const session = await createSession(API_CONFIG.contractorToken);
      const upload = signUpload({
        sessionId: session.sessionId,
        fileName: `${fixture.name}.webm`,
        mimeType: "audio/webm",
        sizeBytes: 2048,
        idempotencyKey: `eval-upload-${fixture.name}`
      });

      await runPipeline({
        sessionId: session.sessionId,
        uploadToken: upload.uploadToken,
        idempotencyKey: `eval-pipeline-${fixture.name}`,
        transcriptText: fixture.transcriptText
      });

      const result = await waitForCompletion(session.sessionId);
      const title = result.blogOutput?.primary_title.toLowerCase() ?? "";
      const hasAllTerms = fixture.expectedTitleTerms.every((term) => title.includes(term));
      const enoughSections = (result.blogOutput?.section_blocks.length ?? 0) >= 4;
      results.push(hasAllTerms && enoughSections);
    }

    const passRate = results.filter(Boolean).length / results.length;
    expect(passRate).toBeGreaterThanOrEqual(1);
  });

  it("creates a longer, more narrative post structure with rich section depth", async () => {
    const session = await createSession(API_CONFIG.contractorToken);
    const upload = signUpload({
      sessionId: session.sessionId,
      fileName: "editorial-depth.webm",
      mimeType: "audio/webm",
      sizeBytes: 2048,
      idempotencyKey: "eval-upload-editorial-depth"
    });

    await runPipeline({
      sessionId: session.sessionId,
      uploadToken: upload.uploadToken,
      idempotencyKey: "eval-pipeline-editorial-depth",
      transcriptText:
        "couple: Alex and Sam. venue: Cypress Grove Estate House. city: Orlando, Florida. style: romantic garden. timeline: sunset ceremony, candlelit dinner, packed dance floor. moments: private vows, confetti exit, first look, family toast. portraits: golden hour portraits by the lake. weather: warm and clear. reception: heartfelt speeches, joyful dance floor, late-night dessert. vendors: planner, florist, DJ. traditions: family blessing, vintage vows."
    });

    const result = await waitForCompletion(session.sessionId);
    const sectionBlocks = result.blogOutput?.section_blocks ?? [];
    const longEnough = sectionBlocks.length >= 5 && sectionBlocks.every((section) => section.body.length >= 120);
    const hasNarrativeSignals = sectionBlocks.some((section) => /venue|atmosphere|family|ceremony|reception|moment/i.test(section.body));

    expect(longEnough).toBe(true);
    expect(hasNarrativeSignals).toBe(true);
  });

  it("throws when no OpenAI generation key is configured", async () => {
    const originalApiKey = API_CONFIG.openai.apiKey;
    API_CONFIG.openai.apiKey = undefined;

    try {
      const session = await createSession(API_CONFIG.contractorToken);
      const upload = signUpload({
        sessionId: session.sessionId,
        fileName: "no-key.webm",
        mimeType: "audio/webm",
        sizeBytes: 2048,
        idempotencyKey: "eval-upload-no-key"
      });

      await expect(
        runPipeline({
          sessionId: session.sessionId,
          uploadToken: upload.uploadToken,
          idempotencyKey: "eval-pipeline-no-key",
          transcriptText:
            "couple: Alex and Sam. venue: Cypress Grove Estate House. city: Orlando, Florida. style: romantic garden. timeline: sunset ceremony, candlelit dinner, packed dance floor. moments: private vows, confetti exit. portraits: golden hour portraits by the lake. weather: warm and clear. reception: heartfelt speeches, joyful dance floor."
        })
      ).resolves.toBeUndefined();

      const result = await waitForCompletion(session.sessionId);
      expect(result.stage).toBe("error");
      expect(result.errorMessage).toMatch(/OPENAI_API_KEY|generation/i);
    } finally {
      API_CONFIG.openai.apiKey = originalApiKey;
    }
  });

  it("uses the OpenAI generation endpoint when a generation key is configured", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalGenerationModel = process.env.OPENAI_GENERATION_MODEL;
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_GENERATION_MODEL = "gpt-4o-mini";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                primary_title: "Alex and Sam at Cypress Grove Estate House",
                meta_description: "A romantic garden wedding in Orlando, Florida.",
                h2_outline: ["Setting", "Ceremony", "Portraits", "Reception"],
                section_blocks: [
                  { heading: "Setting", body: "Alex and Sam planned a romantic garden wedding at Cypress Grove Estate House in Orlando, Florida." },
                  { heading: "Ceremony", body: "The ceremony was intimate and heartfelt, centered on vows and family presence." },
                  { heading: "Portraits", body: "Golden hour portraits by the lake captured the warmth and romance of the day." },
                  { heading: "Reception", body: "The reception was full of celebration, heartfelt toasts, and a joyful dance floor." }
                ],
                recommended_image_slugs: ["cypress-grove-estate-house-orlando"],
                internal_link_suggestions: ["Orlando wedding venues"],
                alt_text_suggestions: ["Alex and Sam at Cypress Grove Estate House"]
              })
            }
          }
        ]
      })
    }));

    vi.stubGlobal("fetch", fetchMock);

    const { createSession: freshCreateSession, signUpload: freshSignUpload, runPipeline: freshRunPipeline, getSessionResult: freshGetSessionResult } = await import("./lib/pipeline.js");

    const session = await freshCreateSession("demo-contractor-token");
    const upload = freshSignUpload({
      sessionId: session.sessionId,
      fileName: "ai-draft.webm",
      mimeType: "audio/webm",
      sizeBytes: 2048,
      idempotencyKey: "ai-draft-upload"
    });

    await freshRunPipeline({
      sessionId: session.sessionId,
      uploadToken: upload.uploadToken,
      idempotencyKey: "ai-draft-pipeline",
      transcriptText: "couple: Alex and Sam. venue: Cypress Grove Estate House. city: Orlando, Florida. style: romantic garden. timeline: sunset ceremony, candlelit dinner, packed dance floor. moments: private vows, confetti exit. portraits: golden hour portraits by the lake. weather: warm and clear. reception: heartfelt speeches, joyful dance floor."
    });

    const result = await freshGetSessionResult(session.sessionId);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/chat/completions"), expect.any(Object));
    expect(result.blogOutput?.primary_title).toContain("Alex and Sam");

    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalApiKey;
    if (originalGenerationModel === undefined) delete process.env.OPENAI_GENERATION_MODEL; else process.env.OPENAI_GENERATION_MODEL = originalGenerationModel;
  });
});