import { describe, expect, it } from "vitest";

import { WeddingDetailsSchema, type WeddingDetailsInput } from "../../contracts.js";

import {
  assembleBlogOutput,
  buildCredits,
  buildHeroFileName,
  buildIntroCredit,
  buildKeywordLine,
  buildPostTitle,
  buildTeamCredit,
  buildUrlSlug,
  collectProperNouns,
  findBannedPhrases,
  findForbiddenTopics,
  findRepeatedKeywordWords,
  findUnsupportedQuotes,
  lintGeneratedPost,
  lintHeading,
  resolvePostFacts,
  slugify,
  type GeneratedPost
} from "./index.js";

function factsFor(details: WeddingDetailsInput) {
  return resolvePostFacts(undefined, WeddingDetailsSchema.parse(details));
}

const elishaThomas = factsFor({
  partnerOne: "Elisha",
  partnerTwo: "Thomas",
  ceremonyVenue: { name: "St. Augustine Catholic Church & Student Center", kind: "house_of_worship" },
  receptionVenue: { name: "Thomas Center" },
  city: "Gainesville",
  state: "FL",
  team: [
    { memberId: "michael-kuo", role: "photo" },
    { memberId: "austin-taft", role: "video" }
  ]
});

function generated(overrides: Partial<GeneratedPost> = {}): GeneratedPost {
  const paragraph = "We arrived to a house full of laughter and happy tears as everyone finished getting ready together. ".repeat(8).trim();
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
      { heading: "Whimsical portraits inspired by Jane Austen", paragraphs: [paragraph] },
      { heading: "A reception of laughter, blessings, and joy", paragraphs: [paragraph] }
    ],
    closing: "Congratulations again, Elisha & Thomas! It was a joy and honor to be a part of your wedding day.",
    seo_description:
      "Elisha & Thomas’s refined Catholic wedding at St. Augustine Catholic Church & Student Center in Gainesville, FL, followed by whimsical Jane Austen-inspired bridal party portraits and a joyful reception at the historic Thomas Center. A traditional Catholic mass ceremony, choreographed first dance, and heartfelt toasts. View their wedding photography and video here!",
    hero_alt_text: "Elisha and Thomas among the columns of the Thomas Center",
    venue_type_term: "historic",
    tags: ["chapel wedding", "elegant wedding", "historic wedding venue"],
    region_guess: "none",
    ...overrides
  };
}

describe("house style: Elisha & Thomas (church ceremony, separate reception)", () => {
  it("builds the post title in Amy's format with both venues", () => {
    expect(buildPostTitle(elishaThomas, generated())).toBe(
      "Elisha & Thomas’s refined Catholic wedding at St. Augustine Catholic Church & Student Center and Thomas Center in Gainesville, FL"
    );
  });

  it("credits Michael on photo with Austin on video, and keeps Gainesville as its own market", () => {
    expect(buildIntroCredit(elishaThomas, generated(), elishaThomas.region)).toBe(
      "Author Made creative lead and co-owner Michael (on photo) with team videographer Austin captured this whimsical, traditional wedding at St. Augustine Catholic Church & Student Center with a wedding reception at Thomas Center in Gainesville, FL."
    );
  });

  it("keeps only the event venue in the URL", () => {
    expect(buildUrlSlug(elishaThomas, generated())).toBe("elisha-thomas-refined-catholic-church-wedding-thomas-center-gainesville-fl");
  });

  it("lists team, both venues, and categories the way published posts do", () => {
    const output = assembleBlogOutput(elishaThomas, generated());
    expect(output.credits.slice(0, 4)).toEqual([
      { label: "Author Made Team Photographer", name: "Michael Kuo" },
      { label: "Author Made Team Videographer", name: "Austin Taft" },
      { label: "Ceremony Venue", name: "St. Augustine Catholic Church & Student Center" },
      { label: "Reception Venue", name: "Thomas Center" }
    ]);
    expect(output.settings.categories).toEqual(["Recent Weddings", "Michael K", "Austin"]);
    expect(output.settings.excerpt.endsWith("View their full wedding photography and videography gallery here!")).toBe(true);
    expect(output.settings.tags).toEqual(expect.arrayContaining(["wedding", "real wedding", "wedding photography", "wedding videography", "thomas center"]));
    expect(output.settings.hero_file_name).toBe(
      "Classic elegant traditional wedding at St. Augustine Catholic Church & Student Center with a wedding reception at Thomas Center in Gainesville, FL – wedding photographer Clermont Winter Garden Apopka Winter Park Orlando Gainesville Central Florida – best affordable wedding venues Orlando – unique wedding venues in Central Florida – micro wedding venues in Orlando – historic wedding venues Orlando Central Florida – best wedding photographer Orlando – Author Made affordable wedding photographer videographer near me – best Orlando wedding photographer near me"
    );
    expect(output.kids_note).toBeUndefined();
  });
});

