import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry"
  },
  webServer: [
    {
      command: "npm --workspace @wedding/api run dev",
      url: "http://127.0.0.1:8787/health",
      reuseExistingServer: false,
      timeout: 30_000
    },
    {
      command: "VITE_API_BASE_URL=http://127.0.0.1:8787 npm --workspace @wedding/web run dev -- --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173/recap/new",
      reuseExistingServer: false,
      timeout: 30_000
    }
  ]
});