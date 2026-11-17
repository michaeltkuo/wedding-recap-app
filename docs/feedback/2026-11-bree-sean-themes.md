# Bree & Sean: sorting the feedback into code themes (Nov 2026)

Source: Google Doc "Bree & Sean's goddess-inspired, laid-back micro wedding at Portofino Bay in Not specified, FL", generated 2026-11-16. Michael's spoken review the same day.

This is a sorting pass, not a fix. Each theme states the complaint, the evidence in this output, where it lives in the code, and what shape a fix would take. No code changed.

One note before the themes: Michael referred to the couple as "Brie", the pipeline produced "Bree", and the doc's own first checklist line asks someone to confirm the spelling. The name of the couple is not settled anywhere. That is theme 1 in miniature.

---

## Theme 1 — Ground truth belongs at intake, not in a post-hoc checklist

**The complaint.** Most "check before publishing" items are metadata that should have been required *before* the recording started, so dictation happens on top of known facts.

**Evidence.** Five of the six checklist items on this post are intake metadata, not writing problems:

| Checklist item | What it actually is |
|---|---|
| Confirm couple name spelling and order | intake |
| Confirm venue proper name; split ceremony/reception | intake |
| No team members were selected | intake |
| "Not specified" isn't in the region table | intake (city never provided) |
| No couple story was provided | intake (see theme 2) |
| New tags not used on the blog before | genuinely post-hoc |

And the missing city did not stay in the checklist. **`Not specified` was written into five published-facing fields**: the post title, the keyword line, the italic intro credit, the hero image file name, and the URL slug (`…-portofino-bay-not-specified-fl`), plus two tags. A missing input became visible output in seven places.

**Where it lives.**

- `packages/contracts/src/index.ts` — `WeddingDetailsSchema`. **Every field is `.optional()`**: `partnerOne`, `partnerTwo`, `ceremonyVenue`, `receptionVenue`, `city`, `state`, `coupleStory`. `team` and `vendors` default to `[]`. `SignUploadRequestSchema` then makes `details` itself optional, so a recording can be uploaded with no metadata at all.
- `apps/api/src/lib/house-style/facts.ts` — `resolvePostFacts` is built around that absence. It falls back to the recording, then to literal placeholders (`"[Partner 1]"`, `"[City]"`), and pushes a flag for each gap.
- `apps/web/src/App.tsx:770` — the UI actively invites skipping: *"Add the couple, venues, and team now for a publish-ready post, **or leave it blank and let us infer from your recording**."*
- `apps/web/src/PostDetailsForm.tsx` — no field is marked required.

**The subtle part.** `resolvePostFacts` has a `city ?? "[City]"` guard, and it never fired. The extraction model returned the *string* `"Not specified"` for `venue_city_state`, which is truthy, so the code accepted it as a real city, skipped the "No city was provided" flag, and passed it downstream. The square-bracket placeholders are only reached when a field is genuinely absent — they do not catch a model that helpfully fills the blank with prose.

So there are two distinct gaps: metadata is optional, and **extracted values are never checked for being real**.

**Shape of a fix.** Make the identity fields required before recording can start, rather than required before publishing. That is a schema change (`WeddingDetailsSchema` splits into a required core and optional extras), a UI gate, and a placeholder-rejection pass over extracted values so `"Not specified"`, `"Unknown"`, `"N/A"` and friends are treated as absent.

---

## Theme 2 — Couple story has a schema and a flag, but nothing ever asks for it

**The complaint.** Couple story should be its own section, or at least talking points: how they met, why this venue, fun facts.

**Evidence.** The opening of this post is all day-of observation — the gown, the suit, the balcony. There is no "how they met", because nobody was asked.

**Where it lives.** Half of this already exists:

