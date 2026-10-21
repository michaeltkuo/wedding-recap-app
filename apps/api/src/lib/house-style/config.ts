// Author Made blog house style. Everything here was taken from Amy's comments on the Elisha & Thomas
// draft, her Squarespace walkthrough (Oct 2026), or published posts on authormadephoto.com/blog.
// Edit this file (not the prompts) when a rule changes.

export const KEYWORD_LINE_SUFFIX = "Orlando Wedding Photographer & Videographer";
export const SEO_TITLE_SUFFIX = " | Orlando Wedding Photography";

// Squarespace caps observed across ~100 published posts (no post exceeds these).
export const SEO_TITLE_MAX_CHARS = 100;
export const SEO_DESCRIPTION_MAX_CHARS = 400;
export const SEO_DESCRIPTION_MIN_CHARS = 280;

// Amy's rewrite of Elisha & Thomas ran ~800 words; published posts sit around 700-1,100.
export const BODY_WORD_RANGE = { min: 600, max: 1100 } as const;

export const KIDS_NOTE =
  "Special note: We do not share images that feature children in our public portfolio to protect their privacy. Some images and moments from this wedding do not appear in the selected gallery seen here.";

export function galleryCallToAction(hasVideo: boolean) {
  return hasVideo ? "View their full wedding photography and videography gallery here!" : "View their full wedding photography gallery here!";
}

// The hero image's file name carries Amy's long SEO keyword string (published posts show it in the image URL).
// Only the lead, the city list, and the venue type change per wedding; the rest is copied verbatim.
export const HERO_KEYWORD_CITIES = ["Clermont", "Winter Garden", "Apopka", "Winter Park", "Orlando", "Gainesville"];

export function heroKeywordTail(cities: string[], venueType: string) {
  return [
    `wedding photographer ${cities.join(" ")} Central Florida`,
    "best affordable wedding venues Orlando",
    "unique wedding venues in Central Florida",
    "micro wedding venues in Orlando",
    `${venueType} wedding venues Orlando Central Florida`,
    "best wedding photographer Orlando",
    "Author Made affordable wedding photographer videographer near me",
    "best Orlando wedding photographer near me"
  ].join(" – ");
}

