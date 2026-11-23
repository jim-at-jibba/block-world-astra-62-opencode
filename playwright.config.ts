import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  timeout: 60000,
  workers: 1,
  use: {
    channel: "chromium",
    baseURL: "http://127.0.0.1:4187",
    viewport: { width: 1280, height: 800 },
    launchOptions: { args: ["--enable-unsafe-swiftshader"] },
  },
  webServer: {
    command: "npm run dev -- --port 4187 --strictPort",
    url: "http://127.0.0.1:4187",
    reuseExistingServer: !process.env.CI,
  },
});
