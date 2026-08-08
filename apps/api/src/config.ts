const port = Number(process.env.PORT ?? 8787);

export const API_CONFIG = {
  port,
  contractorToken: process.env.CONTRACTOR_TOKEN ?? "demo-contractor-token",
  web: {
    origin: process.env.WEB_ORIGIN ?? "http://127.0.0.1:4173"
  },
  google: {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI ?? `http://127.0.0.1:${port}/api/auth/google/callback`,
    docFolderId: process.env.GOOGLE_DOC_FOLDER_ID ?? "",
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
  }
} as const;