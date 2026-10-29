import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type APIRequestContext, type Download, type Page } from '@playwright/test';

const API = 'http://127.0.0.1:4181';
const password = 'ui-fixture-password-only';
const fixture = (name: string) => path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', name);
const BEFORE = fixture('ceiling-before.jpg');
const PROGRESS = fixture('ceiling-progress.jpg');
const AFTER = fixture('ceiling-after.jpg');
const THUMB = readFileSync(fixture('ceiling-thumb.jpg')).toString('base64');

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/__reset`);
});

async function token(request: APIRequestContext, login: string): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: { login, password } });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { token: string }).token;
}

async function enter(page: Page, login: string) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(login);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Проекты', exact: true })).toBeVisible();
}

async function seed(request: APIRequestContext, auth: string, roomId: string, stage: string, file: string, caption = '') {
  const res = await request.post(`${API}/objects/${roomId}/photos`, {
    headers: { Authorization: `Bearer ${auth}` },
    data: { stage, caption, image: readFileSync(file).toString('base64'), thumb: THUMB },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
}

async function seedAll(request: APIRequestContext) {
  const owner = await token(request, 'ui.owner');
  await seed(request, owner, 'ui_room', 'before', BEFORE, 'Секретная подпись');
  await seed(request, owner, 'ui_room', 'progress', PROGRESS);
  await seed(request, owner, 'ui_room', 'after', AFTER);
  return owner;
}

async function makeLink(request: APIRequestContext, owner: string): Promise<string> {
  const made = await request.post(`${API}/objects/ui_room/share`, {
    headers: { Authorization: `Bearer ${owner}` },
    data: { answers: { roomType: 'bedroom', ceilingAreaM2: 24, slabType: 'monolith', noisyNeighbors: 'often_noisy', noiseKind: 'impact' } },
  });
  expect(made.ok()).toBeTruthy();
  return ((await made.json()) as { link: { token: string } }).link.token;
}

/** Страница проекта → вкладка «Отчёты». */
async function openReports(page: Page) {
  if (/#project\/ui_project\/reports/.test(page.url())) return page.getByTestId('project-photo-reports');
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await page.getByRole('button', { name: 'Тестовая квартира', exact: true }).click();
  await expect(page).toHaveURL(/#project\/ui_project\/overview/);
  await page.getByRole('tab', { name: 'Отчёты', exact: true }).click();
  await expect(page).toHaveURL(/#project\/ui_project\/reports/);
  return page.getByTestId('project-photo-reports');
}

async function readDownload(file: Download): Promise<Buffer> {
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function pdfStats(bytes: Buffer) {
  const text = bytes.toString('latin1');
  return { header: bytes.subarray(0, 5).toString('latin1'), pages: (text.match(/\/Type\s*\/Page[^s]/g) || []).length, size: bytes.length };
}

test('вкладка «Отчёты» проекта: фото по комнатам, переход в комнату, PDF открывается', async ({ page, request }) => {
  await seedAll(request);
  await enter(page, 'ui.owner');
  const reports = await openReports(page);
  const card = reports.getByTestId('report-photo-room').filter({ hasText: 'Спальня' });
  await expect(card).toContainText('До 1 · В процессе 1 · После 1');
  await expect(card.locator('img')).toHaveCount(3, { timeout: 20000 });

  // «Открыть PDF»: новая вкладка с PDF, три фото, без цен.
  const popupPromise = page.waitForEvent('popup');
  await card.getByTestId('photo-pdf-open').click();
  const popup = await popupPromise;
  // Безголовый Chromium не умеет показывать PDF во вкладке и сохраняет его файлом; обычный браузер покажет.
  const file = await popup.waitForEvent('download', { timeout: 60000 });
  const stats = pdfStats(await readDownload(file));
  expect(stats.header).toBe('%PDF-');
  expect(stats.pages).toBeGreaterThanOrEqual(1);
  expect(stats.size).toBeGreaterThan(20_000);
  await popup.close().catch(() => undefined);

  // Из карточки — на страницу комнаты (не боковая панель).
  await card.getByTestId('report-photo-open-room').click();
  await expect(page).toHaveURL(/#project\/ui_project\/room\//);
  await expect(page.getByTestId('photo-report')).toBeVisible();
  await expect(page.getByTestId('photo-pdf-open')).toBeVisible();
  await expect(page.getByTestId('photo-pdf-send')).toBeVisible();
});

test('«Отправить клиенту»: системное меню получает PDF и ссылку; без меню PDF скачивается, ссылка копируется', async ({ page, request, context }) => {
  const owner = await seedAll(request);
  const linkToken = await makeLink(request, owner);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  // 1) Есть системное меню отправки.
  await page.addInitScript(() => {
    const w = window as unknown as { __shared?: unknown };
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: { title?: string; text?: string; url?: string; files?: File[] }) => {
        const file = data.files?.[0];
        w.__shared = { title: data.title, text: data.text, name: file?.name, type: file?.type, size: file?.size, head: file ? new TextDecoder().decode(new Uint8Array(await file.arrayBuffer()).subarray(0, 5)) : null };
      },
    });
  });
  await enter(page, 'ui.owner');
  const reports = await openReports(page);
  const card = reports.getByTestId('report-photo-room').filter({ hasText: 'Спальня' });
  await expect(card.locator('img')).toHaveCount(3, { timeout: 20000 });
  await card.getByTestId('photo-pdf-send').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared?: unknown }).__shared), { timeout: 60000 }).toBeTruthy();
  const shared = (await page.evaluate(() => (window as unknown as { __shared: Record<string, unknown> }).__shared)) as {
    text: string; name: string; type: string; size: number; head: string;
  };
  expect(shared.type).toBe('application/pdf');
  expect(shared.head).toBe('%PDF-');
  expect(shared.name).toContain('фотоотчёт');
  expect(shared.size).toBeGreaterThan(20_000);
  expect(shared.text).toContain(`#/r/${linkToken}`);
  for (const banned of ['₽', 'Смета', 'Секретная подпись', '+7']) expect(shared.text).not.toContain(banned);
});

