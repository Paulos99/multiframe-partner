import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';

const password = 'ui-fixture-password-only';
const VIDEO = readFileSync(new URL('./fixtures/tiny-video.webm', import.meta.url));
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkaPhfDwAFhwJ/lXcFJgAAAABJRU5ErkJggg==',
  'base64',
);

function tinyPdf(): Buffer {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>'];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => (body += `${String(off).padStart(10, '0')} 00000 n \n`));
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}
const PDF = tinyPdf();

const T = '2026-10-01T00:00:00.000Z';
const BUCKET = 'https://bucket.example/materials';
const materials = [
  { id: 'mat_folder', parentId: null, kind: 'folder', name: 'Видео', mime: null, size: null, stub: null, hasFile: false, updatedAt: T },
  { id: 'mat_pdf', parentId: null, kind: 'file', name: 'Инструкция.pdf', mime: 'application/pdf', size: PDF.length, stub: null, hasFile: true, hasThumbnail: true, thumbnailUrl: `${BUCKET}/mat_pdf_thumb?sig=1`, updatedAt: T },
  { id: 'mat_png', parentId: null, kind: 'file', name: 'Схема.png', mime: 'image/png', size: PNG.length, stub: null, hasFile: true, updatedAt: T },
  // Оригинал «весит» 600 МБ, но офлайн сохраняется лёгкая копия (streamSize).
  { id: 'mat_vid', parentId: 'mat_folder', kind: 'file', name: 'Урок.mp4', mime: 'video/mp4', size: 627921319, stub: null, hasFile: true, hasStream: true, streamSize: VIDEO.length, updatedAt: T },
  { id: 'mat_stub', parentId: null, kind: 'file', name: 'Скоро', mime: 'application/pdf', size: null, stub: 'deck-product', hasFile: false, updatedAt: T },
];
const bodies: Record<string, { body: Buffer; type: string }> = {
  mat_pdf: { body: PDF, type: 'application/pdf' },
  mat_png: { body: PNG, type: 'image/png' },
  mat_vid_stream: { body: VIDEO, type: 'video/webm' },
  mat_pdf_thumb: { body: PNG, type: 'image/png' },
};
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'Content-Length, Content-Range' };

type Net = { ranges: string[]; failOnce: Set<string>; originalHits: number; offline?: boolean };