- `packages/contracts/src/index.ts` — `CoupleStorySchema` already has **exactly the fields Michael named**: `howTheyMet`, `whyThisVenue`, `funFacts[]`, plus `quotes[]`. It is `.optional()`.
- `apps/api/src/lib/house-style/assemble.ts:200` — flags its absence after the fact.
- `apps/api/src/lib/prompts.ts` — the `STRUCTURE` block already tells the generator to open with the couple: *"Start with the couple: how they met, why this venue, anything distinctive."* The instruction is there; the data never is.
- `apps/web/src/App.tsx:59` — `storyCues`, the four prompts shown during recording:
  1. Where did the day begin, and what did the setting feel like?
  2. Which moment best captured the couple together?
  3. What made the ceremony feel like them?
  4. What shifted when the reception opened up?

  All four are day-of coverage. The cue list UI labels them Arrival / Portraits / Ceremony / Reception. **None asks for couple story.**

**Shape of a fix.** The gap is capture, not modelling or prompting. Either a couple-story block in the intake form (typed, reusable across the three posts a couple might appear in), or a fifth cue group in `storyCues` that runs before the day-of cues. The schema and the generator instruction are already waiting for the data.

---

## Theme 3 — Author Made's voice should be a layer the engine loads, not the engine itself

**The complaint.** This codebase will eventually go to people other than Michael. It should be blander by default, with brand voice as a personal-preference layer that steps in on top.

**Evidence.** Brand specificity by file:

| File | Brand-specific references |
|---|---|
| `house-style/config.ts` | 73 |
| `house-style/assemble.ts` | 8 |
| `prompts.ts` | 8 |
| `contracts/src/index.ts` | 4 |

`config.ts` is almost entirely Author Made: the Orlando keyword suffix, Squarespace field caps, the Central Florida city→region table, 17 venue-spotlight URLs, the published tag vocabulary, the kids note.

**The hardest coupling** is in the contracts package, not the config:

```ts
export const TEAM_ROSTER = [
  { id: "michael-kuo", firstName: "Michael", fullName: "Michael Kuo", ... },
  ...
] as const;

memberId: z.enum(TEAM_ROSTER.map((member) => member.id) as [TeamMemberId, ...TeamMemberId[]]),
```

The Zod enum is **derived from the roster**, so `TeamMemberId` is a union of five literal strings. Another studio cannot submit a team member — the validator rejects it and the type system rejects it before that. This is the one place where the app is not merely tuned for Author Made but structurally closed to anyone else.

Also worth separating: some of `config.ts` is Author Made's *taste* (banned words, title style, voice example) and some is *Squarespace's platform constraints* (`SEO_TITLE_MAX_CHARS`, `SEO_DESCRIPTION_MAX_CHARS`). Those belong in different layers — one is a tenant profile, the other is a publishing-target adapter.

**Shape of a fix.** Three layers rather than two: a generic engine (pipeline, lint mechanics, schema), a publishing-target adapter (Squarespace caps and field names), and a tenant profile (voice, banned words, roster, region table, tag vocabulary) loaded as data. `TEAM_ROSTER` becomes runtime data with `memberId` as a plain validated string, not a compile-time enum.

This is the largest of the six themes and the one that most constrains the others — theme 5's neutrality default only makes sense once "default" and "Author Made" are different things.

---

## Theme 4 — Mechanical AI tells

**The complaint.** Em dashes read as AI.

**Evidence.** **8 em dashes** in the body copy, several doing the same job in consecutive paragraphs: "gown—the definition", "surprises—think grand", "spontaneous—Bree's", "warmth—just four minutes", "color—a happy accident", "him—a seriously cool", "front—definitely a VIP moment".

**Where it lives.**

- `apps/api/src/lib/house-style/lint.ts:56` — em dashes *are* already linted, but only inside `lintHeading`:
  ```ts
  if (/[:–—]|\s-\s/.test(heading)) {
  ```
  Body prose is never checked for punctuation. `lintGeneratedPost` runs `findBannedPhrases` over the body, and `BANNED_PHRASES` in `config.ts` is a **vocabulary** list (tapestry, revelry, timeless) with no punctuation entries.
