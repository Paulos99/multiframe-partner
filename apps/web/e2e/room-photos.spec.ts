import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { openProjectRoom } from './open-room';

const API = 'http://127.0.0.1:4181';
const password = 'ui-fixture-password-only';
const fixture = (name: string) => path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', name);
const BEFORE = fixture('ceiling-before.jpg');
const PROGRESS = fixture('ceiling-progress.jpg');
const AFTER = fixture('ceiling-after.jpg');
const PORTRAIT = fixture('ceiling-portrait.jpg');
const THUMB = readFileSync(fixture('ceiling-thumb.jpg')).toString('base64');

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/__reset`);
});

async function token(request: APIRequestContext, login: string): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: { login, password } });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { token: string }).token;
}

async function enter(page: Page, login: string, tab = 'Проекты') {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(login);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('tab', { name: tab, exact: true })).toBeVisible();
}

/** Кладёт фото через API, как это сделало бы приложение. */
async function seed(request: APIRequestContext, auth: string, roomId: string, stage: string, file: string, caption = '') {
  const b64 = readFileSync(file).toString('base64');
  const res = await request.post(`${API}/objects/${roomId}/photos`, {
    headers: { Authorization: `Bearer ${auth}` },
    data: { stage, caption, image: b64, thumb: THUMB },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return ((await res.json()) as { photo: { id: string; url: string } }).photo;
}

async function openBedroom(page: Page) {
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  const { drawer } = await openProjectRoom(page, 'Спальня');
  const report = page.getByTestId('photo-report');
  await expect(report).toBeVisible();
  return { drawer, report };
}

test('монтажник добавляет фото до, в процессе и после; просмотр на весь экран, сравнение, удаление', async ({ page, request }) => {
  await enter(page, 'ui.crew');
  const { report } = await openBedroom(page);
  await expect(report.getByRole('heading', { name: 'Фотоотчёт' })).toBeVisible();
  for (const stage of ['before', 'progress', 'after']) {
    await expect(page.getByTestId(`photo-stage-${stage}`)).toBeVisible();
  }
  await expect(page.getByTestId('photo-share-toggle')).toHaveCount(0);

  // Камера на телефоне: input с capture=environment, рядом выбор из галереи с несколькими файлами.
  const camera = page.getByTestId('photo-camera-before');
  await expect(camera).toHaveAttribute('capture', 'environment');
  await expect(camera).toHaveAttribute('accept', 'image/*');
  await expect(page.getByTestId('photo-gallery-before')).toHaveAttribute('multiple', '');

  // До: два файла, один из них портретный со своим поворотом.
  await page.getByTestId('photo-stage-before').getByLabel(/^Подпись к новым фото/).fill('Потолок до');
  await page.getByTestId('photo-gallery-before').setInputFiles([BEFORE, PORTRAIT]);
  const before = page.getByTestId('photo-stage-before');
  await expect(before.getByTestId('photo-tile')).toHaveCount(2, { timeout: 20000 });
  await expect(before.getByTestId('photo-upload-row')).toHaveCount(0);

  await page.getByTestId('photo-camera-progress').setInputFiles(PROGRESS);
  await expect(page.getByTestId('photo-stage-progress').getByTestId('photo-tile')).toHaveCount(1, { timeout: 20000 });
  await page.getByTestId('photo-camera-after').setInputFiles(AFTER);
  await expect(page.getByTestId('photo-stage-after').getByTestId('photo-tile')).toHaveCount(1, { timeout: 20000 });

  // На сервере: уменьшено до 1600 px, без EXIF и координат, подпись сохранена.
  const auth = await token(request, 'ui.crew');
  const list = (await (await request.get(`${API}/objects/ui_room/photos`, { headers: { Authorization: `Bearer ${auth}` } })).json()) as {
    photos: Array<{ stage: string; caption: string; url: string; width: number; height: number }>;
  };
  expect(list.photos.map((p) => p.stage).sort()).toEqual(['after', 'before', 'before', 'progress']);
  expect(list.photos.filter((p) => p.caption === 'Потолок до')).toHaveLength(2);
  for (const photo of list.photos) {
    expect(Math.max(photo.width, photo.height)).toBeLessThanOrEqual(1600);
    const file = await request.get(photo.url.startsWith('/') ? `${API}${photo.url}` : photo.url);
    expect(file.ok()).toBeTruthy();
    const bytes = await file.body();
    expect(bytes.subarray(0, 2).toString('hex')).toBe('ffd8');
    const text = bytes.toString('latin1');
    expect(text.includes('Exif'), 'в файле нет EXIF').toBe(false);
    expect(text.includes('TestCam'), 'в файле нет модели камеры').toBe(false);
  }
  // Снимок 900×1200 с отметкой поворота: поворот применён до сохранения, стороны поменялись.
  expect(list.photos.some((p) => p.width === 1200 && p.height === 900)).toBe(true);

  // Полноэкранный просмотр.
  await before.getByTestId('photo-tile').first().click();
  const viewer = page.getByTestId('photo-viewer');
  await expect(viewer).toBeVisible();
  const box = await viewer.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBe(0);
  // Допуск на полосу прокрутки страницы (до 17 px): окно занимает весь экран.
  expect(viewport.width - box!.width).toBeLessThanOrEqual(17);
  expect(box!.height).toBe(viewport.height);
  await expect(viewer.getByTestId('photo-viewer-image')).toBeVisible();
  await expect(viewer).toContainText('1 из 4');
  await page.keyboard.press('ArrowRight');
  await expect(viewer).toContainText('2 из 4');
  await expect(viewer.getByText('До', { exact: true })).toBeVisible();

  // Сравнение до и после.
  await viewer.getByTestId('photo-compare-toggle').click();
  const compare = viewer.getByTestId('photo-compare');
  await expect(compare).toBeVisible();
  await expect(compare.getByRole('slider', { name: /Граница между/ })).toBeVisible();
  await viewer.getByTestId('photo-compare-toggle').click();
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);

  // Удаление своего фото: подтверждение, потом фото исчезает.
  await page.getByTestId('photo-stage-after').getByTestId('photo-tile').click();
  await page.getByTestId('photo-delete').click();
  await expect(page.getByRole('alertdialog')).toContainText('Удалить это фото?');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить', exact: true }).click();
  // Просмотр остаётся на оставшихся снимках.
  await expect(page.getByTestId('photo-viewer')).toContainText('3 из 3');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('photo-viewer')).toHaveCount(0);
  await expect(page.getByTestId('photo-stage-after').getByTestId('photo-tile')).toHaveCount(0);
  await expect(page.getByTestId('photo-stage-after')).toContainText('Фото пока нет');
});

test('замерщик видит все этапы, добавляет только «До» и не удаляет чужие фото', async ({ page, request }) => {
  const owner = await token(request, 'ui.owner');
  await request.patch(`${API}/objects/ui_room`, { headers: { Authorization: `Bearer ${owner}` }, data: { assignedTo: 'ui_measurer' } });
  await seed(request, owner, 'ui_room', 'before', BEFORE, 'Трещина у окна');
  await seed(request, owner, 'ui_room', 'after', AFTER, 'Готово');

  await enter(page, 'ui.measurer');
  const { report } = await openBedroom(page);
  for (const stage of ['before', 'progress', 'after']) {
    await expect(page.getByTestId(`photo-stage-${stage}`)).toBeVisible();
  }
  await expect(report.getByTestId('photo-tile')).toHaveCount(2);
  await expect(report).toContainText('Готово');
  // Добавлять замерщик может только «До»: у «В процессе» и «После» нет кнопок съёмки.
  await expect(page.getByTestId('photo-camera-before')).toBeVisible();
  await expect(page.getByTestId('photo-camera-progress')).toHaveCount(0);
  await expect(page.getByTestId('photo-camera-after')).toHaveCount(0);
  await expect(page.getByTestId('photo-open-compare')).toBeVisible();

  // Замерщик добавляет «До».
  await page.getByTestId('photo-gallery-before').setInputFiles(PROGRESS);
  await expect(page.getByTestId('photo-stage-before').getByTestId('photo-tile')).toHaveCount(2, { timeout: 20000 });

  // Чужое «До» удалить нельзя: у фото владельца нет кнопки удаления; своё — можно.
  const tiles = page.getByTestId('photo-stage-before').getByTestId('photo-tile');
  await tiles.nth(0).click();
  await expect(page.getByTestId('photo-viewer')).toBeVisible();
  await expect(page.getByTestId('photo-delete')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await tiles.nth(1).click();
  await expect(page.getByTestId('photo-delete')).toBeVisible();
  await page.keyboard.press('Escape');
  // Чужое «После» тоже не удаляется.
  await page.getByTestId('photo-stage-after').getByTestId('photo-tile').click();
  await expect(page.getByTestId('photo-viewer')).toBeVisible();
  await expect(page.getByTestId('photo-delete')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Сервер не верит интерфейсу: добавлять другие этапы замерщику закрыто.
  const measurer = await token(request, 'ui.measurer');
  const b64 = readFileSync(AFTER).toString('base64');
  const denied = await request.post(`${API}/objects/ui_room/photos`, {
    headers: { Authorization: `Bearer ${measurer}` },
    data: { stage: 'after', image: b64, thumb: THUMB },
  });
  expect(denied.status()).toBe(403);
  const mine = (await (await request.get(`${API}/objects/ui_room/photos`, { headers: { Authorization: `Bearer ${measurer}` } })).json()) as {
    photos: Array<{ stage: string }>;
  };
  expect(mine.photos.map((p) => p.stage).sort()).toEqual(['after', 'before', 'before']);
});

test('показ клиенту включён по умолчанию: страница клиента получает фото без подписей и имён, владелец может выключить', async ({ page, browser, request }) => {
  const owner = await token(request, 'ui.owner');
  await seed(request, owner, 'ui_room', 'before', BEFORE, 'Секретная подпись');
  await seed(request, owner, 'ui_room', 'progress', PROGRESS);
  await seed(request, owner, 'ui_room', 'after', AFTER);
  const made = await request.post(`${API}/objects/ui_room/share`, {
    headers: { Authorization: `Bearer ${owner}` },
    data: {
      answers: { roomType: 'bedroom', ceilingAreaM2: 24, slabType: 'monolith', noisyNeighbors: 'often_noisy', noiseKind: 'impact' },
    },
  });
  expect(made.ok()).toBeTruthy();
  const tokenValue = ((await made.json()) as { link: { token: string } }).link.token;
  expect(tokenValue).toMatch(/^[A-Za-z0-9_-]{32}$/);
  const link = `http://127.0.0.1:4180/#/r/${tokenValue}`;

  // По умолчанию клиент фото видит.
  const open = (await (await request.get(`${API}/public/rooms/${tokenValue}`)).json()) as { share: { photos?: unknown[] } };
  expect(open.share.photos).toHaveLength(3);

  await enter(page, 'ui.owner');
  await openBedroom(page);
  const toggle = page.getByTestId('photo-share-toggle');
  await expect(toggle).toBeChecked();

  const client = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const clientPage = await client.newPage();
  await clientPage.goto(link);
  const section = clientPage.getByTestId('client-photo-report');
  await expect(section).toBeVisible({ timeout: 20000 });
  await expect(section.getByRole('heading', { name: 'Фото работ' })).toBeVisible();
  for (const stage of ['before', 'progress', 'after']) {
    await expect(clientPage.getByTestId(`client-photo-stage-${stage}`)).toBeVisible();
  }
  await expect(section.getByTestId('photo-compare')).toBeVisible();
  const text = (await clientPage.locator('body').innerText()) + (await clientPage.content());
  for (const secret of ['Секретная подпись', 'UI owner', 'UI crew', 'UI Client', 'Тестовый адрес', 'authorName', 'createdBy']) {
    expect(text, `на странице клиента не должно быть «${secret}»`).not.toContain(secret);
  }
  await section.getByRole('button', { name: /Открыть фото\. До/ }).first().click();
  await expect(clientPage.getByTestId('photo-viewer')).toBeVisible();
  await expect(clientPage.getByTestId('photo-delete')).toHaveCount(0);
  await clientPage.keyboard.press('Escape');
  const overflow = await clientPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  // Выключили — страница снова без фото; включили — вернулись.
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect
    .poll(async () => ((await (await request.get(`${API}/public/rooms/${tokenValue}`)).json()) as { share: Record<string, unknown> }).share.photos)
    .toBeUndefined();
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect
    .poll(async () => ((await (await request.get(`${API}/public/rooms/${tokenValue}`)).json()) as { share: { photos?: unknown[] } }).share.photos?.length)
    .toBe(3);
  await client.close();
});

