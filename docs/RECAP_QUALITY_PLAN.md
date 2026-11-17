# Recap quality: implementation plan for themes 1–6

Companion to [`feedback/2026-11-bree-sean-themes.md`](feedback/2026-11-bree-sean-themes.md), which sorted Michael's Nov 2026 review into six themes. This plan says how each would be built, in what order, and what has to be decided first.

Nothing here is built yet. Sizes are rough and relative, not hours.

**One correction to the themes doc.** It implied the intake form might need a couple-story block. It already has one — `PostDetailsForm.tsx:168-174`, a `Couple story` fieldset with *How they met*, *Why this venue*, *Fun facts* and *Quotes from the couple*. Theme 2 is smaller than written: the fields exist and are wired to `CoupleStorySchema`. Nothing asks anyone to fill them.

---

## Decisions — answered 2026-11-16

| # | Decision | Michael's answer |
|---|---|---|
| D1 | Required before recording | **Couple names, city, venue, team.** All four. |
| D2 | Hard or soft gate | **Hard.** Explicitly so it can't be completed casually — "just in case someone ends up driving and texting". The friction is the point, not a side effect. |
| D3 | Stance rules | See "What the stance branch changed" below. Bree & Sean *was* generated with it. |
| D4 | Multi-tenancy | **Hypothetical — but the split still happens**, for a different reason. Shipping as a .dmg/.exe means the instructions must live outside the program as editable config. |
| D5 | Faith context | **Ask at intake**, as a trigger that steers tone. |

### What D2 changes

A hard gate makes `sessionMachine.ts` the right place, not a disabled button. Recording becomes unreachable until the required core is filled, which is a real state transition rather than UI state. The safety rationale also rules out a "remind me later" escape hatch — if it can be dismissed in one tap while distracted, it isn't doing its job.

### What D4 changes

This is a better requirement than multi-tenancy, and it makes theme 3b worth doing even though no second studio exists.

The goal isn't "other studios can use this" — it's **"Michael can change the house style without a developer or a rebuild"**. A packaged app with the voice rules compiled into the binary means every tweak to `BANNED_PHRASES` or the title format is a code change, a build and a reinstall. The same split serves both, but the acceptance test is different: *can Amy edit the banned-word list in a text file and see it take effect on the next run?*

Practical consequences:
- Tenant config becomes a file the installer drops somewhere editable, not a TypeScript module.
- It needs to be a format a non-developer can edit safely — JSON or TOML with a schema, validated at load with readable errors.
- `TEAM_ROSTER` moving out of contracts (3a) stops being preparatory refactor and becomes the first instance of the pattern.
- Versioning matters: config written for an older build shouldn't silently break.

### What D5 changes

A `faithContext` field on the intake form rather than inference from venue type. Values want to be a steer, not a label — something like *not religious / lightly religious / explicitly faith-centred*, with the last one unlocking matching register in the prompt. `HOUSE_OF_WORSHIP_PATTERN` stays as a sanity check: if the venue is a church and the field says not religious, that's worth a flag, not an override.

Adding a required-ish field fights D1's goal of a short gate, so this one belongs in the optional section of intake, not the blocking core.

---

## What the stance branch changed (D3)

`git diff main..feat/house-style-stance -- apps/api/src/lib/prompts.ts` is **336 insertions, 0 deletions**. Every line is an addition. `VOICE`, `STRUCTURE`, `VOICE EXAMPLE`, the title rules and the SEO rules are byte-identical on both branches.

So the question "how does the new voice compare to the old house style" has a narrower answer than expected: **the voice didn't change.** The warm, first-person, specific-detail voice in the Bree & Sean copy is the `VOICE` block, which has been on `main` since `0d89bb1` (the Elisha & Thomas work). Both branches run exactly the same one.

What the branch added, all of it on top:

| Addition | What it does |
|---|---|
| `STANCE` block, 7 rules | Resolve a difficulty or leave it out; close a setback with what outranked it; "chaos" may describe people, never logistics; don't overcorrect into invented praise |
| `NEVER PUBLISH`, 7 items | Medical details, vendor performance, our own equipment trouble, physical discomfort, property safety, mood concessions, dismissive couple quotes |
| `STANCE EXAMPLE` | Nicole & Jeff's storm paragraph, as the worked example |
| Lint backstop | `findForbiddenTopics` over body prose, feeding the existing revision pass |

