import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: 'http://127.0.0.1:4180',
    headless: true,
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 1000 },
  },
  webServer: [
    {
      command: 'node e2e/api-server.mjs',
      url: 'http://127.0.0.1:4181/health',
      reuseExistingServer: false,
    },
    {
      command:
        'node node_modules/vite/bin/vite.js preview --configLoader native --host 127.0.0.1 --port 4180 --strictPort',
      url: 'http://127.0.0.1:4180',
      reuseExistingServer: false,
      env: { VITE_API_URL: 'http://127.0.0.1:4181', VITE_BASE: '/' },
    },
  ],
  reporter: [['list']],
});
