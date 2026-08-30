import fs from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

async function loadModuleWithApiKey(apiKey?: string) {
  vi.resetModules();
  vi.doMock("../config.js", () => ({
    API_CONFIG: {
      openai: {
        apiKey,
        model: "whisper-1"
      }
    }
  }));
  return import("./transcription.js");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("../config.js");
});

describe("transcription", () => {
  it("fails when OpenAI API key is missing", async () => {
    const { transcribeAudioFile } = await loadModuleWithApiKey(undefined);

    await expect(transcribeAudioFile("/tmp/clip.webm", "audio/webm")).rejects.toThrow(/OPENAI_API_KEY/i);
  });

  it("fails when uploaded audio is empty", async () => {
    const { transcribeAudioFile } = await loadModuleWithApiKey("test-key");
    vi.spyOn(fs.promises, "readFile").mockResolvedValue(Buffer.alloc(0));

    await expect(transcribeAudioFile("/tmp/empty.webm", "audio/webm")).rejects.toThrow(/empty/i);
  });

  it("surfaces Whisper HTTP errors", async () => {
    const { transcribeAudioFile } = await loadModuleWithApiKey("test-key");
    vi.spyOn(fs.promises, "readFile").mockResolvedValue(Buffer.from("audio"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => "invalid token"
      }))
    );

    await expect(transcribeAudioFile("/tmp/clip.webm", "audio/webm")).rejects.toThrow(/Whisper transcription failed \(401\): invalid token/);
  });

  it("adds decode guidance for malformed audio payloads", async () => {
    const { transcribeAudioFile } = await loadModuleWithApiKey("test-key");
    vi.spyOn(fs.promises, "readFile").mockResolvedValue(Buffer.from("audio"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 422,
        text: async () => "invalid file format"
      }))
    );

    await expect(transcribeAudioFile("/tmp/clip.m4a", "audio/mp4")).rejects.toThrow(/re-encode it to WAV or MP4 and retry/i);
  });

  it("returns normalized transcription text on success", async () => {
    const { transcribeAudioFile } = await loadModuleWithApiKey("test-key");
    vi.spyOn(fs.promises, "readFile").mockResolvedValue(Buffer.from("audio"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ text: "  hello world  " })
      }))
    );

    await expect(transcribeAudioFile("/tmp/clip.webm", "audio/webm")).resolves.toEqual({
      text: "hello world",
      source: "openai"
    });
  });
});