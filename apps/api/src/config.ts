export const API_CONFIG = {
  port: Number(process.env.PORT ?? 8787),
  contractorToken: process.env.CONTRACTOR_TOKEN ?? "demo-contractor-token",
  upload: {
    maxSizeBytes: 50 * 1024 * 1024,
    ttlSeconds: 900,
    allowedMimeTypes: ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav"]
  }
} as const;