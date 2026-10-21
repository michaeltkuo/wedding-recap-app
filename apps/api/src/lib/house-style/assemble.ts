import { BlogOutputSchema, type BlogOutput, type CreditLine, type TeamRole } from "../../contracts.js";

import {
  BASE_TAGS,
  KEYWORD_LINE_SUFFIX,
  KIDS_NOTE,
  REGIONS,
  SEO_TITLE_MAX_CHARS,
  SEO_TITLE_SUFFIX,
  TAG_VOCABULARY,
  VENUE_SPOTLIGHTS,
  galleryCallToAction,
  type RegionId
} from "./config.js";
import { hasVideo, namedVenues, slugVenues, type PostFacts, type TeamCredit } from "./facts.js";
import type { GeneratedPost } from "./generated.js";
import { capitalizeFirst, dedupeCaseInsensitive, joinWithAnd, normalizeForMatch, slugify } from "./text.js";

const ROLE_ORDER: TeamRole[] = ["photo", "video", "assistant"];
const ROLE_NOUN: Record<TeamRole, string> = { photo: "photographer", video: "videographer", assistant: "assistant" };
const ROLE_ON: Record<TeamRole, string> = { photo: "on photo", video: "on video", assistant: "assisting" };
const CREDIT_LABEL: Record<TeamRole, string> = {
  photo: "Author Made Team Photographer",
  video: "Author Made Team Videographer",
  assistant: "Author Made Team Assistant"
};

function creditsByRole(facts: PostFacts) {
  return ROLE_ORDER.map((role) => ({
    role,
    credits: facts.team
      .filter((credit) => credit.role === role)
      // Michael leads within his role group, as in "creative lead and co-owner Michael (on photo) with team photographer Kelly".
      .sort((left, right) => Number(Boolean("title" in right.member)) - Number(Boolean("title" in left.member)))
  })).filter((group) => group.credits.length > 0);
}

function describeTitled(credit: TeamCredit, teamSize: number) {
  const title = "title" in credit.member ? credit.member.title : "";
  return `${title} ${credit.member.firstName}${teamSize > 1 ? ` (${ROLE_ON[credit.role]})` : ""}`;
}

// "Author Made creative lead and co-owner Michael (on photo) with team videographer Austin captured this …"
export function buildTeamCredit(facts: PostFacts) {
  const parts: string[] = [];
  for (const group of creditsByRole(facts)) {
    const titled = group.credits.filter((credit) => "title" in credit.member);
    const crew = group.credits.filter((credit) => !("title" in credit.member));
    parts.push(...titled.map((credit) => describeTitled(credit, facts.team.length)));
    if (crew.length > 0) {
      const noun = `team ${ROLE_NOUN[group.role]}${crew.length > 1 ? "s" : ""}`;
      parts.push(`${noun} ${joinWithAnd(crew.map((credit) => credit.member.firstName))}`);
    }
  }

  if (parts.length === 0) {
    return "[team member]";
  }
  return parts.length === 1 ? parts[0] : `${parts[0]} with ${joinWithAnd(parts.slice(1))}`;
}

function venuePhrase(facts: PostFacts, receptionJoiner: string) {
  const venues = namedVenues(facts);
  if (venues.length === 0) {
    return "";
  }
  if (venues.length === 2) {
    return ` at ${venues[0].name}${receptionJoiner}${venues[1].name}`;
  }
  return ` at ${venues[0].name}`;
}

export function buildPostTitle(facts: PostFacts, generated: Pick<GeneratedPost, "title_descriptor" | "event_type">) {
  return `${facts.partnerOne} & ${facts.partnerTwo}’s ${generated.title_descriptor} ${generated.event_type}${venuePhrase(facts, " and ")} in ${facts.city}, ${facts.state}`;
}

export function buildKeywordLine(facts: PostFacts, keywordPhrase: string) {
  return `${capitalizeFirst(keywordPhrase)}${venuePhrase(facts, " with a wedding reception at ")} in ${facts.city}, ${facts.state} | ${KEYWORD_LINE_SUFFIX}`;
}

