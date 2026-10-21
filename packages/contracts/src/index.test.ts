import { describe, expect, it } from "vitest";

import { BlogOutputSchema, RecapSchema, WeddingDetailsSchema } from "./index";

describe("contracts", () => {
  it("validates recap required fields", () => {
    const result = RecapSchema.safeParse({
      couple_names: "Alex and Sam",
      venue_name: "Cypress Grove Estate House",
      venue_city_state: "Orlando, Florida",
      wedding_style: "romantic garden",
      timeline_summary: "sunset ceremony and candlelit dinner",
      signature_moments: ["private vows"],
      portrait_notes: "Golden hour portraits on the lawn",
      weather_notes: "Warm and breezy"
    });

    expect(result.success).toBe(true);
  });

  it("accepts partial wedding details and defaults the lists", () => {
    const details = WeddingDetailsSchema.parse({
      partnerOne: "Elisha",
      partnerTwo: "Thomas",
      ceremonyVenue: { name: "St. Augustine Catholic Church & Student Center", kind: "house_of_worship" },
      team: [{ memberId: "michael-kuo", role: "photo" }]
    });

    expect(details.vendors).toEqual([]);
    expect(details.childrenFeatured).toBe(false);
    expect(details.receptionVenue).toBeUndefined();
  });

  it("rejects team members who are not on the roster", () => {
    const result = WeddingDetailsSchema.safeParse({ team: [{ memberId: "someone-else", role: "photo" }] });
    expect(result.success).toBe(false);
  });

  it("requires a Squarespace-safe slug in the paste sheet", () => {
    const base = {
      post_title: "Alex & Sam’s romantic garden wedding at Cypress Grove Estate House in Orlando, FL",
      keyword_line: "Romantic garden wedding at Cypress Grove Estate House in Orlando, FL | Orlando Wedding Photographer & Videographer",
      intro_credit: "Author Made team photographer Kelly captured this romantic wedding at Cypress Grove Estate House in Orlando, FL.",
      opening: ["Alex & Sam met in college."],
      sections: [
        { heading: "A slow morning", paragraphs: ["Body 1"] },
        { heading: "Vows by the lake", paragraphs: ["Body 2"] }
      ],
      closing: "Congratulations again, Alex & Sam!",
      credits: [{ label: "Author Made Team Photographer", name: "Kelly Jazwa" }],
      settings: {
        excerpt: "Alex & Sam met in college.",
        url_slug: "alex-sam-romantic-garden-wedding-cypress-grove-estate-house-orlando-fl",
        seo_title: "Alex & Sam’s romantic garden wedding",
        seo_description: "Alex & Sam’s garden wedding.",
        categories: ["Recent Weddings", "Kelly"],
        tags: ["garden wedding"],
        hero_alt_text: "Alex and Sam by the lake",
        hero_file_name: "Romantic garden wedding at Cypress Grove Estate House in Orlando, FL – wedding photographer Orlando",
        image_file_prefix: "alex-sam-cypress-grove-estate-house-author-made-photo"
      }
    };

    expect(BlogOutputSchema.safeParse(base).success).toBe(true);
    expect(BlogOutputSchema.safeParse({ ...base, settings: { ...base.settings, url_slug: "Alex Sam!" } }).success).toBe(false);
  });
});