test('админ СТП: раздел «Отчёты» вместо «Кейсов», обзор, фильтры и страница кейса без личных данных клиента', async ({ page, request }) => {
  const owner = await token(request, 'ui.owner');
  const crew = await token(request, 'ui.crew');
  await seed(request, owner, 'ui_room', 'before', BEFORE, 'До работ');
  await seed(request, crew, 'ui_room', 'progress', PROGRESS);
  await seed(request, crew, 'ui_room', 'after', AFTER, 'После работ');
  await seed(request, crew, 'ui_crew_room', 'before', PORTRAIT);

  await enter(page, 'ui.admin', 'Партнёры');
  await expect(page.getByRole('tab', { name: 'Отчёты', exact: true })).toBeVisible();
  // Отдельной вкладки «Кейсы» нет: фотоотчёты партнёров лежат в «Отчётах».
  await expect(page.getByRole('tab', { name: 'Кейсы', exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(6);
  await page.getByRole('tab', { name: 'Отчёты', exact: true }).click();
  await expect(page).toHaveURL(/#cases$/);
  const cases = page.getByTestId('photo-cases');
  await expect(cases.getByRole('heading', { name: 'Отчёты', exact: true })).toBeVisible();
  await expect(cases.getByTestId('case-card')).toHaveCount(2, { timeout: 20000 });
  const complete = cases.getByTestId('case-card').filter({ hasText: 'Спальня' });
  await expect(complete).toContainText('До и после');
  await expect(complete).toContainText('UI test company');
  const body = await cases.innerText();
  for (const secret of ['UI Client', 'Тестовый адрес', 'Тестовая квартира']) {
    expect(body, `в кейсах нет «${secret}»`).not.toContain(secret);
  }

  // Фильтры: только «До и после», этап «После».
  await page.getByTestId('cases-filter-complete').check();
  await expect(cases.getByTestId('case-card')).toHaveCount(1);
  await page.getByTestId('cases-filter-complete').uncheck();
  await page.getByTestId('cases-filter-stage').selectOption('after');
  await expect(cases.getByTestId('case-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Сбросить', exact: true }).click();
  await expect(cases.getByTestId('case-card')).toHaveCount(2);
  const future = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
  await cases.getByLabel('С даты').fill(future);
  await expect(cases.getByTestId('cases-empty')).toBeVisible();
  await page.getByRole('button', { name: 'Сбросить', exact: true }).click();

  // Страница кейса: адрес #cases/<комната>, три этапа, сравнение, просмотр.
  await complete.click();
  await expect(page).toHaveURL(/#cases\/ui_room$/);
  const casePage = page.getByTestId('photo-case');
  await expect(casePage.getByRole('heading', { name: 'Спальня', exact: true })).toBeVisible();
  for (const stage of ['before', 'progress', 'after']) {
    await expect(page.getByTestId(`case-stage-${stage}`).getByTestId('case-photo')).toHaveCount(1);
  }
  await expect(casePage.getByTestId('photo-compare')).toBeVisible();
  await expect(casePage).toContainText('После работ');
  await expect(casePage).not.toContainText('UI Client');
  await page.getByTestId('case-stage-after').getByTestId('case-photo').click();
  const viewer = page.getByTestId('photo-viewer');
  await expect(viewer).toBeVisible();
  await expect(viewer.getByTestId('photo-delete'), 'админ только смотрит').toHaveCount(0);
  await page.keyboard.press('Escape');

  // Назад к списку, обновление страницы остаётся на разделе.
  await page.getByTestId('case-back').click();
  await expect(page).toHaveURL(/#cases$/);
  await page.reload();
  await expect(page.getByTestId('photo-cases')).toBeVisible();

  // Остальные роли раздела не видят, сервер им отказывает.
  expect((await request.get(`${API}/photo-cases`, { headers: { Authorization: `Bearer ${owner}` } })).status()).toBe(403);
  expect((await request.get(`${API}/photo-cases/ui_room`, { headers: { Authorization: `Bearer ${crew}` } })).status()).toBe(403);
});

test('телефон 390×844: фотоотчёт без горизонтальной прокрутки, просмотр на весь экран', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const owner = await token(request, 'ui.owner');
  await seed(request, owner, 'ui_room', 'before', BEFORE);
  await seed(request, owner, 'ui_room', 'after', AFTER);
  await enter(page, 'ui.crew');
  const { report } = await openBedroom(page);
  await report.scrollIntoViewIfNeeded();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  for (const control of [page.getByTestId('photo-stage-before').locator('label').first(), page.getByTestId('photo-tile').first()]) {
    const b = await control.boundingBox();
    expect(b!.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByTestId('photo-tile').first().click();
  const box = await page.getByTestId('photo-viewer').boundingBox();
  expect(box!.x).toBe(0);
  expect(box!.y).toBe(0);
  expect(390 - box!.width).toBeLessThanOrEqual(17);
  expect(box!.height).toBe(844);
  const close = await page.getByTestId('photo-viewer-close').boundingBox();
  expect(close!.height).toBeGreaterThanOrEqual(44);
});
