import fs from "node:fs";
import path from "node:path";

import type { TranscriptionSource } from "../contracts.js";
import { API_CONFIG } from "../config.js";

function buildDecodeGuidance(mimeType: string, body: string) {
  const formatHint = `Supported upload formats are WebM (.webm), MP4/M4A (.mp4, .m4a), MP3 (.mp3), and WAV (.wav).`;
  const lowerBody = body.toLowerCase();
  const looksLikeDecodeFailure = /invalid file|decode|decoding|unsupported|corrupt|malformed|format/.test(lowerBody);

  if (!looksLikeDecodeFailure) {
    return null;
  }

  return `Whisper could not decode the uploaded ${mimeType} file. ${formatHint} If this came from a phone recorder or editor export, re-encode it to WAV or MP4 and retry.`;
}

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
    const guidance = [400, 415, 422].includes(response.status) ? buildDecodeGuidance(mimeType, body) : null;
    throw new Error(
      guidance ? `Whisper transcription failed (${response.status}): ${body}\n${guidance}` : `Whisper transcription failed (${response.status}): ${body}`
    );
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
