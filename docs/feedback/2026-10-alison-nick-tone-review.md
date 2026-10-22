# Tone review: Alison & Nick (Oct 2026)

Source: Google Doc "Alison & Nick's chaotic, heartfelt wedding at Airbnb with a ballroom and generator in Florida, FL", generated 2026-10-21. Amy's review: "this sucks."

Michael's read: it's "very negative sounding", and the fix is to take the chaos and negativity and spin it positively.

This doc checks that against what's actually published on authormadephoto.com/blog.

---

## 1. The verdict

Amy is right, and the problem is bigger than tone. **19 separate passages** read as complaints, and three of them should never be published at all.

The draft is not a bad wedding story. It's an accurate field debrief that nobody converted into a blog post.

---

## 2. Three passages that are publication risks, not style problems

These need to be impossible for the pipeline to emit, regardless of what the tone prompt says.

| # | Passage | Why it can't ship |
|---|---|---|
| 1 | "Alison's parents couldn't make it due to her **father's medical condition** and some travel logistics" | A named third party's medical situation, published on a public marketing site. Not Alison's to share, let alone ours. |
| 2 | "no main power after a **previous electrical fire**" | A factual safety claim about someone's property, on the record, in a post that names the location. |
| 3 | "the DJ was determined to keep things moving, **sometimes a little too enthusiastically**" and the DJ's generator failing "causing a 10-minute delay and **a hint of tension**" | Named-role criticism of another vendor. The blog credits vendors by name; it has never graded their performance. |

No published post does anything like these. This is a hard filter, not a wording preference.

---

## 3. What the published posts actually do with hard material

Michael's instinct was that nothing negative appears on the blog. That's *almost* right, and the exact shape of the exception is the useful part.

**Negatives do appear. They are never left open, and never aimed at a person.**

### Nicole & Jeff — a storm destroys the timeline

The hardest published case: the ceremony is rained out five minutes before it starts, and the bride's brother died within the year.

| Move | The line |
|---|---|
| **Reframe stated as a belief, up front** | "We firmly believe that rain IS good luck on your wedding day, and Nicole & Jeff's unexpectedly dreary wedding day at Villa Festa is living proof." |
| **Problem and resolution in one breath** | "when heavy rain rolled in just five minutes beforehand, everything quickly shifted beneath the covered pavilion. The transition was smooth, guests stayed dry, and once the rain passed, we were still able to explore the property for portraits." |
| **The problem becomes a vendor compliment** | "One thing we especially appreciate about Villa Festa is how flexible the property is when Florida weather inevitably decides to do its own thing." |
| **Hardship named plainly, then closed** | "Then the storm arrived... Rain poured down, decorations were hurried under cover, and the original timeline disappeared. **But as soon as there was a break in the weather, everyone adapted and the ceremony moved forward.**" |
| **Grief handled with dignity, no clinical detail** | "In honor of Nicole's brother, who had passed away less than a year earlier, a special song played before she walked down the aisle." |
| **Inconvenience we absorbed, told as service** | "We even extended coverage so the couple wouldn't lose any of the memories they had planned to capture earlier in the day." |
| **Explicit pivot at the close** | "Yes, the weather forced everyone to pivot. **But none of that is what we'll remember first.** We'll remember Jeff struggling to read his vows..." |

That last move is the template. The post does not pretend the storm didn't happen — it names it, then says what outranks it.

### Amber & Phillip — "chaos" is allowed, but only one kind

This matters, because "chaotic" is in the Alison & Nick title and Amy rejected it.

The published post uses the word twice, happily:

- "their **chaotic yet laid-back personalities**"
- "the quiet tears during their vows and the **absolute chaos of the dance floor**"

Both times, chaos is **chosen by the couple and joyful** — it's their energy, a compliment. In the draft, chaos is **imposed by logistics and stressful**: "heat-induced chaos", "as soon as everyone arrived, the chaos hit its peak" (because there was no coordinator).

So the rule isn't "ban the word chaos." It's: **chaos can belong to the people, never to the logistics.**

The same post also shows the move for an unglamorous venue — a backyard on a friend's property becomes "It was about having the space to bring their people together and celebrate without limitations" — and for a plan that fell through: the proposal ring didn't arrive in time, so Phillip "pivoted" to a sunset boat proposal with dolphins. The setback exists only as the setup for something better.

---

## 4. Side by side

