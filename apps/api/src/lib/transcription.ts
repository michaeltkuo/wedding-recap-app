import fs from "node:fs";
import path from "node:path";

import type { TranscriptionSource } from "../contracts.js";
import { API_CONFIG } from "../config.js";

export async function transcribeAudioFile(filePath: string, mimeType: string) {
  if (!API_CONFIG.openai.apiKey) {
    throw new Error("OPENAI_API_KEY is not configured. Configure Whisper credentials to transcribe uploaded audio.");
  }

  const formData = new FormData();
  const fileBuffer = await fs.promises.readFile(filePath);
  if (fileBuffer.byteLength === 0) {
    throw new Error("Uploaded audio file is empty. Please record for at least a few seconds and try again.");
  }

  const audioBlob = new Blob([fileBuffer], { type: mimeType });
  const sourceFileName = path.basename(filePath);
  formData.append("file", audioBlob, sourceFileName);
  formData.append("model", API_CONFIG.openai.model);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_CONFIG.openai.apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Whisper transcription failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as { text?: string };
  if (!payload.text || payload.text.trim().length === 0) {
    throw new Error("Whisper transcription returned empty text");
  }

  return {
    text: payload.text.trim(),
    source: "openai" as TranscriptionSource
  };
}
