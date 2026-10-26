import { test, expect, type Page } from '@playwright/test';
import { deflateSync } from 'node:zlib';

const password = 'ui-fixture-password-only';

/** PNG w×h, сплошной цвет — настоящая картинка для миниатюр. */
function png(w: number, h: number, rgb: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const base = { parentId: null, kind: 'file', stub: null, hasFile: true, hasPreview: false, updatedAt: '2026-10-01T00:00:00.000Z' };
const materials = [
  { ...base, id: 'mat_pdf', name: '2.Коммерческое предложение.pdf', mime: 'application/pdf', size: 981193, hasThumbnail: true, thumbnailUrl: 'http://127.0.0.1:4181/__thumb/mat_pdf.png' },
  { ...base, id: 'mat_video', name: 'Эффект звукоизоляции.mp4', mime: 'video/mp4', size: 726905, hasThumbnail: true, thumbnailUrl: 'http://127.0.0.1:4181/__thumb/mat_video.png' },
  { ...base, id: 'mat_img', name: '1.Инструкция по заработку.png', mime: 'image/png', size: 1511197, hasThumbnail: true, thumbnailUrl: 'http://127.0.0.1:4181/__thumb/mat_img.png' },
  { ...base, id: 'mat_docx', name: 'Договор на установку.docx', mime: DOCX, size: 30274, hasThumbnail: false },
  { ...base, id: 'mat_broken', name: 'Сломанная миниатюра.pdf', mime: 'application/pdf', size: 1000, hasThumbnail: true, thumbnailUrl: 'http://127.0.0.1:4181/__thumb/missing.png' },
];

async function enter(page: Page, login = 'ui.owner') {
  await page.route('http://127.0.0.1:4181/materials', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ materials }) })
      : route.continue(),
  );
  await page.route('http://127.0.0.1:4181/__thumb/*', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    if (name === 'missing.png') return route.fulfill({ status: 403, body: 'expired' });
    const color: [number, number, number] = name.startsWith('mat_pdf') ? [1, 100, 79] : name.startsWith('mat_video') ? [109, 40, 217] : [194, 65, 12];
    return route.fulfill({ status: 200, contentType: 'image/png', body: png(48, 36, color) });
  });
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(login);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  const training = page.getByRole('tab', { name: 'Обучение', exact: true });
  if (await training.count()) await training.click();
  else await page.getByRole('button', { name: 'Обучение', exact: true }).click();
}

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

for (const vp of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 1000 },
]) {
  test(`${vp.name}: file cards show thumbnails, typed icon when there is none or it fails`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enter(page);
    const list = page.getByTestId('materials-list');
    const card = (id: string) => list.locator(`[data-material-id="${id}"] [data-testid="material-thumb"]`);
    for (const id of ['mat_pdf', 'mat_video', 'mat_img']) {
      await expect(card(id)).toHaveAttribute('data-thumb', 'loaded');
      const img = card(id).locator('img');
      await expect(img).toHaveAttribute('loading', 'lazy');
      expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(48);
    }
    // Видео — с кнопкой ▶ поверх кадра.
    await expect(card('mat_video').locator('svg')).toHaveCount(1);
    // Нет миниатюры — значок с типом.
    await expect(card('mat_docx')).toHaveAttribute('data-thumb', 'icon');
    await expect(card('mat_docx')).toContainText('DOCX');
    // Ссылка протухла (403) — тоже значок, а не битая картинка.
    await expect(card('mat_broken')).toHaveAttribute('data-thumb', 'icon');
    await expect(card('mat_broken')).toContainText('PDF');
    // Сетка: на телефоне две колонки, без горизонтальной прокрутки.
    const boxes = await list.locator('[data-material-id]').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    if (vp.name === 'phone') expect(boxes[0]).toBe(boxes[1]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Клик по карточке с миниатюрой открывает тот же просмотр.
    await page.route('http://127.0.0.1:4181/materials/*/content', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ name: 'x.png', mime: 'image/png', base64: png(4, 4, [0, 0, 0]).toString('base64') }) }),
    );
    await list.getByRole('button', { name: /Инструкция по заработку/ }).click();
    await expect(page.getByRole('dialog', { name: 'Просмотр: 1.Инструкция по заработку.png' })).toBeVisible();
  });
}

test('admin upload: the app builds a thumbnail from the file and uploads it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.admin');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('tab', { name: 'Обучение', exact: true }).first().click();
  const puts: { url: string; type: string | null }[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PUT' && r.url().includes('/test-put/')) puts.push({ url: r.url(), type: r.headers()['content-type'] || null });
  });
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'Схема монтажа.png', mimeType: 'image/png', buffer: png(960, 720, [1, 100, 79]) });
  const thumb = page.getByTestId('materials-list').locator('[data-material-id]').filter({ hasText: 'Схема монтажа.png' }).getByTestId('material-thumb');
  await expect(thumb).toHaveAttribute('data-thumb', 'loaded', { timeout: 20000 });
  expect(puts.length).toBe(1);
  expect(puts[0]!.url).toMatch(/_thumb$/);
  expect(puts[0]!.type).toMatch(/^image\/(webp|jpeg)$/);
  // Миниатюра уменьшена до 480 px по ширине.
  expect(await thumb.locator('img').evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(480);
});
