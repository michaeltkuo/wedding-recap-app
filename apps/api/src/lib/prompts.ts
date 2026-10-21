import type { Recap } from "../contracts.js";

import {
  BANNED_PHRASES,
  BODY_WORD_RANGE,
  EVENT_TYPES,
  GENERIC_TITLE_WORDS,
  REGION_IDS,
  SEO_DESCRIPTION_MAX_CHARS,
  SEO_DESCRIPTION_MIN_CHARS,
  TAG_VOCABULARY,
  hasVideo,
  namedVenues,
  type PostFacts
} from "./house-style/index.js";

// ---------------------------------------------------------------------------
// Extraction: transcript -> structured recap. Keeps story material, not just a list of events.
// ---------------------------------------------------------------------------

export const EXTRACTION_SYSTEM_PROMPT = `Extract a wedding recap object from a photographer's spoken field recap.
Return only facts that are in the transcript.
For anecdotes, quotes, and behind_the_scenes, keep the photographer's specifics: who did or said what, the funny or emotional detail, and any call our team made (moving a shot for better light, sneaking away for portraits). One item per moment, one or two sentences each. Do not summarize them into generic phrases.
quotes are only things someone actually said, as close to verbatim as the transcript allows.`;

export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    couple_names: { type: "string" },
    venue_name: { type: "string" },
    venue_city_state: { type: "string" },
    wedding_style: { type: "string" },
    timeline_summary: { type: "string" },
    signature_moments: { type: "array", items: { type: "string" }, minItems: 1 },
    portrait_notes: { type: "string" },
    weather_notes: { type: "string" },
    vendor_notes: { type: "array", items: { type: "string" } },
    cultural_traditions: { type: "array", items: { type: "string" } },
    reception_highlights: { type: "array", items: { type: "string" } },
    anecdotes: { type: "array", items: { type: "string" } },
    quotes: { type: "array", items: { type: "string" } },
    behind_the_scenes: { type: "array", items: { type: "string" } }
  },
  required: ["couple_names", "venue_name", "venue_city_state", "wedding_style", "timeline_summary", "signature_moments", "portrait_notes", "weather_notes"]
} as const;

// ---------------------------------------------------------------------------
// Generation: facts + transcript -> prose and word choices. Code assembles every templated field.
// ---------------------------------------------------------------------------

// Amy's rewrite of the Elisha & Thomas draft (Oct 2026): the voice to match.
const VOICE_EXAMPLE = `A bright, cheerful morning at home
Elisha & Thomas’s wedding day began at bride Elisha’s family home. You could practically hear the girls laughing as you walked up to the front door, as bride Elisha and her best friends were finishing up final preparations of the morning: last-minute touches to makeup, slipping into heels, a final spritz of hairspray. Elisha and her parents each shared a sentimental first look (with many happy tears involved!). Afterwards, her bridesmaids initially lined up inside the home for a first look with Elisha, but we suggested the yard just outside the home for better lighting, and they all headed outside for what ended up being one of our favorite bride-bridesmaids first looks.

A reception of laughter, blessings, and joy
The pinnacle moment of the reception, though, had to be Elisha & Thomas’s choreographed first dance. Like something out of a Disney movie, the newlyweds sailed around the dance floor, with most guests either dropping jaws in amazement or shedding tears. The father-bride and mother-groom dances followed, and we snuck in a tender shot of Elisha’s mother recording the father-bride dance on her phone (don’t worry, Mom: we filmed it too!).`;

// Published post titles, for the range of title descriptors Amy uses.
const TITLE_EXAMPLES = [
  "Nicole & Jeff’s rainy, heartfelt wedding at Villa Festa in DeLand, FL",
  "Alex & Conner’s morning micro wedding at Walt Disney World’s Swan Hotel in Lake Buena Vista, FL",
  "Irelis & Dillon’s classic elegance wedding at The Baughman Center in Gainesville, FL",
  "Cara & Arthur’s gothic fantasy wedding at Chapel Valley Farm in Eustis, FL",
  "Kaitlin & Josh’s modern art museum wedding at Holy Family Catholic Church & Orlando Museum of Art in Orlando, FL",
  "Olivia & Dustin’s traditional church wedding in Deltona, FL",
  "Gracie & Austin’s romantic country wedding at The Hidden Barn Venue in Apopka, FL",
  "Salena & Ejaaz’s lavish Caribbean-Muslim wedding at Holy Trinity Reception Center in Maitland, FL"
];

const OUTPUT_SHAPE = `{
  "title_descriptor": string,      // 1-4 words before the event type in the title, lowercase except proper nouns, e.g. "rainy, heartfelt", "refined Catholic"
  "event_type": ${EVENT_TYPES.map((type) => `"${type}"`).join(" | ")},
  "keyword_phrase": string,        // starts the keyword line under the hero; search terms people type, ends with the event type, e.g. "Historic home outdoor wedding"
  "intro_descriptor": string,      // 1-2 adjectives for "captured this ___ wedding", e.g. "stately, classic"
  "slug_terms": string,            // SEO words for the URL between the names and the venue, e.g. "intimate", "traditional catholic church"
  "opening": [string],             // 1-2 paragraphs, no heading
  "sections": [{ "heading": string, "paragraphs": [string] }],  // 3-4 sections
  "closing": string,               // one paragraph, starts "Congratulations again, …!"
  "seo_description": string,       // ${SEO_DESCRIPTION_MIN_CHARS}-${SEO_DESCRIPTION_MAX_CHARS} characters
  "hero_alt_text": string,         // one plain sentence describing a likely hero image
  "hero_caption_keywords": [string], // style and venue-type search terms for the hidden hero caption
  "tags": [string],                // 5-12 lowercase tags, preferring the existing list
  "region_guess": ${[...REGION_IDS, "none"].map((id) => `"${id}"`).join(" | ")}  // only used when the city isn't in our region table
}`;