export function introLocation(facts: PostFacts, region: RegionId | undefined) {
  if (facts.state !== "FL") {
    return `${facts.city}, ${facts.state}`;
  }
  return region ? REGIONS[region].introLocation(facts.city) : `${facts.city}, FL`;
}

export function buildIntroCredit(facts: PostFacts, generated: Pick<GeneratedPost, "intro_descriptor" | "event_type">, region: RegionId | undefined) {
  return `Author Made ${buildTeamCredit(facts)} captured this ${generated.intro_descriptor} ${generated.event_type}${venuePhrase(facts, " with a wedding reception at ")} in ${introLocation(facts, region)}.`;
}

// bride-groom-[terms]-wedding-[event venues]-[city]-fl
export function buildUrlSlug(facts: PostFacts, generated: Pick<GeneratedPost, "slug_terms" | "event_type">) {
  const terms = slugify(generated.slug_terms);
  const eventSlug = slugify(generated.event_type);
  const termsWithEvent = terms.endsWith(eventSlug) || terms.endsWith("wedding") ? terms : [terms, eventSlug].filter(Boolean).join("-");
  const venues = slugVenues(facts).map((venue) => slugify(venue.name)).join("-and-");
  return [slugify(facts.partnerOne), slugify(facts.partnerTwo), termsWithEvent, venues, slugify(facts.city), slugify(facts.state)]
    .filter(Boolean)
    .join("-");
}

export function buildCredits(facts: PostFacts): CreditLine[] {
  const lines: CreditLine[] = creditsByRole(facts).map((group) => ({
    label: `${CREDIT_LABEL[group.role]}${group.credits.length > 1 ? "s" : ""}`,
    name: group.credits.map((credit) => credit.member.fullName).join(" & ")
  }));

  if (facts.ceremonyVenue && facts.receptionVenue) {
    lines.push({ label: "Ceremony Venue", name: facts.ceremonyVenue.name, url: facts.ceremonyVenue.url });
    lines.push({ label: "Reception Venue", name: facts.receptionVenue.name, url: facts.receptionVenue.url });
  } else {
    const venue = facts.ceremonyVenue ?? facts.receptionVenue;
    if (venue) {
      lines.push({ label: "Venue", name: venue.name, url: venue.url });
    }
  }

  lines.push(...facts.vendors.map((vendor) => ({ label: vendor.role, name: vendor.name, url: vendor.url })));
  return lines;
}

export function buildCategories(facts: PostFacts) {
  return dedupeCaseInsensitive(["Recent Weddings", ...facts.team.map((credit) => credit.member.category)]);
}

// Squarespace caps SEO titles at 100 characters. Long two-venue titles drop to the event venue, then to no venue.
export function buildSeoTitle(facts: PostFacts, generated: Pick<GeneratedPost, "title_descriptor" | "event_type">) {
  const fullTitle = buildPostTitle(facts, generated);
  const eventVenue = slugVenues(facts).slice(-1);
  const titles = [
    fullTitle,
    buildPostTitle({ ...facts, ceremonyVenue: eventVenue[0], receptionVenue: undefined }, generated),
    buildPostTitle({ ...facts, ceremonyVenue: undefined, receptionVenue: undefined }, generated)
  ];
  const candidates = titles.flatMap((title) => [`${title}${SEO_TITLE_SUFFIX}`, title]);
  return candidates.find((candidate) => candidate.length <= SEO_TITLE_MAX_CHARS);
}

export function buildImageFilePrefix(facts: PostFacts) {
  const venue = slugVenues(facts)[slugVenues(facts).length - 1] ?? facts.ceremonyVenue;
  return [slugify(facts.partnerOne), slugify(facts.partnerTwo), slugify(venue?.name ?? facts.city), "author-made-photo"].filter(Boolean).join("-");
}

export function findVenueReview(facts: PostFacts, sections: GeneratedPost["sections"]) {
  for (const venue of [facts.ceremonyVenue, facts.receptionVenue]) {
    if (!venue) {
      continue;
    }
    const spotlight = VENUE_SPOTLIGHTS.find((candidate) => normalizeForMatch(candidate.venue) === normalizeForMatch(venue.name));
    if (!spotlight) {
      continue;
    }
    const venueKey = normalizeForMatch(venue.name);
    const afterSection = sections.findIndex((section) => section.paragraphs.some((paragraph) => normalizeForMatch(paragraph).includes(venueKey)));
    return { text: `Read our full wedding venue review of ${venue.name}`, url: spotlight.url, afterSection };
  }
  return undefined;
}

