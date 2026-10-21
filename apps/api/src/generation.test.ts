import { afterEach, describe, expect, it, vi } from "vitest";

import { API_CONFIG } from "./config.js";
import { createSession, draftSession } from "./lib/pipeline.js";
import { sessionStore } from "./lib/store.js";

const transcript =
  "We started at Elisha's family home. We suggested the yard for better light for the bridesmaid first look. The best man joked that Thomas would have become a priest. Father Nigel blessed them at the Thomas Center.";

function draft(overrides: Record<string, unknown> = {}) {
  const paragraph = "We walked up to a house full of laughter while the girls finished getting ready together. ".repeat(9).trim();
  return {
    title_descriptor: "refined Catholic",
    event_type: "wedding",
    keyword_phrase: "Classic elegant traditional wedding",
    intro_descriptor: "whimsical, traditional",
    slug_terms: "refined catholic church",
    opening: [paragraph],
    sections: [
      { heading: "A bright, cheerful morning at home", paragraphs: [paragraph, paragraph] },
      { heading: "A traditional Catholic ceremony", paragraphs: [paragraph, paragraph] },
      { heading: "Portraits at the Thomas Center", paragraphs: [paragraph] },
      { heading: "A reception full of laughter", paragraphs: [paragraph] }
    ],
    closing: "Congratulations again, Elisha & Thomas! We wish you so much happiness in the years ahead.",
    seo_description:
      "Elisha & Thomas’s refined Catholic wedding at St. Augustine Catholic Church & Student Center in Gainesville, FL, with Jane Austen-inspired bridal party portraits and a joyful reception at the historic Thomas Center. A traditional Catholic mass ceremony, choreographed first dance, and heartfelt toasts. View their wedding photography and video here!",
    hero_alt_text: "Elisha and Thomas among the columns of the Thomas Center",
    venue_type_term: "historic",
    tags: ["elegant wedding"],
    ...overrides
  };
}

function chatResponse(body: unknown) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }), { status: 200 });
}

function readySession() {
  const { sessionId } = createSession(API_CONFIG.contractorToken);
  sessionStore.updateSession(sessionId, {
    stage: "review_ready",
    transcriptText: transcript,
    recap: {
      couple_names: "Elisha and Thomas",
      venue_name: "Catholic Church and Thomas Center",
      venue_city_state: "Gainesville, Florida",
      wedding_style: "traditional",
      timeline_summary: "home, church, Thomas Center",
      signature_moments: ["choreographed first dance"],
      portrait_notes: "Jane Austen-inspired portraits",
      weather_notes: "sunny, then clouds"
    },
    details: {
      partnerOne: "Elisha",
      partnerTwo: "Thomas",
      ceremonyVenue: { name: "St. Augustine Catholic Church & Student Center", kind: "house_of_worship" },
      receptionVenue: { name: "Thomas Center", kind: "venue" },
      city: "Gainesville",
      state: "FL",
      team: [
        { memberId: "michael-kuo", role: "photo" },
        { memberId: "austin-taft", role: "video" }
      ],
      childrenFeatured: false,
      vendors: [],
      coupleStory: { howTheyMet: "They met at St. Augustine.", funFacts: [], quotes: [] }
    }
  });
  return sessionId;
}

describe("AI generation with house-style revision", () => {
  const originalKey = API_CONFIG.openai.apiKey;

  afterEach(() => {
    API_CONFIG.openai.apiKey = originalKey;
    vi.unstubAllGlobals();
  });

  it("sends the full transcript, asks for one revision when the draft breaks the rules, and assembles the fixed draft", async () => {
    API_CONFIG.openai.apiKey = "test-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          draft({
            sections: [
              { heading: "A Morning of Anticipation: Preparations at Home", paragraphs: [draft().opening[0], draft().opening[0]] },
              ...draft().sections.slice(1)
            ]
          })
        )
      )
      .mockResolvedValueOnce(chatResponse(draft()));
    vi.stubGlobal("fetch", fetchMock);

    const { blogOutput } = await draftSession(readySession());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstRequest = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(firstRequest.messages[1].content).toContain("We suggested the yard for better light");
    const revisionRequest = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(revisionRequest.messages).toHaveLength(4);
    expect(revisionRequest.messages[3].content).toMatch(/split phrase/);

    expect(blogOutput.sections[0].heading).toBe("A bright, cheerful morning at home");
    expect(blogOutput.post_title).toBe(
      "Elisha & Thomas’s refined Catholic wedding at St. Augustine Catholic Church & Student Center and Thomas Center in Gainesville, FL"
    );
    expect(blogOutput.settings.seo_title).toBe("Elisha & Thomas’s refined Catholic wedding at Thomas Center in Gainesville, FL");
    expect(blogOutput.review_flags).toEqual([]);
  });

  it("keeps unresolved issues as review flags instead of failing the recap", async () => {
    API_CONFIG.openai.apiKey = "test-key";
    const stubborn = draft({ closing: "Thank you, Elisha & Thomas!" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(chatResponse(stubborn)).mockResolvedValueOnce(chatResponse(stubborn)));

    const { blogOutput } = await draftSession(readySession());

    expect(blogOutput.review_flags).toContain("The closing paragraph must start with “Congratulations again, …!”.");
  });
});