function describeFacts(facts: PostFacts) {
  const team = facts.team.map((credit) => `${credit.member.firstName} (${credit.role})`).join(", ") || "not provided";
  const venues = namedVenues(facts);
  return [
    `Couple: ${facts.partnerOne} & ${facts.partnerTwo}`,
    `Ceremony venue: ${facts.ceremonyVenue ? `${facts.ceremonyVenue.name} (${facts.ceremonyVenue.kind === "house_of_worship" ? "house of worship" : "event venue"})` : "not provided"}`,
    `Reception venue: ${facts.receptionVenue?.name ?? (facts.ceremonyVenue ? "same as ceremony" : "not provided")}`,
    `City: ${facts.city}, ${facts.state}`,
    `Author Made team: ${team}`,
    `Video coverage: ${hasVideo(facts) ? "yes" : "no"}`,
    `Children featured in the story: ${facts.childrenFeatured ? "yes" : "no"}`,
    `Venue names that will appear in the title and keyword line: ${venues.map((venue) => venue.name).join(" and ") || "none (church-only or no venue)"}`
  ].join("\n");
}

function describeCoupleStory(facts: PostFacts) {
  const story = facts.coupleStory;
  if (!story || (!story.howTheyMet && !story.whyThisVenue && story.funFacts.length === 0 && story.quotes.length === 0)) {
    return "Not provided. Open on the most specific, personal moment from the recording instead, and do not invent backstory.";
  }
  return [
    story.howTheyMet ? `How they met: ${story.howTheyMet}` : "",
    story.whyThisVenue ? `Why this venue: ${story.whyThisVenue}` : "",
    story.funFacts.length ? `Fun facts: ${story.funFacts.join("; ")}` : "",
    story.quotes.length ? `Quotes from the couple (verbatim): ${story.quotes.map((quote) => `“${quote}”`).join(" ")}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildGenerationSystemPrompt() {
  return `You write real wedding blog posts for Author Made, a wedding photography and videography studio based in Orlando, FL. You write as the Author Made team ("we"). Output valid JSON only.`;
}

export function buildGenerationPrompt(input: { facts: PostFacts; recap: Recap; transcript: string }) {
  const { facts, recap, transcript } = input;
  return `Write the blog post for this wedding.

WEDDING FACTS (confirmed by the team; use these names and spellings)
${describeFacts(facts)}

COUPLE STORY
${describeCoupleStory(facts)}

STRUCTURED NOTES FROM THE RECORDING
${JSON.stringify(recap, null, 2)}

FULL FIELD RECAP TRANSCRIPT (the photographer talking through the day; this is your main source)
"""
${transcript}
"""

VOICE
- First-person plural, as the Author Made team: "we suggested the yard for better light", "we snuck away with the bridal party".
- Warm, conversational, a little playful, like telling a friend about the day. Not a magazine essay.
- Specific beats generic: who did or said what, the funny or emotional detail, what we did behind the scenes. Pull these from the transcript.
- Parenthetical asides and the occasional exclamation point are welcome.
- Plain modern words. Never use: ${BANNED_PHRASES.join(", ")}.
- Use only facts from the inputs. If a beat isn't there, leave it out. Only put words in quotation marks if they appear in the transcript or the couple story.

STRUCTURE
- opening: 1-2 paragraphs with no heading. Start with the couple: how they met, why this venue, anything distinctive. Use a direct quote from the couple if one is provided (Vogue Weddings caption style).
- sections: 3-4, following the day (getting ready, ceremony, portraits, reception). Skip any part with no material. If the venue is distinctive, one section can talk about the venue from a photographer's point of view.
- Headings: sentence case (capitalize only the first word and proper nouns), one phrase, no colons or dashes. Example: "A bright, cheerful morning at home".
- closing: one paragraph starting "Congratulations again, ${facts.partnerOne} & ${facts.partnerTwo}!" plus one or two warm lines. No heading.
- Body length: ${BODY_WORD_RANGE.min}-${BODY_WORD_RANGE.max} words across opening, sections, and closing.

VOICE EXAMPLE (Amy's own rewrite; match this voice, not its facts)
"""
${VOICE_EXAMPLE}
"""

TITLE
The code builds: "[Bride] & [Groom]’s [title_descriptor] [event_type] at [venue] in [city], FL". You only supply title_descriptor and event_type.
- Be creative and specific to the wedding's look and feel. Avoid: ${GENERIC_TITLE_WORDS.join(", ")}.
- Published examples:
${TITLE_EXAMPLES.map((title) => `  - ${title}`).join("\n")}

SEO FIELDS
- keyword_phrase: keyword-heavy, less artistic (venue type, style, setting). Don't repeat words that are already in the venue names.
- slug_terms: only words with search value (intimate, micro, garden, chapel, catholic); drop words like "heartfelt".
- seo_description: what shows in Google results. Readable and worth clicking, but packed with search terms (e.g. "Christian indoor wedding ceremony" rather than "Christian wedding"). End with a short call to view the gallery.
- tags: prefer these existing tags: ${TAG_VOCABULARY.join(", ")}.

Return JSON with exactly this shape:
${OUTPUT_SHAPE}`;
}

export function buildRevisionPrompt(issues: string[]) {
  return `Your draft broke these house-style rules. Return the full JSON again with every issue fixed and nothing else changed unnecessarily:
${issues.map((issue) => `- ${issue}`).join("\n")}`;
}
