import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const repoRootEnvPath = path.resolve(currentDir, "../../../.env");

loadEnv({ path: repoRootEnvPath });
loadEnv();

export const API_CONFIG = {
  port: Number(process.env.PORT ?? 8787),
  baseUrl: process.env.API_BASE_URL ?? "http://127.0.0.1:8787",
  contractorToken: process.env.CONTRACTOR_TOKEN ?? "demo-contractor-token",
  storageDir: process.env.STORAGE_DIR ?? ".data",
  sqlitePath: process.env.SQLITE_PATH ?? ".data/wedding-recap.sqlite",
  upload: {
    maxSizeBytes: 50 * 1024 * 1024,
    ttlSeconds: 900,
    allowedMimeTypes: ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav"]
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_TRANSCRIPTION_MODEL ?? "whisper-1"
  },
  googleDocs: {
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    serviceAccountPrivateKey: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
    oauthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    oauthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    oauthRefreshToken: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
    folderId: process.env.GOOGLE_DOCS_FOLDER_ID
  }
} as const;