export const EVENT_TYPES = ["wedding", "micro wedding", "elopement", "courthouse elopement", "vow renewal", "wedding reception"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

// "what is this, the 1810s?!" — words that read as generic AI-editorial rather than Author Made's voice.
export const BANNED_PHRASES = [
  "tapestry",
  "testament",
  "woven",
  "weave",
  "steeped",
  "revelry",
  "timeless",
  "unforgettable",
  "whimsy",
  "enchanting",
  "nestled",
  "a celebration of love",
  "every moment",
  "truly",
  "rich in heart",
  "dreamlike",
  "brimming",
  "palpable",
  "symphony",
  "it's worth noting"
];

// Too generic to describe one wedding in a post title.
export const GENERIC_TITLE_WORDS = ["beautiful", "magical", "stunning", "perfect", "amazing", "lovely", "special", "unforgettable", "dreamy"];

// Capitalized words that are always fine mid-heading.
export const PROPER_NOUN_ALLOWLIST = [
  "I",
  "FL",
  "Florida",
  "Orlando",
  "Catholic",
  "Christian",
  "Jewish",
  "Muslim",
  "Hindu",
  "Disney",
  "Walt",
  "Jane",
  "Austen",
  "God",
  "Mom",
  "Dad",
  "Mass",
  "Author",
  "Made"
];

export const REGION_IDS = ["orlando", "outside_orlando", "tampa_bay", "gainesville", "central_florida"] as const;
export type RegionId = (typeof REGION_IDS)[number];

type Region = {
  // How the italic intro names the location, e.g. "Lake Buena Vista, Orlando, FL".
  introLocation: (city: string) => string;
  // Extra location keywords for the hidden hero caption and tags.
  keywords: string[];
};

export const REGIONS: Record<RegionId, Region> = {
  orlando: {
    introLocation: (city) => (city === "Orlando" ? "Orlando, FL" : `${city}, Orlando, FL`),
    keywords: ["Orlando", "Central Florida"]
  },
  outside_orlando: {
    introLocation: (city) => `${city} outside metro Orlando, FL`,
    keywords: ["Orlando", "Central Florida"]
  },
  tampa_bay: {
    introLocation: (city) => (city === "Tampa" ? "Tampa, FL" : `${city} near Tampa, FL`),
    keywords: ["Tampa", "Tampa Bay"]
  },
  // Gainesville is its own market: both published Gainesville posts say "in/near Gainesville, FL" with no larger
  // region. "Central Florida" still goes into the hidden caption and tags. To show it in the intro instead, change
  // introLocation to `${city}, Central Florida`.
  gainesville: {
    introLocation: (city) => (city === "Gainesville" ? "Gainesville, FL" : `${city} near Gainesville, FL`),
    keywords: ["Gainesville", "North Central Florida", "Central Florida"]
  },
  central_florida: {
    introLocation: (city) => `${city}, Central Florida`,
    keywords: ["Central Florida"]
  }
};

// Cities not listed here fall back to the model's suggestion and get a review flag.
export const CITY_REGIONS: Record<string, RegionId> = {
  orlando: "orlando",
  "lake buena vista": "orlando",
  kissimmee: "orlando",
  celebration: "orlando",
  "winter park": "orlando",
  maitland: "orlando",
  windermere: "orlando",
  "winter garden": "orlando",
  ocoee: "orlando",
  apopka: "orlando",
  "lake nona": "orlando",
  "altamonte springs": "orlando",
  oviedo: "orlando",
  "lake mary": "orlando",
  longwood: "orlando",
  deland: "outside_orlando",
  sanford: "outside_orlando",
  clermont: "outside_orlando",
  montverde: "outside_orlando",
  eustis: "outside_orlando",
  tavares: "outside_orlando",
  "mount dora": "outside_orlando",
  "st. cloud": "outside_orlando",
  deltona: "outside_orlando",
  debary: "outside_orlando",
  "lady lake": "outside_orlando",
  pierson: "outside_orlando",
  tampa: "tampa_bay",
  dunedin: "tampa_bay",
  "safety harbor": "tampa_bay",
  clearwater: "tampa_bay",
  "st. petersburg": "tampa_bay",
  gainesville: "gainesville",
  "haile plantation": "gainesville",
  newberry: "gainesville",
  alachua: "gainesville",
  "high springs": "gainesville",
  lakeland: "central_florida",
  "the villages": "central_florida",
  webster: "central_florida",
  ocala: "central_florida"
};

export const STATE_ABBREVIATIONS: Record<string, string> = {
  florida: "FL",
  ohio: "OH",
  georgia: "GA",
  "north carolina": "NC",
  "south carolina": "SC"
};

// Published "Wedding Venue Spotlight" posts; a matching venue gets a "Read our full wedding venue review" link.
export const VENUE_SPOTLIGHTS = [
  { venue: "Summer House on the Lake", url: "https://www.authormadephoto.com/blog/wedding-venue-review-summer-house-on-the-lake-lake-buena-vista-fl" },
  { venue: "Villa Festa", url: "https://www.authormadephoto.com/blog/wedding-venue-review-villa-festa-deland-fl" },
  { venue: "Villa Serafina", url: "https://www.authormadephoto.com/blog/wedding-venue-review-villa-serafina-webster-fl" },
  { venue: "Holy Trinity Reception Center", url: "https://www.authormadephoto.com/blog/wedding-venue-review-holy-trinity-reception-center-maitland-fl" },
  { venue: "Wanderlust Okto", url: "https://www.authormadephoto.com/blog/wedding-venue-review-wanderlust-okto-lake-nona-fl" },
  { venue: "Maitland Art & History Museums", url: "https://www.authormadephoto.com/blog/wedding-venue-review-maitland-art-and-history-museums-maitland-orlando-fl" },
  { venue: "The Cottage on Lake Fairview", url: "https://www.authormadephoto.com/blog/wedding-venue-review-the-cottage-on-lake-fairview-orlando-fl" },
  { venue: "Legacy at Oak Meadows", url: "https://www.authormadephoto.com/blog/wedding-venue-review-legacy-at-oak-meadows-pierson-fl" },
  { venue: "The Hidden Barn Venue", url: "https://www.authormadephoto.com/blog/wedding-venue-review-hidden-barn-venue-apopka-fl" },
  { venue: "Tavares Pavilion on the Lake", url: "https://www.authormadephoto.com/blog/wedding-venue-review-tavares-pavilion-on-the-lake-tavares-fl" },
  { venue: "Chapel Valley Farm", url: "https://www.authormadephoto.com/blog/wedding-venue-review-chapel-valley-farm-eustis-fl" },
  { venue: "Bynx", url: "https://www.authormadephoto.com/blog/wedding-venue-review-the-bynx-cafe-orlando-fl" },
  { venue: "Dunlawton Sugar Mill Gardens", url: "https://www.authormadephoto.com/blog/wedding-venue-review-dunlawton-sugar-mill-gardens-port-orange" },
  { venue: "The Venue at Gentry Pines", url: "https://www.authormadephoto.com/blog/wedding-venue-review-the-venue-at-gentry-pines-st-cloud-fl" },
  { venue: "Casa Feliz", url: "https://www.authormadephoto.com/blog/wedding-venue-review-casa-feliz-winter-park" },
  { venue: "Museum of Arts & Sciences", url: "https://www.authormadephoto.com/blog/wedding-venue-review-museum-of-arts-and-sciences-daytona-beach" },
  { venue: "Leu Gardens", url: "https://www.authormadephoto.com/blog/wedding-venue-review-leu-gardens-orlando" }
];

// Every real-wedding post carries these.
export const BASE_TAGS = ["wedding", "real wedding", "wedding photography"];

// Tags already used on the blog. Suggestions outside this list are called out for review.
export const TAG_VOCABULARY = [
  "affordable wedding",
  "affordable wedding photographer",
  "affordable wedding photography",
  "affordable wedding venues",
  "affordable wedding videographer",
  "backyard wedding",
  "barn wedding",
  "barn wedding venue",
  "beach wedding",
  "beach wedding ceremony",
  "beachfront wedding",
  "best micro wedding venues central florida",
  "best micro wedding venues in orlando",
  "best wedding venues central florida",
  "best wedding venues orlando",
  "botanical garden wedding ceremony",
  "botanical garden wedding venue",
  "chapel wedding",
  "classic romantic wedding",
  "coastal wedding",
  "colorful wedding",
  "country wedding",
  "courthouse elopement wedding",
  "courthouse wedding",
  "custom package",
  "disney wedding",
  "elegant wedding",
  "elegant wedding venue",
  "elopement",
  "elopement photographer",
  "elopement wedding",
  "floral wedding",
  "garden wedding",
  "garden wedding venue",
  "historic home wedding",
  "historic wedding venue",
  "historical wedding venues",
  "home wedding",
  "indoor wedding",
  "indoor wedding reception",
  "indoor wedding reception venue",
  "intimate wedding",
  "lakefront wedding",
  "lakeside wedding ceremony",
  "luxury wedding venue",
  "micro wedding photographer",
  "micro wedding photography",
  "micro wedding reception",
  "micro wedding venues",
  "modern wedding",
  "modern wedding venue",
  "outdoor garden wedding",
  "outdoor wedding",
  "outdoor wedding ceremony",
  "outdoor wedding venues orlando",
  "real wedding",
  "restaurant wedding reception",
  "rustic wedding",
  "small wedding",
  "spring wedding",
  "unique wedding venue",
  "wedding",
  "wedding ceremony",
  "wedding photographer",
  "wedding photography",
  "wedding reception",
  "wedding reception venue",
  "wedding venues",
  "wedding videographer",
  "wedding videography"
];
