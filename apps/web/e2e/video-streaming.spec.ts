import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const password = 'ui-fixture-password-only';
const VIDEO = readFileSync(new URL('./fixtures/tiny-video.webm', import.meta.url));
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkaPhfDwAFhwJ/lXcFJgAAAABJRU5ErkJggg==',
  'base64',
);
const ORIGINAL = 'https://bucket.example/materials/mat_vid?sig=original';
const STREAM = (n: number) => `https://bucket.example/materials/mat_vid_stream?sig=${n}`;
const POSTER = 'https://bucket.example/materials/mat_vid_thumb?sig=1';

const materials = [
  {
    id: 'mat_vid',
    parentId: null,
    kind: 'file',
    name: '2.Как продавать.mp4',
    mime: 'video/mp4',
    size: 627921319,
    stub: null,
    hasFile: true,
    hasThumbnail: true,
    thumbnailUrl: POSTER,
    hasStream: true,
    streamSize: 70983092,
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
];

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

async function enter(page: Page, { failFirstStream = false } = {}) {
  let contentCalls = 0;
  let streamCalls = 0;
  await page.route('http://127.0.0.1:4181/materials', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ materials }) })
      : route.continue(),
  );
  await page.route('http://127.0.0.1:4181/materials/*/content', (route) => {
    contentCalls += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ name: materials[0]!.name, mime: 'video/mp4', url: ORIGINAL, streamUrl: STREAM(contentCalls), streamSize: 70983092 }),
    });
  });
  await page.route('https://bucket.example/**', (route) => {
    const url = route.request().url();
    if (url.includes('_thumb')) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    if (url.includes('_stream')) {
      streamCalls += 1;
      // Истёкшая подпись: Object Storage отвечает 403.
      if (failFirstStream && url.endsWith('sig=1')) return route.fulfill({ status: 403, body: 'expired' });
      return route.fulfill({ status: 200, contentType: 'video/webm', body: VIDEO, headers: { 'accept-ranges': 'bytes' } });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.owner');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  await page.getByRole('tab', { name: 'Обучение', exact: true }).first().click();
  return { counts: () => ({ contentCalls, streamCalls }) };
}

test('видео играет по ссылке на лёгкую копию, «Скачать» отдаёт оригинал', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: /2\.Как продавать\.mp4/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Просмотр: 2.Как продавать.mp4' });
  const video = dialog.locator('video');
  await expect(video).toHaveAttribute('src', STREAM(1));
  await expect(video).toHaveAttribute('preload', 'metadata');
  await expect(video).toHaveAttribute('playsinline', '');
  await expect(video).toHaveAttribute('poster', POSTER);
  await expect(video).toHaveAttribute('data-stream-copy', 'true');
  await expect(dialog.getByRole('link', { name: 'Скачать' })).toHaveAttribute('href', ORIGINAL);
  // Метаданные пришли — плеер готов играть, файл целиком не ждём.
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 15000 }).toBeGreaterThanOrEqual(1);
  // Плеер берёт файл сам, без fetch() и blob: ссылок.
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentSrc.startsWith('blob:'))).toBe(false);
});

test('истёкшая ссылка: плеер берёт новую и продолжает', async ({ page }) => {
  const { counts } = await enter(page, { failFirstStream: true });
  await page.getByRole('button', { name: /2\.Как продавать\.mp4/ }).click();
  const video = page.getByRole('dialog').locator('video');
  await expect(video).toHaveAttribute('src', STREAM(2), { timeout: 15000 });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 15000 }).toBeGreaterThanOrEqual(1);
  expect(counts().contentCalls).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('dialog').getByText('Видео не воспроизводится')).toHaveCount(0);
});