| The day's fact | What the draft said | What the house style would say |
|---|---|---|
| Unconventional venue, no mains power | "an Airbnb with a dedicated ballroom space, but no main power after a previous electrical fire... still muggy and a little buggy" | An unconventional space the couple chose, with room for their people — the way Amber & Phillip's backyard is handled |
| Hot day | "Nick was sweating so much, and he is not a fan of Florida's heat"; "Alison was hot, tired, and ready to be done" | A Florida summer afternoon; we moved portraits later so they could cool down first — the inconvenience we absorbed, not the discomfort they felt |
| No coordinator | "There was no coordinator, so as soon as everyone arrived, the chaos hit its peak" | We helped keep the day moving — stated as service, never as a gap |
| Bride's family absent | "With Alison's family missing, there was a bittersweet feeling in the air"; medical detail | Omit, or at most: surrounded by Nick's family and their closest friends |
| Few detail items | "Alison just shrugged: 'Yeah, we don't really care.'" | They kept it simple and personal — a rosary, her shoes |
| Short ceremony in a low spot | "held in a little ditch at the back of the property... No elaborate readings or drawn-out speeches" | Short, sweet, and exactly what they wanted |
| Our own equipment trouble | "dodging technical hiccups (camera sensors and all)" | Omit entirely. No published post mentions our gear failing. |
| Bugs, humidity | "full of bugs, thanks to the muggy air" | Omit |
| Our effort to lift the mood | "we did our best to keep the energy positive" | Omit — it concedes the mood was bad |

---

## 5. Why the pipeline produced this

The generation prompt (`apps/api/src/lib/prompts.ts`) has a `VOICE` block, and **it says nothing about stance.** What it does say pushes hard the other way:

- "**Specific beats generic**: who did or said what, the funny or emotional detail, what we did behind the scenes. Pull these from the transcript."
- "**Use only facts from the inputs.** If a beat isn't there, leave it out."

Both are good rules, and together with the new transcript access (commit `0d89bb1` started feeding the full transcript to the generator) they are the direct cause. A field recap is a photographer debriefing a hard day — candid, problem-focused, that's what the format is *for*. Told to be maximally specific and faithful to that source, the model wrote down the problems. It did exactly what it was asked.

The existing guardrails don't catch any of this:

- `BANNED_PHRASES` in `house-style/config.ts` is a **vocabulary** list (tapestry, revelry, timeless). It targets the opposite failure — the florid AI-editorial voice from the Elisha & Thomas draft. It has no concept of sentiment. The only thing it flagged here was "truly".
- `GENERIC_TITLE_WORDS` blocks *bland* descriptors (beautiful, magical, stunning). "chaotic" is specific, so it passed.
- `lint.ts` has no sentiment check at all.

So the Elisha & Thomas fix worked — the voice is now plain, warm and specific, and the structure is right. This is a different failure that the same change exposed.

---

## 6. Proposed change (for Amy to react to, not yet applied)

Three layers, matching how the existing rules are built:

**1. A `STANCE` block in the generation prompt**, stating the house move explicitly:

> We are the couple's advocate, writing for them and their families to read. Every hard thing in the transcript is either resolved in the same paragraph or left out. Name a difficulty only when you can immediately say how it was handled or what it made possible. Close any section that opens on a setback with what outranked it.
>
> Never publish: a guest's or family member's medical or personal circumstances; anything that reflects on another vendor's performance; our own equipment or technical trouble; physical discomfort felt by the couple or guests (heat, bugs, exhaustion); the absence of a planner, coordinator or staff; or a quote that makes the couple sound dismissive about their own day.
>
> "Chaos" and similar words may describe the couple's own energy or a packed dance floor. They may never describe the schedule, the venue or the vendors.

**2. A sentiment pass in `lint.ts`**, flagging the categories above by pattern so they fail validation and trigger the existing revision loop rather than reaching the doc.

**3. A hard block for the three items in section 2** — medical details, property safety claims, vendor performance — which should never be emitted even if the model is asked to write about them.

### Separate from tone

The venue is "Airbnb with a ballroom and generator" in the title, the SEO string, the slug and the tags. That's an unresolved placeholder from intake, not a tone problem, and it would have made the post unpublishable on its own. The pre-publish checklist did flag it.

---

## 7. Open question for Amy

Section 3 shows the published posts don't omit hard things — they resolve them. The storm, the brother, the ring that didn't arrive are all on the page.

So which does she want?

- **Resolve it**: keep a difficulty when it has a real payoff, Nicole & Jeff style. Richer stories, but it depends on the transcript actually containing the resolution.
- **Omit it**: leave hard material out unless she adds it back herself. Safer and blander.

The proposed `STANCE` block above assumes *resolve it*, since that's what the blog does today. Worth confirming before it's encoded.
