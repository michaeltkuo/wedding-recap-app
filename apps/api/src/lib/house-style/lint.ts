import {
  BANNED_PHRASES,
  BODY_WORD_RANGE,
  GENERIC_TITLE_WORDS,
  PROPER_NOUN_ALLOWLIST,
  SEO_DESCRIPTION_MAX_CHARS,
  SEO_DESCRIPTION_MIN_CHARS
} from "./config.js";
import type { PostFacts } from "./facts.js";
import type { GeneratedPost } from "./generated.js";
import { countWords, normalizeForMatch } from "./text.js";

const STOPWORDS = new Set(["a", "an", "and", "the", "at", "in", "of", "on", "with", "for", "to", "wedding", "reception"]);

function stripPunctuation(word: string) {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

// "Austen-inspired" and "Elisha’s" are judged by their proper-noun part.
function baseWord(word: string) {
  return stripPunctuation(word).replace(/['’]s$/u, "").split("-")[0];
}

function isUnexpectedCapital(word: string, properNouns: Set<string>) {
  const base = baseWord(word);
  return /^\p{Lu}/u.test(base) && !properNouns.has(base);
}

// Words the facts, allowlist, or recording treat as proper nouns. Transcription capitalizes names,
// so a word capitalized mid-sentence in the transcript is a strong proper-noun signal.
export function collectProperNouns(facts: PostFacts, transcript: string) {
  const nouns = new Set(PROPER_NOUN_ALLOWLIST);
  const factText = [
    facts.partnerOne,
    facts.partnerTwo,
    facts.ceremonyVenue?.name,
    facts.receptionVenue?.name,
    facts.city,
    ...facts.team.map((credit) => credit.member.fullName),
    ...facts.vendors.map((vendor) => vendor.name)
  ]
    .filter(Boolean)
    .join(" ");
  for (const word of factText.split(/\s+/)) {
    nouns.add(stripPunctuation(word));
  }
  for (const match of transcript.matchAll(/(?<=[^.!?\n\s]\s+)\p{Lu}[\p{L}'’-]*/gu)) {
    nouns.add(stripPunctuation(match[0]));
  }
  return nouns;
}

export function lintHeading(heading: string, properNouns: Set<string>) {
  const issues: string[] = [];
  if (/[:–—]|\s-\s/.test(heading)) {
    issues.push(`Heading “${heading}” is a split phrase. Use one phrase with no colon or dash.`);
  }
  const words = heading.split(/\s+/).slice(1).map(stripPunctuation).filter(Boolean);
  const capitalized = words.filter((word) => isUnexpectedCapital(word, properNouns));
  if (capitalized.length > 0) {
    issues.push(`Heading “${heading}” must be sentence case; lowercase: ${capitalized.join(", ")}.`);
  }
  return issues;
}

export function findBannedPhrases(text: string) {
  const lower = text.toLowerCase();
  return BANNED_PHRASES.filter((phrase) => new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(lower));
}

export function bodyText(generated: Pick<GeneratedPost, "opening" | "sections" | "closing">) {
  return [...generated.opening, ...generated.sections.flatMap((section) => section.paragraphs), generated.closing].join("\n\n");
}

// A quote in the post must exist in the recording or the couple story; otherwise it was invented.
export function findUnsupportedQuotes(text: string, sources: string[]) {
  const haystack = normalizeForMatch(sources.join(" "));
  const quotes = [...text.matchAll(/[“"]([^”"]{12,})[”"]/g)].map((match) => match[1]);
  return quotes.filter((quote) => countWords(quote) >= 4 && !haystack.includes(normalizeForMatch(quote)));
}

// Only words the model chose can be "repeated"; two venue names sharing a word isn't fixable.
export function findRepeatedKeywordWords(keywordPhrase: string, venueNames: string[]) {
  const toWords = (value: string) =>
    value
      .split(/\s+/)
      .map((word) => stripPunctuation(word).toLowerCase())
      .filter((word) => word && !STOPWORDS.has(word));
  const phraseWords = toWords(keywordPhrase);
  const venueWords = new Set(venueNames.flatMap(toWords));
  return [...new Set(phraseWords.filter((word, index) => venueWords.has(word) || phraseWords.indexOf(word) !== index))];
}

export type LintResult = { issues: string[] };

export function lintGeneratedPost(generated: GeneratedPost, facts: PostFacts, transcript: string): LintResult {
  const issues: string[] = [];
  const properNouns = collectProperNouns(facts, transcript);

  for (const section of generated.sections) {
    issues.push(...lintHeading(section.heading, properNouns));
  }

  const prose = [bodyText(generated), ...generated.sections.map((section) => section.heading), generated.seo_description].join("\n");
  const banned = findBannedPhrases(prose);
  if (banned.length > 0) {
    issues.push(`Remove these words/phrases (not our voice): ${banned.join(", ")}.`);
  }

  const descriptorWords = generated.title_descriptor.split(/[\s,]+/).filter(Boolean);
  const genericWords = descriptorWords.filter((word) => GENERIC_TITLE_WORDS.includes(word.toLowerCase()));
  if (genericWords.length > 0) {
    issues.push(`title_descriptor “${generated.title_descriptor}” is too generic (${genericWords.join(", ")}). Describe this wedding’s look and feel.`);
  }
  const capitalizedDescriptor = descriptorWords.map(stripPunctuation).filter((word) => isUnexpectedCapital(word, properNouns));
  if (capitalizedDescriptor.length > 0) {
    issues.push(`title_descriptor must be lowercase except proper nouns; lowercase: ${capitalizedDescriptor.join(", ")}.`);
  }
  if (descriptorWords.length > 4) {
    issues.push(`title_descriptor should be 1-4 words; “${generated.title_descriptor}” has ${descriptorWords.length}.`);
  }

  const venueNames = [facts.ceremonyVenue?.name, facts.receptionVenue?.name].filter((name): name is string => Boolean(name));
  const repeated = findRepeatedKeywordWords(generated.keyword_phrase, venueNames);
  if (repeated.length > 0) {
    issues.push(`keyword_phrase repeats words already in the keyword line (${repeated.join(", ")}). Use different search terms.`);
  }

  const seoLength = generated.seo_description.length;
  if (seoLength > SEO_DESCRIPTION_MAX_CHARS) {
    issues.push(`seo_description is ${seoLength} characters; Squarespace allows ${SEO_DESCRIPTION_MAX_CHARS}. Tighten it.`);
  } else if (seoLength < SEO_DESCRIPTION_MIN_CHARS) {
    issues.push(`seo_description is only ${seoLength} characters; use the space (aim for ${SEO_DESCRIPTION_MIN_CHARS}-${SEO_DESCRIPTION_MAX_CHARS}) with more search terms.`);
  }

  const words = countWords(bodyText(generated));
  if (words < BODY_WORD_RANGE.min || words > BODY_WORD_RANGE.max) {
    issues.push(`Body copy is ${words} words; aim for ${BODY_WORD_RANGE.min}-${BODY_WORD_RANGE.max}.`);
  }

  if (!generated.closing.startsWith("Congratulations again")) {
    issues.push("The closing paragraph must start with “Congratulations again, …!”.");
  }

  const quoteSources = [transcript, ...(facts.coupleStory?.quotes ?? []), facts.coupleStory?.howTheyMet ?? "", facts.coupleStory?.whyThisVenue ?? ""];
  const unsupported = findUnsupportedQuotes(bodyText(generated), quoteSources);
  if (unsupported.length > 0) {
    issues.push(`These quotes aren’t in the recording or couple story; paraphrase them instead of quoting: ${unsupported.map((quote) => `“${quote}”`).join(" ")}`);
  }

  return { issues };
}
