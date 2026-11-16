# A/B: does the STANCE block actually change the writing? (Nov 2026)

Yes. Measurably, and in the way it was designed to.

## Method

The open question from the Bree & Sean review was whether the stance rules do anything, or whether that post simply came from a pleasant day. Bree & Sean was a weak test — a balcony ceremony, bagels and a park visit, with almost no hardship for the rules to act on, and its lint caught nothing.

This test uses a real field recap from a harder day, and holds everything constant except the branch.

- **One transcript.** A 10:33 contractor voice memo, transcribed once with whisper-1 (1,823 words), saved to disk and reused.
- **One recap.** Extraction run once at temperature 0, saved as JSON and reused. Both sides see identical structured facts.
- **One set of details.** Couple names and city supplied identically to both sides (placeholders — the memo names neither, which is itself evidence for theme 1).
- **A harness outside the app.** `buildGenerationPrompt`, `resolvePostFacts`, `lintGeneratedPost` and `assembleBlogOutput` are imported from the working tree, so switching branches changes the prompt and the lint while the harness stays byte-identical. Nothing in the app was modified for the test.
- **Three samples per side.** Generation runs at temperature 0.7, so a single pair would not separate signal from noise.

`simulate` mode looked like the obvious way to hold the transcript fixed, but it stubs generation entirely (`simulatedGeneratedPost`) and never calls the model, so it is useless for this.

## What was in the recap

The memo is a candid debrief of a difficult backyard wedding. Extraction surfaced, among other things:

- heavy rain starting mid-ceremony
- the photographer's flash dying as the bride walked down the aisle
- a camera harness snapping mid-shoot
- a truck and trailer blocking the driveway, forcing four car moves
- no dancing at the reception despite music
- the bride wearing a prom dress
- a guest quote: **"I start chemo tomorrow"**

This is what Michael predicted when he said contractors' memos would carry sassy notes. It is the real input shape.

## Result

| Marker | no stance | with stance |
|---|---|---|
| **Guest's chemotherapy named** | **3/3** | **0/3** |
| Camera harness failure | 3/3 | 0/3 |
| Flash dying | 1/3 | 0/3 |
| Stress / tension language | 2/3 | 0/3 |
| **`findForbiddenTopics` tripped** | **3/3 runs** | **0/3 runs** |
| Rain | 3/3 | 3/3 |
| Prom dress | 3/3 | 3/3 |
| Blocked driveway | 3/3 | 2/3 |
| Mean body length | 761 words | 641 words |

Consistent across every sample on both sides. Not noise.

## The important line

Every run without the stance block published a guest's cancer treatment:

> "Sam's mom, starting chemo the next day, was hoping for a mother-daughter dance, but it didn't happen, and emotions ran high as she left for the night."

> "Some key family members were missing, and Sam's mom was especially emotional about not getting to do a mother-daughter dance (she was starting chemo the next day)."

> "One truly emotional moment came when Sam's mom asked about a mother-daughter dance, sharing that she would start chemo the next day."

With the stance block: gone, 3/3.

## It reframes rather than deletes

The equipment failures didn't vanish — they changed owner. Without the stance:

> "Between malfunctioning flashes, a camera harness that snapped mid-shoot, and the deep darkness of a backyard at night, we had to improvise at every turn."

> "Despite technical issues (a snapped camera harness, a dying flash), everyone pitched in..."

With it, the same beat becomes the people who helped:

> "Most of the night, though, our camera was out in the dark — bridesmaids and friends stepping in to help hold flashes or move lights..."

> "Bridesmaids checked in on us, held our flash, and made sure the couple had everything they needed."

That is the "credit the save to people" rule working as written.

## It does not sanitise

Rain and the prom dress survive 3/3 on both sides. The difference is how rain closes. Without the stance it stacks up with everything else:

> "We loved getting to be part of such a laid back, personal day — rain, flash fails, driveway drama and all."

> "...with the rain coming down, the dance floor empty and chipotle bowls in hand..."

With it, each mention resolves:

> "The ceremony started just as the rain picked up, and instead of scattering, everyone simply stayed put."

> "As the rain cleared, the backyard transformed for the reception."

> "Umbrellas came out, vows were exchanged, and laughter carried over the sound of the rain."

This is the "resolve it" behaviour chosen in D3, rather than omitting anything difficult.

## Caveats

- One wedding, three samples per side. The direction is unambiguous and consistent, but it is still a single transcript.
- Couple names and city were placeholders, since the memo contains neither. They were identical on both sides, so they cannot explain the difference.
- Lower word count with the stance (641 vs 761) is consistent with cutting material. Whether that lands inside Amy's preferred range is a separate judgement from whether the rules work.
- This says nothing about whether the *voice* improved. Voice is the `VOICE` block, identical on both branches. The question here was only stance.

## Reproducing

Harness and all six outputs are in the session scratchpad. Re-running needs the saved transcript and recap, the harness, and a checkout of each branch; generation cost was about twelve cents for six samples.
