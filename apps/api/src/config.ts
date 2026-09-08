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
    maxSizeBytes: 50 * 1024 * 1024,
    ttlSeconds: 900,
    allowedMimeTypes: ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav"]
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? "",
    transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe",
    extractionModel: process.env.OPENAI_EXTRACTION_MODEL ?? "gpt-4.1-mini"
  }
} as const;