### How much of it actually fired on Bree & Sean

Close to none, measurably:

```
forbidden topics tripped: []
banned phrases tripped:   []
```

The lint half did nothing. Bree & Sean was a smooth, happy day — a balcony ceremony, bagels, a park visit. There was almost no hardship for the stance rules to act on.

The one place the prompt half plausibly shows is the four-minute ceremony:

> "the ceremony itself was short but full of warmth—just four minutes, but completely heartfelt. **Sometimes, the smallest ceremonies are the ones that feel the most significant.**"

That is the "name it, then say what outranked it" move. Compare the same class of fact in Alison & Nick, generated on `main` without the stance:

> "The actual ceremony, held in a little ditch at the back of the property, was the definition of short and sweet. No elaborate readings or drawn-out speeches—just the essentials, a quick kiss, and everyone hustling inside to escape the heat."

Same underlying fact — a short ceremony — opposite treatment. Suggestive, but **not evidence**: different wedding, different transcript, different mood in the debrief. One pleasant day under new rules proves very little.

### The experiment that would settle it

Both halves of a clean A/B already exist. The merged Alison & Nick audio is on the SSD, and the `main`-branch output of that same recording is in Google Docs. Re-running that audio on `feat/house-style-stance` holds the transcript constant and changes only the rules.

That is the only way to know whether the stance block does anything, or whether Bree & Sean simply had a nice day.

---

## Theme 1 — Required intake before recording

**Goal.** Identity facts are known before dictation, and no placeholder string ever reaches output.

Two independent defects, worth building separately:

### 1a. Reject placeholder values *(small, no product decisions)*

The `city ?? "[City]"` guard never fired because the extractor returned the string `"Not specified"`, which is truthy. This is a pure bug fix and needs no decision from D1/D2.

- `apps/api/src/lib/house-style/facts.ts` — add a `isPlaceholderValue()` check (`not specified`, `unknown`, `n/a`, `none`, `tbd`, `not provided`, empty-after-trim) applied to every value read from `recap` before it's accepted. Treat a match as absent, so the existing `[City]` / `[Partner 1]` fallbacks and their flags fire as designed.
- Same check in `parseCityState`, which currently splits `"Not specified"` into a city with no state.

**Tests.** Feed `resolvePostFacts` a recap with `"Not specified"`, `"Unknown"` and `""` for city, venue and names; assert the flags fire and no placeholder reaches `PostFacts`. Regression test asserting `"Not specified"` never appears in an assembled `BlogOutput`.

**Size.** Small. One file, one helper, ~6 tests.

### 1b. Gate recording on required fields *(needs D1, D2)*

- `packages/contracts/src/index.ts` — split `WeddingDetailsSchema` into `RequiredWeddingDetailsSchema` (the D1 core) and the current optional remainder. Keep the loose schema for drafts in progress; validate the strict one at the point of upload. `SignUploadRequestSchema.details` stops being optional.
- `apps/web/src/PostDetailsForm.tsx` — mark the required fields, surface per-field validation.
- `apps/web/src/App.tsx` — `detailsOpen` currently defaults to `false` (line 340) and the record button (line 776) has no dependency on details. Gate it on a `detailsComplete` predicate. Replace the line at 770 that invites skipping: *"or leave it blank and let us infer from your recording."*
- `apps/web/src/sessionMachine.ts` — optionally add a `details` stage before `recording`, if the gate should be a step rather than a disabled button. Worth doing only if D2 says hard gate.

**Tests.** `sessionMachine` transition tests if a stage is added; `PostDetailsForm` validation tests; an App test asserting the record button is disabled until the core is filled.

**Size.** Medium. Touches contracts, both web files, and the API's upload validation.

**Risk.** This is the only theme that changes the photographer's workflow under time pressure. D2 exists because of that.

---

## Theme 2 — Ask for the couple story

**Goal.** The couple-story fields get filled, so the opening stops being day-of observation.

The schema, the form fields and the generator instruction all already exist. Only the asking is missing.

