import {
  TEAM_ROSTER,
  type CoupleStory,
  type Recap,
  type TeamMember,
  type TeamRole,
  type Vendor,
  type Venue,
  type WeddingDetails
} from "../../contracts.js";

import { CITY_REGIONS, STATE_ABBREVIATIONS, type RegionId } from "./config.js";

export type TeamCredit = { member: TeamMember; role: TeamRole };

// Everything the templates need, resolved from intake details first and the recording second.
export type PostFacts = {
  partnerOne: string;
  partnerTwo: string;
  ceremonyVenue?: Venue;
  receptionVenue?: Venue;
  city: string;
  state: string;
  region?: RegionId;
  team: TeamCredit[];
  childrenFeatured: boolean;
  vendors: Vendor[];
  coupleStory?: CoupleStory;
  flags: string[];
};

const HOUSE_OF_WORSHIP_PATTERN = /\b(church|cathedral|parish|basilica|synagogue|temple|mosque)\b/i;

function splitCoupleNames(coupleNames: string | undefined) {
  if (!coupleNames) {
    return [];
  }
  return coupleNames
    .split(/\s*(?:&|\+|\band\b)\s*/i)
    .map((name) => name.trim())
    .filter(Boolean);
}

function parseCityState(cityState: string | undefined) {
  if (!cityState) {
    return {};
  }
  const [city, rawState] = cityState.split(",").map((part) => part.trim());
  const stateKey = rawState?.toLowerCase();
  const state = stateKey ? STATE_ABBREVIATIONS[stateKey] ?? (rawState.length === 2 ? rawState.toUpperCase() : undefined) : undefined;
  return { city: city || undefined, state };
}

export function regionForCity(city: string, state: string): RegionId | undefined {
  if (state !== "FL") {
    return undefined;
  }
  return CITY_REGIONS[city.toLowerCase()];
}

export function resolvePostFacts(recap: Recap | undefined, details: WeddingDetails | undefined): PostFacts {
  const flags: string[] = [];
  const recordedNames = splitCoupleNames(recap?.couple_names);

  const partnerOne = details?.partnerOne ?? recordedNames[0];
  const partnerTwo = details?.partnerTwo ?? recordedNames[1];
  if (!partnerOne || !partnerTwo) {
    flags.push("Couple names are incomplete. Add both names in the app (bride first) so the title follows the house format.");
  } else if (!details?.partnerOne || !details?.partnerTwo) {
    flags.push(`Couple names came from the recording (“${partnerOne}” & “${partnerTwo}”). Confirm spelling and order (bride first).`);
  }

  let ceremonyVenue = details?.ceremonyVenue;
  if (!ceremonyVenue && recap?.venue_name) {
    ceremonyVenue = {
      name: recap.venue_name,
      kind: HOUSE_OF_WORSHIP_PATTERN.test(recap.venue_name) ? "house_of_worship" : "venue"
    };
    flags.push(
      `Venue “${recap.venue_name}” came from the recording. Confirm the proper name, and enter the ceremony and reception venues separately if they differ.`
    );
  }
  if (!ceremonyVenue) {
    flags.push("No venue was provided. Add the ceremony venue (and reception venue, if different).");
  }

  let receptionVenue = details?.receptionVenue;
  if (receptionVenue && ceremonyVenue && receptionVenue.name.toLowerCase() === ceremonyVenue.name.toLowerCase()) {
    receptionVenue = undefined;
  }

  const recorded = parseCityState(recap?.venue_city_state);
  const city = details?.city ?? recorded.city;
  const state = details?.state?.toUpperCase() ?? recorded.state ?? "FL";
  if (!city) {
    flags.push("No city was provided. Add the city so the title, slug, and intro are correct.");
  }

  const team = (details?.team ?? []).flatMap((assignment) => {
    const member = TEAM_ROSTER.find((candidate) => candidate.id === assignment.memberId);
    return member ? [{ member, role: assignment.role }] : [];
  });
  if (team.length === 0) {
    flags.push("No team members were selected. Add who shot this wedding (photo and video) for the intro, credits, and categories.");
  }

  const resolvedCity = city ?? "[City]";

  return {
    partnerOne: partnerOne ?? "[Partner 1]",
    partnerTwo: partnerTwo ?? "[Partner 2]",
    ceremonyVenue,
    receptionVenue,
    city: resolvedCity,
    state,
    region: city ? regionForCity(resolvedCity, state) : undefined,
    team,
    childrenFeatured: details?.childrenFeatured ?? false,
    vendors: details?.vendors ?? [],
    coupleStory: details?.coupleStory,
    flags
  };
}

export function hasVideo(facts: PostFacts) {
  return facts.team.some((credit) => credit.role === "video");
}

// Venues named in the title, keyword line, and intro. A church-only wedding names no venue
// ("traditional church wedding in Deltona, FL"); a church ceremony with a reception venue names both.
export function namedVenues(facts: PostFacts) {
  if (facts.ceremonyVenue && facts.receptionVenue) {
    return [facts.ceremonyVenue, facts.receptionVenue];
  }
  if (facts.ceremonyVenue?.kind === "venue") {
    return [facts.ceremonyVenue];
  }
  if (!facts.ceremonyVenue && facts.receptionVenue) {
    return [facts.receptionVenue];
  }
  return [];
}

// The URL slug only carries event venues (e.g. "…-catholic-wedding-outdoor-reception-the-yardery-sanford-fl").
export function slugVenues(facts: PostFacts) {
  return [facts.ceremonyVenue, facts.receptionVenue].filter((venue): venue is Venue => venue?.kind === "venue");
}