describe("house style: matches published posts", () => {
  it("Alex & Conner: two photographers, Michael leads", () => {
    const facts = factsFor({
      partnerOne: "Alex",
      partnerTwo: "Conner",
      ceremonyVenue: { name: "Walt Disney World’s Swan Hotel" },
      city: "Lake Buena Vista",
      team: [
        { memberId: "kelly-jazwa", role: "photo" },
        { memberId: "michael-kuo", role: "photo" }
      ]
    });
    const post = generated({ title_descriptor: "morning", event_type: "micro wedding", intro_descriptor: "romantic" });

    expect(buildPostTitle(facts, post)).toBe("Alex & Conner’s morning micro wedding at Walt Disney World’s Swan Hotel in Lake Buena Vista, FL");
    expect(buildIntroCredit(facts, post, facts.region)).toBe(
      "Author Made creative lead and co-owner Michael (on photo) with team photographer Kelly captured this romantic micro wedding at Walt Disney World’s Swan Hotel in Lake Buena Vista, Orlando, FL."
    );
    expect(buildCredits(facts)[0]).toEqual({ label: "Author Made Team Photographers", name: "Michael Kuo & Kelly Jazwa" });
  });

  it("Barbara & Robert: two event venues", () => {
    const facts = factsFor({
      partnerOne: "Barbara",
      partnerTwo: "Robert",
      ceremonyVenue: { name: "Leu Gardens" },
      receptionVenue: { name: "Winter Park Country Club" },
      city: "Orlando",
      team: [
        { memberId: "maddie-zahn", role: "photo" },
        { memberId: "rob-shannon", role: "video" }
      ]
    });
    const post = generated({ title_descriptor: "winter", slug_terms: "winter" });

    expect(buildPostTitle(facts, post)).toBe("Barbara & Robert’s winter wedding at Leu Gardens and Winter Park Country Club in Orlando, FL");
    expect(buildUrlSlug(facts, post)).toBe("barbara-robert-winter-wedding-leu-gardens-and-winter-park-country-club-orlando-fl");
    expect(buildTeamCredit(facts)).toBe("team photographer Maddie with team videographer Rob");
  });

  it("Olivia & Dustin: church-only weddings name no venue", () => {
    const facts = factsFor({
      partnerOne: "Olivia",
      partnerTwo: "Dustin",
      ceremonyVenue: { name: "First Baptist Church of Deltona", kind: "house_of_worship" },
      city: "Deltona",
      team: [{ memberId: "michael-kuo", role: "photo" }]
    });
    const post = generated({ title_descriptor: "traditional", event_type: "wedding", slug_terms: "traditional church", keyword_phrase: "A traditional church wedding" });

    expect(buildPostTitle(facts, post)).toBe("Olivia & Dustin’s traditional wedding in Deltona, FL");
    expect(buildUrlSlug(facts, post)).toBe("olivia-dustin-traditional-church-wedding-deltona-fl");
    expect(buildKeywordLine(facts, post.keyword_phrase)).toBe("A traditional church wedding in Deltona, FL | Orlando Wedding Photographer & Videographer");
  });

  it("Nicole & Jeff: kids note, venue review link, and region outside metro Orlando", () => {
    const facts = factsFor({
      partnerOne: "Nicole",
      partnerTwo: "Jeff",
      ceremonyVenue: { name: "Villa Festa", url: "https://villafestaflorida.com/" },
      city: "DeLand",
      childrenFeatured: true,
      team: [
        { memberId: "kelly-jazwa", role: "photo" },
        { memberId: "michael-kuo", role: "video" }
      ]
    });
    const post = generated({ title_descriptor: "rainy, heartfelt", intro_descriptor: "rainy, heartfelt" });
    post.sections[1] = { heading: "Villa Festa in the rain", paragraphs: ["Villa Festa handled the storm beautifully, and the pavilion kept everyone dry."] };
    const output = assembleBlogOutput(facts, post);

    expect(output.intro_credit).toBe(
      "Author Made team photographer Kelly with creative lead and co-owner Michael (on video) captured this rainy, heartfelt wedding at Villa Festa in DeLand outside metro Orlando, FL."
    );
    expect(output.kids_note).toMatch(/^Special note: We do not share images that feature children/);
    expect(output.venue_review_link).toEqual({
      text: "Read our full wedding venue review of Villa Festa",
      url: "https://www.authormadephoto.com/blog/wedding-venue-review-villa-festa-deland-fl",
      afterSection: 1
    });
    expect(output.credits[2]).toEqual({ label: "Venue", name: "Villa Festa", url: "https://villafestaflorida.com/" });
  });
});

