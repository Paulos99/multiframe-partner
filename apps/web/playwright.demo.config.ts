import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /prd-(commercial-demo|roles-parallel)\.spec\.ts/,
  fullyParallel: true,
  workers: 5,
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 900 },
  },
  reporter: [['list']],
});
