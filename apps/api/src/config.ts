import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const thisFilePath = fileURLToPath(import.meta.url);
const thisDir = dirname(thisFilePath);

dotenv.config();
dotenv.config({ path: resolve(thisDir, "../../../.env") });

const port = Number(process.env.PORT ?? 8787);
const defaultWebOrigins = ["http://127.0.0.1:4173", "http://127.0.0.1:4174", "http://127.0.0.1:4175"];
const webOrigins = parseOrigins(process.env.WEB_ORIGINS ?? process.env.WEB_ORIGIN);

function parseOrigins(value: string | undefined) {
  if (!value) {
    return defaultWebOrigins;
  }

  const parsed = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : defaultWebOrigins;
}

export const API_CONFIG = {
  port,
  origin: process.env.API_ORIGIN ?? `http://127.0.0.1:${port}`,
  contractorToken: process.env.CONTRACTOR_TOKEN ?? "demo-contractor-token",
  web: {
    origin: webOrigins[0],
    origins: webOrigins
  },
  google: {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI ?? `http://127.0.0.1:${port}/api/auth/google/callback`,
    docFolderId: process.env.GOOGLE_DOC_FOLDER_ID ?? "",
    connectionFile: process.env.GOOGLE_OAUTH_CONNECTION_FILE ?? resolve(thisDir, "../../../.local/google-oauth-connection.json"),
    scopes: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive.file"
    ]
  },
  upload: {
    // Matches the transcription API's own file cap (25 MiB). It used to be 50 MiB, which let an
    // upload through that the transcription call would then reject.
    maxSizeBytes: 25 * 1024 * 1024,
    ttlSeconds: 900,
    allowedMimeTypes: ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav"]
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? "",
    // whisper-1, not gpt-4o-mini-transcribe. The 4o transcribe models emit the transcript as output
    // tokens and cap at 2,000 of them, so audio past roughly 10 minutes is dropped silently - the
    // API still returns 200. A 19-minute field recap came back as 1,631 words ending mid-word.
    // See docs/feedback/2026-11-transcription-truncation.md.
    transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL ?? "whisper-1",
    extractionModel: process.env.OPENAI_EXTRACTION_MODEL ?? "gpt-4.1-mini",
    generationModel: process.env.OPENAI_GENERATION_MODEL ?? "gpt-4.1"
  }
} as const;