- `apps/api/src/lib/prompts.ts` — the `VOICE` block says "Plain modern words" and names banned vocabulary, but says nothing about sentence construction or punctuation.

**Shape of a fix.** Extend body linting from vocabulary to construction: an em-dash budget (not zero — Author Made's published posts use them sparingly), plus the other mechanical tells worth naming once someone lists them. Cheap, deterministic, and it rides the existing revision loop.

---

## Theme 5 — Worldview neutrality, with an explicit opt-in

**The complaint.** "a happy accident that felt like a little extra blessing from the universe." Michael is Christian; this couple probably isn't; the copy should convey neither religiosity nor agnosticism. If a wedding *is* explicitly faith-rooted, matching that tone is welcome.

**Evidence.** The phrase is invented editorialising — nothing in the day produced it. It also quietly takes a position: "the universe" is a specific spiritual register, not a neutral one. A reader could reasonably read it as either new-age or as a deliberate avoidance of "God". Both are a stance the post should not be taking on the couple's behalf.

**Where it lives.** Nowhere yet — a grep for religion, faith, secular, spiritual or worldview across `prompts.ts` and `house-style/*.ts` returns nothing. The new `STANCE` block (branch `feat/house-style-stance`) is the natural home: it already governs what the writer may assert beyond the facts, and already contains the closest existing rule — *"Don't overcorrect into praise the day didn't earn."*

There is already a signal to drive the opt-in. `facts.ts` has:

```ts
const HOUSE_OF_WORSHIP_PATTERN = /\b(church|cathedral|parish|basilica|synagogue|temple|mosque)\b/i;
```

It currently only classifies a venue as `house_of_worship` for title formatting, but it is exactly the faith-context flag this theme needs — and it is already multi-faith rather than Christian-specific, which matters for a codebase going to other studios.

**Shape of a fix.** A neutrality rule in `STANCE`: don't assign meaning, luck, fate, blessing or providence to anything the couple didn't say. Then a per-wedding faith context — derived from venue kind, or set explicitly at intake — that permits matching register when the wedding is openly religious. Worth noting that venue type is a weak proxy: a church wedding may be a venue choice, and a deeply religious couple may marry in a garden. An explicit intake field is more honest than inferring it, which makes this theme depend on theme 1.

---

## Theme 6 — Calibration: what "done" means

**The complaint, restated.** This is at roughly 60% of Author Made's voice. 75–80% would be good. 100% is not the goal and never will be.

**Why it belongs in a themes list.** It is the acceptance criterion the other five are measured against, and it has a concrete code consequence: which `review_flags` *block* and which merely *advise*.

Today nothing blocks. `assembleBlogOutput` collects every flag into `review_flags` and returns the post regardless; the pipeline runs one revision pass and publishes whatever comes back. That is the right design for a 60–80% target — the human is the last mile by intent, not by accident — but it means the three publication risks from the Alison & Nick review (medical details, property safety claims, vendor criticism) currently ship with a warning rather than being withheld.

**Shape of a fix.** Give flags a severity: `blocking` for things that must never reach a doc, `fix-before-publish` for house-format errors, `fyi` for suggestions. Lets the 60–80% target stand for *prose quality* while holding a hard line on the small set of things that are not a matter of taste.

---

## How the themes depend on each other

- **Theme 1 is upstream of 2, 5 and 6.** Couple story (2) and faith context (5) are both intake fields; flag severity (6) is cheaper to reason about once fewer flags exist.
- **Theme 3 is upstream of 5.** A neutrality default only means something once "default behaviour" and "Author Made's voice" are separable.
- **Theme 4 is independent** and the smallest — it could be done this week without touching anything else.

Suggested order if these turn into work: 1, then 4 (quick, independent), then 2, then 3, then 5 on top of 3, with 6 folded in wherever flags are already being touched.

---

## Not in scope here

The body copy of this post. Michael asked for the code sorting, not a rewrite. The stance work on `feat/house-style-stance` is also unmerged and unreviewed by Amy, so themes 4 and 5 would land on top of it rather than beside it.