async function setup(page: Page, net: Net) {
  await page.addInitScript(() => localStorage.setItem('mf.offlineChunkBytes', '4096'));
  // Маршруты Playwright срабатывают и при setOffline — обрываем их сами, как настоящая сеть.
  await page.route('http://127.0.0.1:4181/**', (route) => (net.offline ? route.abort('internetdisconnected') : route.fallback()));
  await page.route('https://bucket.example/**', (route) => (net.offline ? route.abort('internetdisconnected') : route.fallback()));
  await page.route('http://127.0.0.1:4181/materials', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ materials }) })
      : route.continue(),
  );
  await page.route('http://127.0.0.1:4181/materials/*/content', (route) => {
    const id = new URL(route.request().url()).pathname.split('/')[2]!;
    const item = materials.find((m) => m.id === id)!;
    const payload: Record<string, unknown> = { name: item.name, mime: item.mime, url: `${BUCKET}/${id}?sig=a` };
    if (item.hasStream) payload.streamUrl = `${BUCKET}/${id}_stream?sig=a`;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  await page.route('https://bucket.example/**', (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const key = new URL(req.url()).pathname.split('/').pop()!;
    if (key === 'mat_vid') {
      net.originalHits += 1;
      return route.fulfill({ status: 500, headers: CORS, body: 'original must not be downloaded' });
    }
    const file = bodies[key];
    if (!file) return route.fulfill({ status: 404, headers: CORS, body: '' });
    const range = req.headers()['range'];
    if (!range) return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': file.type }, body: file.body });
    net.ranges.push(`${key} ${range}`);
    if (net.failOnce.delete(`${key} ${range}`)) return route.abort('connectionreset');
    const [, a, b] = /bytes=(\d+)-(\d*)/.exec(range)!;
    const start = Number(a);
    const end = Math.min(b ? Number(b) : file.body.length - 1, file.body.length - 1);
    return route.fulfill({
      status: 206,
      headers: { ...CORS, 'content-type': file.type, 'content-range': `bytes ${start}-${end}/${file.body.length}`, 'accept-ranges': 'bytes' },
      body: file.body.subarray(start, end + 1),
    });
  });
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.owner');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  const training = page.getByRole('tab', { name: 'Обучение', exact: true });
  if (await training.count()) await training.click();
  else await page.getByRole('button', { name: 'Обучение', exact: true }).click();
}

async function reopenMaterials(page: Page) {
  await page.getByRole('tab', { name: 'Кабинет', exact: true }).click();
  await page.getByRole('tab', { name: 'Материалы', exact: true }).click();
}

test('офлайн: скачать всё, докачать после обрыва, открыть без сети, удалить копии', async ({ page, context }) => {
  const net: Net = { ranges: [], failOnce: new Set(['mat_vid_stream bytes=8192-12287']), originalHits: 0 };
  await setup(page, net);
  const card = page.getByTestId('offline-card');
  // До загрузки — компактное предложение, без шестерёнки и без кнопок обновления.
  await expect(page.getByTestId('offline-gear')).toHaveCount(0);
  await expect(card).toContainText('3 файла · около 28 КБ');
  await expect(card.getByRole('button', { name: 'Обновить сейчас' })).toHaveCount(0);
  await card.getByRole('button', { name: 'Скачать для офлайна' }).click();

  // Обрыв на третьем куске видео — ошибка, часть уже на устройстве. Кнопки уехали в шестерёнку.
  const gear = page.getByRole('button', { name: 'Офлайн-доступ', exact: true });
  await expect(gear).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('offline-card')).toHaveCount(0);
  await expect(page.getByTestId('offline-gear-dot')).toBeVisible();
  await expect(gear).toHaveText('');
  await gear.click();
  const panel = page.getByRole('dialog', { name: 'Офлайн-доступ' });
  await expect(panel.getByRole('alert')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Обновить сейчас' })).toBeVisible();
  const before = net.ranges.filter((r) => r.startsWith('mat_vid_stream')).length;
  await panel.getByRole('button', { name: 'Обновить сейчас' }).click();
  await expect(gear).toBeVisible({ timeout: 20000 });
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await gear.click();
  await expect(panel).toContainText('Все материалы на устройстве', { timeout: 20000 });
  await expect(panel).toContainText(/Обновлено/);
  const wide = await panel.boundingBox();
  expect(wide!.x).toBeGreaterThanOrEqual(0);
  expect(wide!.x + wide!.width).toBeLessThanOrEqual(1440);
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await gear.click();
  const narrow = await panel.boundingBox();
  expect(narrow!.x).toBeGreaterThanOrEqual(0);
  expect(narrow!.x + narrow!.width).toBeLessThanOrEqual(390);
  for (const name of ['Обновить сейчас', 'Удалить офлайн-копии']) {
    const box = await panel.getByRole('button', { name, exact: true }).boundingBox();
    expect(box!.height, name).toBeGreaterThanOrEqual(44);
  }
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const videoRanges = net.ranges.filter((r) => r.startsWith('mat_vid_stream'));
  // Докачка с места обрыва: первые два куска повторно не запрашивались.
  expect(videoRanges.slice(before)[0]).toBe('mat_vid_stream bytes=8192-12287');
  expect(videoRanges.filter((r) => r === 'mat_vid_stream bytes=0-4095')).toHaveLength(1);
  expect(net.originalHits).toBe(0);
  await expect(page.getByTestId('offline-badge')).toHaveCount(2); // PDF и PNG в корне

  // Без сети.
  await context.setOffline(true);
  net.offline = true;
  await reopenMaterials(page);
  await expect(page.getByTestId('materials-offline-note')).toContainText('Нет сети');
  await expect(page.getByRole('button', { name: 'Загрузить файл' })).toHaveCount(0);
  await page.getByRole('button', { name: /Инструкция\.pdf/ }).click();
  const pdf = page.getByRole('dialog', { name: 'Просмотр: Инструкция.pdf' });
  // Файл берётся с устройства (blob:). Отрисовку pdf.js без сети в проде обеспечивает
  // кэш service worker'а; на dev-сервере его нет, поэтому здесь проверяем источник и отсутствие белого экрана.
  await expect(pdf.getByRole('link', { name: 'Скачать' }).first()).toHaveAttribute('href', /^blob:/);
  await expect(pdf.getByText(/Инструкция\.pdf/).first()).toBeVisible();
  await pdf.getByRole('button', { name: 'Закрыть' }).first().click();

  await page.getByRole('button', { name: /Видео/ }).first().click();
  await expect(page.getByTestId('offline-badge')).toHaveCount(1);
  await page.getByRole('button', { name: /Урок\.mp4/ }).click();
  const video = page.getByRole('dialog', { name: 'Просмотр: Урок.mp4' }).locator('video');
  await expect(video).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 15000 }).toBeGreaterThanOrEqual(1);
  // Перемотка по локальной копии.
  const seeked = await video.evaluate(
    (v: HTMLVideoElement) =>
      new Promise<number>((resolve) => {
        v.addEventListener('seeked', () => resolve(v.currentTime), { once: true });
        v.currentTime = 2;
      }),
  );
  expect(seeked).toBeGreaterThan(1.5);
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть' }).click();

  // Снова в сети — удаляем копии.
  await context.setOffline(false);
  net.offline = false;
  await reopenMaterials(page);
  await expect(page.getByTestId('materials-offline-note')).toHaveCount(0);
  await gear.click();
  await expect(panel).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await panel.getByRole('button', { name: 'Удалить офлайн-копии' }).click();
  await expect(page.getByTestId('offline-gear')).toHaveCount(0);
  await expect(page.getByTestId('offline-card').getByRole('button', { name: 'Скачать для офлайна' })).toBeVisible();
  await expect(page.getByTestId('offline-badge')).toHaveCount(0);
  expect(await page.evaluate(() => caches.has('mf-offline-materials-v1'))).toBe(false);
});
