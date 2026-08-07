import { describe, expect, it } from "vitest";

import { BlogOutputSchema, RecapSchema, validateBlogTitle } from "./index";

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

  it("requires enough narrative structure in blog output", () => {
    const result = BlogOutputSchema.safeParse({
      primary_title: "Alex and Sam Romantic Wedding at Cypress Grove Estate House Orlando Florida",
      meta_description: "An Orlando wedding recap at Cypress Grove Estate House.",
      h2_outline: ["Context", "Ceremony", "Portraits", "Reception"],
      section_blocks: [
        { heading: "Context", body: "Body 1" },
        { heading: "Ceremony", body: "Body 2" },
        { heading: "Portraits", body: "Body 3" },
        { heading: "Reception", body: "Body 4" }
      ],
      recommended_image_slugs: ["orlando-cypress-grove-estate-house-wedding"]
    });

    expect(result.success).toBe(true);
  });

  it("checks that titles include couple and venue signals", () => {
    expect(
      validateBlogTitle("Alex and Sam Romantic Wedding at Cypress Grove Estate House Orlando Florida", {
        couple_names: "Alex and Sam",
        venue_name: "Cypress Grove Estate House",
        venue_city_state: "Orlando, Florida"
      })
    ).toBe(true);
  });
});