- `apps/web/src/App.tsx:59` — `storyCues` is four day-of prompts. Add a couple-story group that runs *before* them: how they met, why this venue, a fun fact or quirk, anything they said word for word. The cue list UI at line 668 hardcodes four labels (`Arrival` / `Portraits` / `Ceremony` / `Reception`) via a ternary chain — that needs to become data alongside the cue text, not a fifth branch.
- Decide whether the couple story is **spoken** (a cue, transcribed with the rest) or **typed** (the existing form fields). Spoken is lower friction in the field and gets you the quotes; typed is reusable and survives a bad transcription. They aren't exclusive — a cue that reminds you to speak it, with the form as the fallback, is probably right.
- If spoken: `apps/api/src/lib/prompts.ts` extraction schema gains couple-story fields so the transcript's story content lands somewhere structured rather than being left for the generator to find.

**Tests.** Cue list rendering; if extraction changes, an extraction test asserting couple-story fields populate from a transcript that contains them.

**Size.** Small-to-medium, depending on spoken vs typed.

**Dependency.** Lighter if theme 1 lands first — the same gate can prompt for story.

---

## Theme 3 — Separate engine, publishing target, and tenant profile

**Goal.** Author Made's voice becomes data the engine loads, not the engine itself.

This is the largest theme and the only one gated on D4. It splits cleanly into two halves of very different cost.

### 3a. Decouple the team roster *(do this regardless of D4)*

Smaller than the themes doc implied — **11 references across 3 files**:

| File | Refs |
|---|---|
| `apps/web/src/PostDetailsForm.tsx` | 5 |
| `packages/contracts/src/index.ts` | 4 |
| `apps/api/src/lib/house-style/facts.ts` | 2 |

- `packages/contracts/src/index.ts` — `memberId: z.enum(TEAM_ROSTER.map(...))` makes `TeamMemberId` a union of five string literals, so the validator *and* the type system reject anyone else. Change to a validated `string`, and move `TEAM_ROSTER` out of contracts into tenant config.
- `facts.ts` — `TEAM_ROSTER.find(...)` takes the roster as a parameter or from loaded config.
- `PostDetailsForm.tsx` — renders the roster from config; the `Author Made team` legend (line 152) becomes the tenant's name.

**Tests.** Existing team-credit tests should pass unchanged with the roster injected; add one asserting a roster that isn't Author Made's works end to end.

**Size.** Small-to-medium. Mechanical, well-covered by existing tests.

### 3b. Three-layer split *(only if D4 says multi-tenancy is real)*

- **Engine** — pipeline, lint mechanics, schemas, assembly. Generic.
- **Publishing target** — `SEO_TITLE_MAX_CHARS`, `SEO_DESCRIPTION_*`, field names. These are Squarespace's constraints, currently sitting in `config.ts` next to matters of taste.
- **Tenant profile** — voice example, `BANNED_PHRASES`, `NEVER_PUBLISH`, title style, region table, `TAG_VOCABULARY`, venue spotlights, kids note, keyword suffixes, roster.

`config.ts` has 73 brand-specific references; nearly all become tenant-profile data. `assemble.ts` (8) and `prompts.ts` (8) take the profile as input rather than importing constants.

**Size.** Large. Touches most of `house-style/` and all its tests.

**Risk.** Pure refactor with no user-visible payoff for Author Made. Easy to half-finish. If D4 is uncertain, do 3a and stop.

---

## Theme 4 — Lint mechanical tells in body prose

**Goal.** Em dashes and similar tells get caught where they actually appear.

The cheapest theme and fully independent — buildable this week.

- `apps/api/src/lib/house-style/config.ts` — add a construction-rules block beside `BANNED_PHRASES`. Start with an em-dash budget rather than a ban: published Author Made posts do use them, just sparingly. Suggest max 2 per post, which would have flagged this draft's 8.
- `apps/api/src/lib/house-style/lint.ts` — `lintHeading` already regexes `[:–—]` at line 56, but only for headings. Add a body-prose check in `lintGeneratedPost` over `bodyText(generated)`.
- `apps/api/src/lib/prompts.ts` — one line in `VOICE`, which currently covers vocabulary but says nothing about construction.

**Open question.** Em dashes are the one tell named so far. Worth listing the others before building, so the rule set isn't a single special case — candidates from this draft: "It was the kind of X that…", "think grand stairwells", tricolons, and the "not just X, but Y" shape.

**Tests.** Same split that worked for the stance rules: assert the Bree & Sean body trips the budget, and that Nicole & Jeff and Amber & Phillip — which contain em dashes — do not.

