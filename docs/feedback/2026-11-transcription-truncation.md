# Transcription was silently losing half of every long recap (Nov 2026)

Found while trying to run an A/B of the house-style stance rules on the Alison & Nick field recap. The A/B never happened; this is what it turned up instead.

## Symptom

The merged Alison & Nick recording — three voice memos, 18 minutes 57 seconds — was uploaded and transcribed. The transcript came back as **1,631 words**, ending mid-word:

> "...We end up having three hours of dancing on the back end. Three hours of nothing. He was like, OK, we're gonna do this. We're gonna do that. We're gonna do this. We're"

That is roughly 11 minutes of a 19-minute recording. About 8 minutes were gone.

Nothing failed. The OpenAI call returned 200, the pipeline stored the partial transcript as if it were complete, and extraction ran against it. Extraction then couldn't find the couple's names anywhere in the surviving text, so the session halted at `follow_up_required` asking who the couple were — a confusing symptom several steps downstream of the actual fault.

## Cause

`gpt-4o-mini-transcribe` was the configured default. The 4o transcribe models generate the transcript as **output tokens** and cap at 2,000 of them. 1,631 words is approximately 2,000 tokens, so the transcript stopped exactly at the ceiling.

The model returns no error, no `finish_reason`, and no indication in a `response_format: "text"` body that anything was cut. From the caller's side a truncated transcript is indistinguishable from a complete one.

Community reports describe the same behaviour at 8–11 minutes of audio, and note that `whisper-1` returns complete transcripts for the same files. OpenAI has published no statement on it, and the model page is marked deprecated — so the 2,000-token figure is the documented cap, but the silent-truncation behaviour is only established by reproduction, including ours.

`transcribeAudioFromUpload` sent the whole file in one request with no chunking, no duration check, and no validation of what came back.

## Why it mattered more than it looks

Michael's stated workflow is multiple voice memos per wedding, merged into one file. That makes 15–25 minute recordings the normal case, not an edge case. Every one of them was losing its back half — which, in a field recap dictated in chronological order, is the reception, the portraits and the send-off.

The thin reception coverage in the Alison & Nick post is more likely this than a prompt problem.

## Fix

1. **Default to `whisper-1`** (`apps/api/src/config.ts`). It has a 25 MiB file limit rather than a token ceiling, and returns the complete transcript. Still overridable with `OPENAI_TRANSCRIPTION_MODEL`.
2. **Align the upload cap with the transcription cap.** `upload.maxSizeBytes` was 50 MiB while the transcription API accepts 25 MiB, so an upload could succeed and then fail at transcription. Now 25 MiB.
3. **Detect truncation** (`assertTranscriptNotTruncated` in `pipeline.ts`), so this cannot recur silently if the model is changed back:
   - A **capped model** returning ≥ 1,500 words is at its ceiling — throw, naming `whisper-1` in the message. This only fires for known capped models, so a short recording that genuinely trails off is unaffected.
   - Any transcript **ending mid-sentence** logs a warning. Model-agnostic, advisory only, because people do trail off.

## Verification

Same audio (the merged 18:57 Alison & Nick recap), same pipeline, no details passed, only the model changed:

| | gpt-4o-mini-transcribe | whisper-1 |
|---|---|---|
| Words returned | 1,631 | **3,370** |
| Ends on a sentence | no — stops mid-word | yes |
| Transcription time | 21.2 s | 55.9 s |
| Error raised | none | none |

**whisper-1 recovered 1,739 words that were previously discarded — the transcript more than doubled.** It also ends where the recording ends, on the photographer signing off:

> "...that's all that matters. And I was like, okay, cool. So that was my experience and, um, wow. 13, 14 minutes. So sorry."

So roughly 52% of every long recap was being thrown away.

### An unrelated thing this turned up

Neither transcript contains the couple's names. The complete whisper-1 transcript names only Maddie (shooting), Michael (the recipient), and some places — the couple is never named aloud in 19 minutes of audio.

That means the published Alison & Nick Google Doc, whose first review flag reads *"Couple names came from the recording ("Alison" & "Nick")"*, cannot have gotten those names from this recording. Either it was generated from different audio, or the names were typed at intake and that flag's wording is misleading: `resolvePostFacts` emits "came from the recording" whenever *either* name is missing from `details`, then prints both.

Worth knowing for two reasons. It is more evidence for theme 1 — names should be required ground truth, since the photographer plainly does not say them. And it means that Google Doc is not a valid A/B baseline for this audio.

## Not fixed here

- **Audio longer than 25 MiB** still has no path. At the 64 kbps the merge script produces, that is about 50 minutes — beyond any single recap today, but a hard wall rather than a graceful one. Chunking with ordered reassembly is the real answer, and is worth doing before the limit is hit in the field.
- **No duration check before upload.** The app accepts any file under the size cap without knowing how long it is. Duration is the number that actually matters for transcription limits.
- **The A/B this came from** still hasn't run. The corrected design feeds one captured transcript through both branches via `simulate.transcriptText`, which skips transcription entirely and isolates the house-style rules.