describe("house style: fallbacks and flags", () => {
  it("flags missing intake details instead of guessing silently", () => {
    const facts = resolvePostFacts(
      {
        couple_names: "Elisha and Thomas",
        venue_name: "Catholic Church and Thomas Center",
        venue_city_state: "Gainesville, Florida",
        wedding_style: "traditional",
        timeline_summary: "ceremony then reception",
        signature_moments: ["first dance"],
        portrait_notes: "columns",
        weather_notes: "sunny"
      },
      undefined
    );

    expect(facts.partnerOne).toBe("Elisha");
    expect(facts.state).toBe("FL");
    expect(facts.ceremonyVenue?.kind).toBe("house_of_worship");
    expect(facts.flags.join(" ")).toMatch(/No team members were selected/);
    expect(facts.flags.join(" ")).toMatch(/came from the recording/);
  });

  it("uses the model's region guess for unknown cities and asks for confirmation", () => {
    const facts = factsFor({ partnerOne: "Lauren", partnerTwo: "Brett", ceremonyVenue: { name: "Harbour House" }, city: "Indian Harbour Beach" });
    const output = assembleBlogOutput(facts, generated({ region_guess: "central_florida" }));
    expect(output.intro_credit).toMatch(/in Indian Harbour Beach, Central Florida\.$/);
    expect(output.review_flags.join(" ")).toMatch(/isn’t in the region table/);
  });

  it("slugifies names with apostrophes, ampersands, and accents", () => {
    expect(slugify("Walt Disney World’s Swan Hotel")).toBe("walt-disney-world-swan-hotel");
    expect(slugify("Maitland Art & History Museums")).toBe("maitland-art-and-history-museums");
    expect(slugify("Bynx Café")).toBe("bynx-cafe");
  });
});

describe("house style lint: Amy's comments as regression tests", () => {
  const nouns = collectProperNouns(elishaThomas, "We met Elisha at St. Augustine. Then Father Nigel blessed them at the Thomas Center.");

  it("rejects split-phrase headings (“do not do split-phrase headings”)", () => {
    expect(lintHeading("A Morning of Anticipation: Preparations at Home", nouns).join(" ")).toMatch(/split phrase/);
  });

  it("rejects title case (“we only capitalize the first word and proper nouns”)", () => {
    expect(lintHeading("A traditional Catholic Ceremony steeped in meaning", nouns)).toEqual([
      "Heading “A traditional Catholic Ceremony steeped in meaning” must be sentence case; lowercase: Ceremony."
    ]);
    expect(lintHeading("Portraits at the Thomas Center", nouns)).toEqual([]);
    expect(lintHeading("Jane Austen-inspired portraits at Elisha’s church", nouns)).toEqual([]);
  });

  it("rejects 1810s vocabulary (“what is this, the 1810s?!”)", () => {
    expect(findBannedPhrases("portraits that captured both reverence and revelry, a tapestry of joy")).toEqual(["tapestry", "revelry"]);
  });

  it("catches repeated keywords (“I have historic twice in here”)", () => {
    expect(findRepeatedKeywordWords("Historic chapel micro wedding", ["Historic Andrews Chapel"])).toEqual(["historic", "chapel"]);
  });

  it("catches quotes that aren't in the recording", () => {
    expect(findUnsupportedQuotes("The groom said “I would become a priest if this failed” with a grin.", ["He joked he'd become a priest."])).toEqual([
      "I would become a priest if this failed"
    ]);
    expect(findUnsupportedQuotes("He told us “we filmed it too” afterwards.", ["and we filmed it too, of course"])).toEqual([]);
  });

  it("passes a draft that follows the house style", () => {
    expect(lintGeneratedPost(generated(), elishaThomas, "Father Nigel blessed them. Jane Austen inspired the portraits.").issues).toEqual([]);
  });
});

