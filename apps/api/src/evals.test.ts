import { describe, expect, it } from "vitest";

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

describe("eval gates", () => {
  it("meets baseline title and section thresholds for all fixtures", async () => {
    const results = [] as boolean[];

    for (const fixture of baselineFixtures) {
      const session = createSession(API_CONFIG.contractorToken);
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
        transcriptText: fixture.transcriptText,
        simulate: { extractionMode: "normal" }
      });

      const result = getSessionResult(session.sessionId);
      const title = result.blogOutput?.primary_title.toLowerCase() ?? "";
      const hasAllTerms = fixture.expectedTitleTerms.every((term) => title.includes(term));
      const enoughSections = (result.blogOutput?.section_blocks.length ?? 0) >= 4;
      results.push(hasAllTerms && enoughSections);
    }

    const passRate = results.filter(Boolean).length / results.length;
    expect(passRate).toBeGreaterThanOrEqual(1);
  });
});