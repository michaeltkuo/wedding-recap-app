import { describe, expect, it } from "vitest";

import type { BlogOutput } from "../contracts.js";

import { buildDocRequests, buildPasteSheet } from "./google-docs.js";

const blogOutput: BlogOutput = {
  post_title: "Nicole & Jeff’s rainy, heartfelt wedding at Villa Festa in DeLand, FL",
  keyword_line: "Historic home outdoor wedding at Villa Festa in DeLand, FL | Orlando Wedding Photographer & Videographer",
  intro_credit: "Author Made team photographer Kelly with creative lead and co-owner Michael (on video) captured this rainy, heartfelt wedding.",
  opening: ["We firmly believe that rain IS good luck."],
  sections: [
    { heading: "The happiest of tears", paragraphs: ["Villa Festa kept everyone dry."] },
    { heading: "Then the sun came out", paragraphs: ["The dance floor came alive."] }
  ],
  closing: "Congratulations again, Nicole & Jeff!",
  venue_review_link: {
    text: "Read our full wedding venue review of Villa Festa",
    url: "https://www.authormadephoto.com/blog/wedding-venue-review-villa-festa-deland-fl",
    afterSection: 0
  },
  credits: [
    { label: "Author Made Team Photographer", name: "Kelly Jazwa" },
    { label: "Venue", name: "Villa Festa", url: "https://villafestaflorida.com/" }
  ],
  kids_note: "Special note: We do not share images that feature children.",
  settings: {
    excerpt: "We firmly believe that rain IS good luck. View their full wedding photography gallery here!",
    url_slug: "nicole-jeff-rainy-heartfelt-wedding-villa-festa-deland-fl",
    seo_title: "Nicole & Jeff’s rainy, heartfelt wedding at Villa Festa in DeLand, FL | Orlando Wedding Photography",
    seo_description: "Nicole & Jeff may have had rain at their outdoor wedding.",
    categories: ["Recent Weddings", "Kelly", "Michael K"],
    tags: ["wedding", "villa festa"],
    hero_alt_text: "Nicole and Jeff under an umbrella",
    hero_file_name: "Outdoor wedding at historic home wedding venue Villa Festa in DeLand, FL – wedding photographer DeLand",
    image_file_prefix: "nicole-jeff-villa-festa-author-made-photo"
  },
  review_flags: ["Confirm the vendor list."]
};

describe("Google Doc paste sheet", () => {
  it("orders the body the way it is pasted into Squarespace", () => {
    const texts = buildPasteSheet(blogOutput).map((paragraph) => paragraph.text);
    const bodyStart = texts.indexOf("Body copy (paste into the post)");
    expect(texts.slice(bodyStart + 1, bodyStart + 8)).toEqual([
      blogOutput.keyword_line,
      blogOutput.intro_credit,
      "We firmly believe that rain IS good luck.",
      "The happiest of tears",
      "Villa Festa kept everyone dry.",
      "Read our full wedding venue review of Villa Festa",
      "Then the sun came out"
    ]);
    expect(texts).toContain("Venue: Villa Festa");
    expect(texts).toContain("Post URL: nicole-jeff-rainy-heartfelt-wedding-villa-festa-deland-fl");
    expect(texts.indexOf("• Confirm the vendor list.")).toBeLessThan(bodyStart);
  });

  it("styles headings, italics, and links at the right document indexes", () => {
    const paragraphs = buildPasteSheet(blogOutput);
    const requests = buildDocRequests(paragraphs);
    const fullText = requests[0].insertText?.text ?? "";
    const textAt = (start: number, end: number) => fullText.slice(start - 1, end - 1);

    const headingRanges = requests
      .filter((request) => request.updateParagraphStyle?.paragraphStyle?.namedStyleType === "HEADING_3")
      .map((request) => textAt(request.updateParagraphStyle!.range!.startIndex!, request.updateParagraphStyle!.range!.endIndex!));
    expect(headingRanges).toEqual([`${blogOutput.keyword_line}\n`, "The happiest of tears\n", "Then the sun came out\n"]);

    const italicRanges = requests
      .filter((request) => request.updateTextStyle?.textStyle?.italic)
      .map((request) => textAt(request.updateTextStyle!.range!.startIndex!, request.updateTextStyle!.range!.endIndex!));
    expect(italicRanges).toEqual([blogOutput.intro_credit, "Read our full wedding venue review of Villa Festa", blogOutput.kids_note]);

    const linkRanges = requests
      .filter((request) => request.updateTextStyle?.textStyle?.link)
      .map((request) => [textAt(request.updateTextStyle!.range!.startIndex!, request.updateTextStyle!.range!.endIndex!), request.updateTextStyle!.textStyle!.link!.url]);
    expect(linkRanges).toEqual([
      ["Read our full wedding venue review of Villa Festa", blogOutput.venue_review_link!.url],
      ["Villa Festa", "https://villafestaflorida.com/"]
    ]);
  });
});