describe("house style: hero image keyword string", () => {
  it("reproduces the published Irelis & Dillon hero file name", () => {
    const facts = factsFor({ partnerOne: "Irelis", partnerTwo: "Dillon", ceremonyVenue: { name: "Baughman Center" }, city: "Gainesville" });
    expect(buildHeroFileName(facts, { keyword_phrase: "Classic elegant church indoor chapel wedding", venue_type_term: "outdoor" })).toBe(
      "Classic elegant church indoor chapel wedding at Baughman Center in Gainesville, FL – wedding photographer Clermont Winter Garden Apopka Winter Park Orlando Gainesville Central Florida – best affordable wedding venues Orlando – unique wedding venues in Central Florida – micro wedding venues in Orlando – outdoor wedding venues Orlando Central Florida – best wedding photographer Orlando – Author Made affordable wedding photographer videographer near me – best Orlando wedding photographer near me"
    );
  });
});

describe("house style stance: Alison & Nick (Oct 2026 tone review)", () => {
  // Amy's verdict on the generated draft was "this sucks". Every excerpt below is verbatim from it.
  const draftExcerpts: Array<[string, string]> = [
    ["medical", "Alison’s parents couldn’t make it due to her father’s medical condition and some travel logistics"],
    ["vendor_performance", "There was no coordinator, so as soon as everyone arrived, the chaos hit its peak"],
    ["vendor_performance", "sprinting to his car for a backup after the first one died, causing a 10-minute delay"],
    ["our_equipment", "dodging technical hiccups (camera sensors and all), we stayed on our toes"],
    ["discomfort", "Nick was sweating so much, and he is not a fan of Florida’s heat"],
    ["discomfort", "the ballroom was still muggy and a little buggy"],
    ["discomfort", "Alison was hot, tired, and ready to be done"],
    ["property_safety", "an Airbnb with a dedicated ballroom space, but no main power after a previous electrical fire"],
    ["mood_concession", "everyone powered through, and we did our best to keep the energy positive"],
    ["mood_concession", "With Alison’s family missing, there was a bittersweet feeling in the air"]
  ];

  for (const [topicId, excerpt] of draftExcerpts) {
    it(`flags ${topicId}: ${excerpt.slice(0, 48)}…`, () => {
      expect(findForbiddenTopics(excerpt).map((topic) => topic.id)).toContain(topicId);
    });
  }

  // The published posts name hard things and resolve them. None of this may trip the stance rules,
  // or the pipeline would reject Author Made's own best work.
  const publishedExcerpts: Array<[string, string]> = [
    [
      "Nicole & Jeff: the storm, named and closed",
      "Then the storm arrived. For a little while, everyone simply waited. Rain poured down, decorations were hurried under cover, and the original timeline disappeared. But as soon as there was a break in the weather, everyone adapted and the ceremony moved forward."
    ],
    [
      "Nicole & Jeff: the venue praised for absorbing the problem",
      "One thing we especially appreciate about Villa Festa is how flexible the property is when Florida weather inevitably decides to do its own thing. The transition was smooth, guests stayed dry, and once the rain passed, we were still able to explore the property for portraits."
    ],
    [
      "Nicole & Jeff: a death in the family, handled with dignity",
      "In honor of Nicole’s brother, who had passed away less than a year earlier, a special song played before she walked down the aisle. You could feel the weight of the moment throughout the ceremony."
    ],
    [
      "Nicole & Jeff: the closing pivot",
      "Yes, the weather forced everyone to pivot. But none of that is what we’ll remember first. We’ll remember Jeff struggling to read his vows because he was overwhelmed with emotion."
    ],
    [
      "Amber & Phillip: chaos that belongs to the couple",
      "Amber & Phillip’s wedding day was riotous fun, a perfect reflection of their relationship as best friends and their chaotic yet laid-back personalities. Between the quiet tears during their vows and the absolute chaos of the dance floor, their wedding never tried to be anything other than what it was."
    ],
    [
      "Amber & Phillip: a plan that fell through, as a setup",
      "Phillip originally planned to propose in Nashville, but when the ring didn’t arrive in time, he pivoted. With the help of a friend, he pulled off a sunset proposal on a boat, dolphins in the background."
    ],
    [
      "Amber & Phillip: a modest venue, framed by what it offered",
      "Set on a friend’s property in Arcadia, this wedding leaned fully into the rustic, outdoor vibe. It was about having the space to bring their people together and celebrate without limitations."
    ]
  ];

  for (const [label, excerpt] of publishedExcerpts) {
    it(`leaves published copy alone — ${label}`, () => {
      expect(findForbiddenTopics(excerpt)).toEqual([]);
    });
  }
});
