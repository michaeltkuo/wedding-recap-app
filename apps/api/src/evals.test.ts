import { describe, expect, it } from "vitest";

import type { WeddingDetailsInput } from "./contracts.js";
import { runPipeline, signUpload, createSession, draftSession, getSessionResult, uploadAudio } from "./lib/pipeline.js";
import { API_CONFIG } from "./config.js";

const baselineFixtures: Array<{ name: string; transcriptText: string; details?: WeddingDetailsInput; expected: Record<string, string> }> = [
  {
    name: "happy-path-orlando-venue",
    transcriptText:
      "couple: Alex and Sam. venue: Cypress Grove Estate House. city: Orlando, Florida. style: romantic garden. timeline: sunset ceremony, candlelit dinner, packed dance floor. moments: private vows, confetti exit. portraits: soft lakeside portraits. weather: warm and clear. reception: crowded dance floor, heartfelt toasts.",
    details: {
      partnerOne: "Alex",
      partnerTwo: "Sam",
      ceremonyVenue: { name: "Cypress Grove Estate House" },
      city: "Orlando",
      team: [
        { memberId: "kelly-jazwa", role: "photo" },
        { memberId: "rob-shannon", role: "video" }
      ]
    },
    expected: {
      post_title: "Alex & Sam’s romantic garden wedding at Cypress Grove Estate House in Orlando, FL",
      intro_credit:
        "Author Made team photographer Kelly with team videographer Rob captured this romantic garden wedding at Cypress Grove Estate House in Orlando, FL.",
      url_slug: "alex-sam-romantic-garden-wedding-cypress-grove-estate-house-orlando-fl"
    }
  },
  {
    name: "recording-only-central-florida",
    transcriptText:
      "couple: Jamie and Riley. venue: Bella Collina. city: Montverde, Florida. style: editorial classic. timeline: chapel ceremony and lively reception. moments: first look, champagne tower. portraits: terrace portraits at sunset. weather: dry and breezy. reception: packed dance floor, live band.",
    expected: {
      post_title: "Jamie & Riley’s editorial classic wedding at Bella Collina in Montverde, FL",
      url_slug: "jamie-riley-editorial-classic-wedding-bella-collina-montverde-fl"
    }
  }
];

describe("eval gates", () => {
  it("assembles house-style fields for every fixture", async () => {
    for (const fixture of baselineFixtures) {
      const session = createSession(API_CONFIG.contractorToken);
      const upload = signUpload({
        sessionId: session.sessionId,
        fileName: `${fixture.name}.webm`,
        mimeType: "audio/webm",
        sizeBytes: 2048,
        idempotencyKey: `eval-upload-${fixture.name}`
      });

      uploadAudio(upload.uploadToken, Buffer.alloc(2048, 1), "audio/webm");

      await runPipeline({
        sessionId: session.sessionId,
        uploadToken: upload.uploadToken,
        idempotencyKey: `eval-pipeline-${fixture.name}`,
        transcriptText: fixture.transcriptText,
        details: fixture.details,
        simulate: { extractionMode: "normal" }
      });

      await draftSession(session.sessionId);

      const output = getSessionResult(session.sessionId).blogOutput;
      expect(output?.post_title).toBe(fixture.expected.post_title);
      expect(output?.settings.url_slug).toBe(fixture.expected.url_slug);
      if (fixture.expected.intro_credit) {
        expect(output?.intro_credit).toBe(fixture.expected.intro_credit);
      }
      expect(output?.sections.length).toBeGreaterThanOrEqual(3);
      expect(output?.closing.startsWith("Congratulations again")).toBe(true);
    }
  });

  it("flags missing team details when the recap came from the recording alone", async () => {
    const session = createSession(API_CONFIG.contractorToken);
    const upload = signUpload({
      sessionId: session.sessionId,
      fileName: "flags.webm",
      mimeType: "audio/webm",
      sizeBytes: 2048,
      idempotencyKey: "eval-upload-flags"
    });
    uploadAudio(upload.uploadToken, Buffer.alloc(2048, 1), "audio/webm");
    await runPipeline({
      sessionId: session.sessionId,
      uploadToken: upload.uploadToken,
      idempotencyKey: "eval-pipeline-flags",
      transcriptText: baselineFixtures[1].transcriptText,
      simulate: { extractionMode: "normal" }
    });
    await draftSession(session.sessionId);

    const flags = getSessionResult(session.sessionId).blogOutput?.review_flags.join(" ") ?? "";
    expect(flags).toMatch(/No team members were selected/);
    expect(flags).toMatch(/Couple names came from the recording/);
  });
});
