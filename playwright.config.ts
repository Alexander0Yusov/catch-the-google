import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./src/test/e2e",
  timeout: 60000,
  use: {
    headless: true,
  },
  webServer: [
    {
      command: "npm run build && npm run start:back",
      port: 3001,
      reuseExistingServer: true,
      timeout: 120000,
      env: {
        DATABASE_URL: "postgresql://local:local@localhost:5432/local",
        NODE_ENV: "development",
        PORT: "3001",
        CORS_ORIGIN: "http://localhost:3000",
      },
    },
    {
      command: "npm run start:front",
      port: 3000,
      reuseExistingServer: true,
      timeout: 120000,
    },
  ],
});
