import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/** Подхватывает локальный e2e/.env, не печатая значения. Уже заданные переменные не трогает. */
function loadLocalEnv(): void {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Z0-9_]+$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadLocalEnv();

const desktop = { width: 1280, height: 800 };
const mobile = { width: 390, height: 844 };

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 25_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://paulos99.github.io/multiframe-partner/',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    actionTimeout: 25_000,
    navigationTimeout: 45_000,
    ...devices['Desktop Chrome'],
    viewport: desktop,
  },
  projects: [
    { name: 'desktop', use: { viewport: desktop, isMobile: false, hasTouch: false } },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 5'],
        viewport: mobile,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
