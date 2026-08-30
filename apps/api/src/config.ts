import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const repoRootEnvPath = path.resolve(currentDir, "../../../.env");

loadEnv({ path: repoRootEnvPath });
loadEnv();

const port = Number(process.env.PORT ?? 8787);
const defaultApiBaseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:8787";
const defaultGoogleRedirectUri = `${defaultApiBaseUrl.replace(/\/$/, "")}/api/auth/google/callback`;

export const API_CONFIG = {
  port,
  baseUrl: defaultApiBaseUrl,
  contractorToken: process.env.CONTRACTOR_TOKEN ?? "demo-contractor-token",
  storageDir: process.env.STORAGE_DIR ?? ".data",
  sqlitePath: process.env.SQLITE_PATH ?? ".data/wedding-recap.sqlite",
  web: {
    origin: process.env.WEB_ORIGIN ?? "http://127.0.0.1:4173"
  },
  google: {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI ?? defaultGoogleRedirectUri,
    docFolderId: process.env.GOOGLE_DOC_FOLDER_ID ?? "",
    scopes: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive"
    ]
  },
  upload: {
    maxSizeBytes: 50 * 1024 * 1024,
    ttlSeconds: 900,
    allowedMimeTypes: ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav"]
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL ?? "whisper-1",
    generationModel: process.env.OPENAI_GENERATION_MODEL ?? "gpt-4o-mini"
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