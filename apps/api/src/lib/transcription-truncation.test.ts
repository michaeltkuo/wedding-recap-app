import { describe, expect, it, vi } from "vitest";

import { assertTranscriptNotTruncated, endsMidSentence, isTokenCappedTranscriptionModel } from "./pipeline.js";

// The real tail of the Alison & Nick transcript (19 minutes of audio, 1,631 words returned).
const TRUNCATED_TAIL =
  "the DJ, who's rushing everything, rushing, rushing, rushing. We end up having three hours of dancing on the back end. Three hours of nothing. He was like, OK, we're gonna do this. We're gonna do that. We're gonna do this. We're";

function wordsOfLength(count: number) {
  return Array.from({ length: count }, () => "word").join(" ");
}

describe("transcription truncation", () => {
  it("knows which models cap their output", () => {
    expect(isTokenCappedTranscriptionModel("gpt-4o-mini-transcribe")).toBe(true);
    expect(isTokenCappedTranscriptionModel("gpt-4o-transcribe")).toBe(true);
    expect(isTokenCappedTranscriptionModel("whisper-1")).toBe(false);
  });

  it("spots a transcript that stops mid-word", () => {
    expect(endsMidSentence(TRUNCATED_TAIL)).toBe(true);
  });

  it("accepts a transcript that ends on a sentence", () => {
    expect(endsMidSentence("We headed inside once the portraits wrapped up.")).toBe(false);
    expect(endsMidSentence("Was it the best bagel spread we've seen? Absolutely!")).toBe(false);
    expect(endsMidSentence("She said it was “the best day of my life.”")).toBe(false);
  });

  // The failure that shipped: 1,631 words from a capped model, API returned 200.
  it("throws when a capped model returns a transcript at its ceiling", () => {
    expect(() => assertTranscriptNotTruncated(`${wordsOfLength(1_630)} ${TRUNCATED_TAIL}`, "gpt-4o-mini-transcribe")).toThrow(
      /looks truncated/
    );
  });

  it("names the fix in the error", () => {
    expect(() => assertTranscriptNotTruncated(wordsOfLength(1_700), "gpt-4o-mini-transcribe")).toThrow(/whisper-1/);
  });

  it("leaves whisper-1 alone at the same length", () => {
    expect(() => assertTranscriptNotTruncated(`${wordsOfLength(5_000)}.`, "whisper-1")).not.toThrow();
  });

  it("does not throw for a short recording from a capped model", () => {
    expect(() => assertTranscriptNotTruncated("A short recap that ends properly.", "gpt-4o-mini-transcribe")).not.toThrow();
  });

  it("warns rather than throws when whisper-1 output ends mid-sentence", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => assertTranscriptNotTruncated("and then we headed over to the", "whisper-1")).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ends mid-sentence"));
    warn.mockRestore();
  });
});