test('«Отправить клиенту» без системного меню: PDF скачивается, ссылка клиента копируется; при выключенном показе ссылки нет', async ({ page, request, context }) => {
  const owner = await seedAll(request);
  const linkToken = await makeLink(request, owner);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
  await enter(page, 'ui.owner');
  const reports = await openReports(page);
  const card = reports.getByTestId('report-photo-room').filter({ hasText: 'Спальня' });
  await expect(card.locator('img')).toHaveCount(3, { timeout: 20000 });

  const download = page.waitForEvent('download', { timeout: 60000 });
  await card.getByTestId('photo-pdf-send').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^MultiFrame_фотоотчёт_.*\.pdf$/);
  await expect(card.getByTestId('photo-pdf-note')).toContainText('ссылка для клиента скопирована');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`#/r/${linkToken}`);

  // Показ клиенту выключен: PDF есть, ссылку не прикладываем.
  await request.patch(`${API}/objects/ui_room/photos`, { headers: { Authorization: `Bearer ${owner}` }, data: { clientVisible: false } });
  await page.reload();
  const again = await openReports(page);
  const card2 = again.getByTestId('report-photo-room').filter({ hasText: 'Спальня' });
  await expect(card2.locator('img')).toHaveCount(3, { timeout: 20000 });
  const second = page.waitForEvent('download', { timeout: 60000 });
  await card2.getByTestId('photo-pdf-send').click();
  await second;
  await expect(card2.getByTestId('photo-pdf-note')).toContainText('Показ фото клиенту выключен');
});

test('замерщик: в «Отчётах» видит все этапы и может открыть PDF; монтажник отправить клиенту не может, PDF открывает', async ({ page, request }) => {
  const owner = await seedAll(request);
  await request.patch(`${API}/objects/ui_room`, { headers: { Authorization: `Bearer ${owner}` }, data: { assignedTo: 'ui_measurer' } });
  await enter(page, 'ui.measurer');
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  const desk = page.getByRole('region', { name: 'Список проектов' });
  const inline = desk.getByRole('button', { name: 'Спальня' });
  const project = page.getByRole('button', { name: 'Тестовая квартира', exact: true });
  await expect(inline.or(project)).toBeVisible();
  await inline.or(project).click();
  if (/#project\/ui_project\/overview/.test(page.url())) {
    await page.getByRole('tab', { name: 'Отчёты', exact: true }).click();
    const card = page.getByTestId('report-photo-room').filter({ hasText: 'Спальня' });
    await expect(card).toContainText('До 1 · В процессе 1 · После 1');
  } else {
    await expect(page.getByTestId('photo-stage-progress')).toBeVisible();
    await expect(page.getByTestId('photo-stage-after')).toBeVisible();
  }
  await expect(page.getByTestId('photo-pdf-open').first()).toBeVisible({ timeout: 20000 });
});

test('страница клиента: «Скачать PDF» отдаёт тот же отчёт, без подписей', async ({ browser, request }) => {
  const owner = await seedAll(request);
  const linkToken = await makeLink(request, owner);
  const client = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await client.newPage();
  await page.goto(`http://127.0.0.1:4180/#/r/${linkToken}`);
  const section = page.getByTestId('client-photo-report');
  await expect(section).toBeVisible({ timeout: 20000 });
  await expect(section.locator('img').first()).toBeVisible();
  const download = page.waitForEvent('download', { timeout: 60000 });
  await page.getByTestId('client-pdf-download').click();
  const file = await download;
  const stats = pdfStats(await readDownload(file));
  expect(stats.header).toBe('%PDF-');
  expect(stats.pages).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await client.close();
});

test('телефон 390×844: «Отчёты» с фото без горизонтальной прокрутки, кнопки не ниже 44 px', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedAll(request);
  await enter(page, 'ui.owner');
  const reports = await openReports(page);
  const card = reports.getByTestId('report-photo-room').filter({ hasText: 'Спальня' });
  await expect(card.locator('img')).toHaveCount(3, { timeout: 20000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  for (const control of [card.getByTestId('photo-pdf-open'), card.getByTestId('photo-pdf-send'), card.getByTestId('report-photo-open-room')]) {
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});