function buildTags(facts: PostFacts, suggested: string[]) {
  const venueTags = slugVenues(facts).flatMap((venue) => {
    const name = venue.name.toLowerCase();
    return [name, `${name} ${facts.city.toLowerCase()}`];
  });
  return dedupeCaseInsensitive([
    ...BASE_TAGS,
    ...(hasVideo(facts) ? ["wedding videography"] : []),
    ...suggested.map((tag) => tag.toLowerCase()),
    ...venueTags
  ]);
}

function buildHeroCaptionKeywords(facts: PostFacts, region: RegionId | undefined, suggested: string[]) {
  return dedupeCaseInsensitive([
    ...suggested,
    ...[facts.ceremonyVenue, facts.receptionVenue].flatMap((venue) => (venue ? [venue.name] : [])),
    facts.city,
    ...(region ? REGIONS[region].keywords : [])
  ]);
}

export function assembleBlogOutput(facts: PostFacts, generated: GeneratedPost, lintFlags: string[] = []): BlogOutput {
  const flags = [...facts.flags];

  let region = facts.region;
  if (!region && facts.state === "FL" && !facts.city.startsWith("[")) {
    region = generated.region_guess === "none" ? undefined : generated.region_guess;
    flags.push(
      region
        ? `${facts.city} isn’t in the region table yet; the AI placed it in “${region}”. Confirm, then add it to CITY_REGIONS.`
        : `${facts.city} isn’t in the region table yet, so the intro has no larger area. Add it to CITY_REGIONS.`
    );
  }

  if (!facts.coupleStory?.howTheyMet && !facts.coupleStory?.whyThisVenue && (facts.coupleStory?.funFacts.length ?? 0) === 0) {
    flags.push("No couple story was provided (how they met, why this venue, fun facts). The opening leans on the recording; add details for a stronger start.");
  }

  const postTitle = buildPostTitle(facts, generated);
  const seoTitle = buildSeoTitle(facts, generated);
  if (!seoTitle) {
    flags.push(`The title is ${postTitle.length} characters; Squarespace’s SEO title field caps at ${SEO_TITLE_MAX_CHARS}. Shorten the SEO title by hand.`);
  }

  const tags = buildTags(facts, generated.tags);
  const vocabulary = new Set(TAG_VOCABULARY);
  const venueTagNames = new Set(slugVenues(facts).flatMap((venue) => [venue.name.toLowerCase(), `${venue.name.toLowerCase()} ${facts.city.toLowerCase()}`]));
  const newTags = tags.filter((tag) => !vocabulary.has(tag) && !venueTagNames.has(tag));
  if (newTags.length > 0) {
    flags.push(`New tags not used on the blog before: ${newTags.join(", ")}.`);
  }

  return BlogOutputSchema.parse({
    post_title: postTitle,
    keyword_line: buildKeywordLine(facts, generated.keyword_phrase),
    intro_credit: buildIntroCredit(facts, generated, region),
    opening: generated.opening,
    sections: generated.sections,
    closing: generated.closing,
    venue_review_link: findVenueReview(facts, generated.sections),
    credits: buildCredits(facts),
    kids_note: facts.childrenFeatured ? KIDS_NOTE : undefined,
    settings: {
      excerpt: `${generated.opening.join(" ")} ${galleryCallToAction(hasVideo(facts))}`,
      url_slug: buildUrlSlug(facts, generated),
      seo_title: seoTitle ?? postTitle,
      seo_description: generated.seo_description,
      categories: buildCategories(facts),
      tags,
      hero_alt_text: generated.hero_alt_text,
      hero_caption_keywords: buildHeroCaptionKeywords(facts, region, generated.hero_caption_keywords),
      image_file_prefix: buildImageFilePrefix(facts)
    },
    review_flags: [...flags, ...lintFlags]
  });
}
