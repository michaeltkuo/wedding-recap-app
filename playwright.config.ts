import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "on-first-retry"
  },
  webServer: [
    {
      command: "PORT=8788 WEB_ORIGIN=http://127.0.0.1:4174 npm --workspace @wedding/api run dev",
      url: "http://127.0.0.1:8788/health",
      reuseExistingServer: false,
      timeout: 30_000
    },
    {
      command: "VITE_API_BASE_URL=http://127.0.0.1:8788 npm --workspace @wedding/web run dev -- --host 127.0.0.1 --port 4174",
      url: "http://127.0.0.1:4174/recap/new",
      reuseExistingServer: false,
      timeout: 30_000
    }
  ]
});