**Size.** Small.

**Dependency.** Lands inside or beside `STANCE`, so cleaner after D3.

---

## Theme 5 — Worldview neutrality with explicit opt-in

**Goal.** The copy stops assigning meaning the couple didn't claim, in either direction.

- `apps/api/src/lib/prompts.ts` — a rule in `STANCE`: don't attribute luck, fate, blessing, providence or cosmic meaning to anything the couple didn't say. Note this cuts both ways — "the universe" is as much a position as "God", which is why the rule is about *assigning meaning* rather than about religious words.
- `apps/api/src/lib/house-style/config.ts` — a pattern list for the lint backstop, in the shape `NEVER_PUBLISH` already uses. Narrow and high-precision: "blessing from the universe", "meant to be", "written in the stars", "someone was watching over". False positives here are costly, because a couple who *did* say something like this should keep it.
- Faith context (needs D5):
  - *Inferred* — `facts.ts` already has `HOUSE_OF_WORSHIP_PATTERN` matching church, cathedral, parish, basilica, synagogue, temple, mosque. Already multi-faith, which matters for 3b. But it only tells you the venue type.
  - *Asked* — a `faithContext` field on `WeddingDetailsSchema`, set at intake. More honest, more friction.
  - Either way it reaches the prompt as a permission: when the wedding is openly religious, matching its register is allowed.

**Tests.** The "blessing from the universe" line trips the rule; a transcript where the couple themselves say something faith-based does not.

**Size.** Small, plus whatever D5 costs at intake.

**Dependency.** Wants theme 3's tenant/default split to be meaningful — a "neutral default" only exists once default and Author Made are different things. Buildable before that, just less coherent.

---

## Theme 6 — Flag severity

**Goal.** The 60–80% prose target stands, while a small set of things is held back hard.

Today every flag is advisory: `assembleBlogOutput` concatenates them into `review_flags` and returns the post regardless.

- `packages/contracts/src/index.ts:153` — `review_flags: z.array(z.string())` becomes an array of `{ severity, message }`. This is the breaking change that gives the theme its size.
- `apps/api/src/lib/house-style/assemble.ts:238` and `facts.ts` — every `flags.push(...)` call site gains a severity. Roughly 10 sites.
- `apps/api/src/lib/google-docs.ts:33-35` — currently renders flags as flat bullets. Group by severity so blocking items are unmissable.
- Pipeline — decide what `blocking` actually does: refuse to publish the doc, or publish with a prominent header. Refusing is a real workflow change and deserves its own decision.

Proposed severities: `blocking` (the three publication risks — medical details, property safety claims, vendor criticism), `fix-before-publish` (house-format errors, placeholder values), `fyi` (new tags, suggestions).

**Tests.** Four test files reference `review_flags` and would need updating: `generation.test.ts`, `google-docs.test.ts`, `evals.test.ts`, `house-style.test.ts`.

**Size.** Medium. Mechanically simple, but a contract change with a wide blast radius through tests.

---

## Suggested order

| Order | Theme | Why here | Size |
|---|---|---|---|
| 1 | **1a** placeholder rejection | Pure bug, no decisions, stops the worst visible failure | S |
| 2 | **4** mechanical tells | Independent, immediate quality gain | S |
| 3 | **3a** roster decoupling | Small, unblocks 3b later, no behaviour change | S–M |
| 4 | **1b** intake gate | Needs D1/D2; upstream of 2 and 5 | M |
| 5 | **2** couple story | Cheaper once the gate exists | S–M |
| 6 | **6** flag severity | Touches flags, so after the flag set has settled | M |
| 7 | **5** neutrality | Wants D5 and reads better after 3 | S |
| 8 | **3b** three-layer split | Largest, only if D4 says yes | L |

The first three need no decisions from you and could ship as three small PRs. Everything from step 4 on waits on D1/D2.

---

## What this plan does not cover

- The body copy of any existing post. Those are outputs, not code.
- `feat/house-style-stance` is still unmerged and unreviewed by Amy. Themes 4 and 5 assume it lands first; if it doesn't, they need a home of their own.
- PR #21 (the dev-script fix) is also still open. Not related to these themes, but it's the branch that makes `npm run dev` build contracts, so it's worth merging before a run of branch-heavy work.
