import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { openProjectRoom } from './open-room';

const API = 'http://127.0.0.1:4181';
const password = 'ui-fixture-password-only';
const TOKEN_URL = /#\/r\/[A-Za-z0-9_-]{32}$/;
const JSQR_PATH = createRequire(import.meta.url).resolve('jsqr/dist/jsQR.js');

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/__reset`);
});

async function apiToken(request: APIRequestContext, login: string): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: { login, password } });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { token: string }).token;
}

async function enter(page: Page, login = 'ui.sales') {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(login);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Проекты', exact: true })).toBeVisible();
}

/** Комната «Спальня» → Проблемомер → результат. */
async function reachResult(page: Page) {
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  const { drawer } = await openProjectRoom(page, 'Спальня');
  await drawer.getByRole('button', { name: 'Проблемомер', exact: true }).click();
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  const result = page.getByRole('heading', { name: 'Акустический профиль помещения' });
  for (let i = 0; i < 14 && !(await result.isVisible().catch(() => false)); i += 1) {
    const next = page.getByRole('button', { name: 'Далее', exact: true });
    if (await next.isVisible().catch(() => false)) {
      if (await next.isEnabled()) await next.click();
    }
    await page.waitForTimeout(300);
  }
  await expect(result).toBeVisible({ timeout: 20000 });
}

/** Личные данные и цены в комнате: ничего из этого клиенту видеть нельзя. */
const SECRETS = [
  'UI Client',
  'Тестовый адрес',
  '+7 900 555-01-02',
  '555-01-02',
  'Тестовая квартира',
  'UI test company',
  'Гостиная',
  'Кухня',
  '75261',
  '38336',
  'ui_owner',
  'ui_crew',
  'ui_org',
  'ui_project',
  'ui_room',
  'totalCost',
  'clientPhone',
  'clientName',
  'estimate',
  'price',
];

async function markRoomWithSecrets(request: APIRequestContext) {
  const owner = await apiToken(request, 'ui.owner');
  const res = await request.patch(`${API}/objects/ui_room`, {
    headers: { Authorization: `Bearer ${owner}` },
    data: {
      clientPhone: '+7 900 555-01-02',
      estimate: { panels: 16, dowels: 37, panelsCost: 38336, installCost: 36000, dowelsCost: 925, totalCost: 75261 },
    },
  });
  expect(res.ok()).toBeTruthy();
  return owner;
}

test('менеджер выдаёт ссылку, клиент открывает её без входа, потом ссылку отключают', async ({
  page,
  browser,
  context,
  request,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await markRoomWithSecrets(request);
  await enter(page);
  await reachResult(page);

  await page.getByTestId('client-link-button').click();
  const panel = page.getByTestId('client-link-panel');
  const url = page.getByTestId('client-link-url');
  await expect(url).toHaveValue(TOKEN_URL);
  await expect(panel).toContainText('Цен, имени, телефона и адреса на странице нет');
  await page.getByTestId('client-link-copy').click();
  await expect(panel).toContainText('Ссылка скопирована');
  const link = await url.inputValue();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

  // Клиент: чистый браузер, входа нет.
  const client = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const authed: string[] = [];
  client.on('request', (req) => {
    if (req.headers().authorization) authed.push(req.url());
  });
  const clientPage = await client.newPage();
  await clientPage.goto(link);
  await expect(clientPage.getByRole('heading', { name: 'Акустический профиль: Спальня' })).toBeVisible({
    timeout: 20000,
  });
  const params = clientPage.getByRole('region', { name: 'Параметры комнаты' });
  await expect(params).toContainText('Спальня');
  await expect(params).toContainText('24 м²');
  await expect(clientPage.getByRole('region', { name: 'Ключевые показатели' })).toContainText('дБ');
  await expect(clientPage.getByRole('region', { name: 'Ключевые показатели' })).toContainText('тише');
  await expect(clientPage.getByRole('complementary', { name: 'Рекомендации' })).toBeVisible();
  const before = clientPage.getByRole('button', { name: /^Слушать До:/ }).first();
  const after = clientPage.getByRole('button', { name: /^Слушать После:/ }).first();
  await before.scrollIntoViewIfNeeded();
  await expect(before).toBeVisible();
  await expect(after).toBeVisible();
  await before.click();
  await expect(clientPage.getByRole('button', { name: /^Пауза: До,/ })).toBeVisible({ timeout: 8000 });

  const text = (await clientPage.locator('body').innerText()) + (await clientPage.content());
  for (const secret of ['UI Client', 'Тестовый адрес', '555-01-02', 'Тестовая квартира', 'UI test company', '₽']) {
    expect(text, `на странице клиента не должно быть «${secret}»`).not.toContain(secret);
  }
  await expect(clientPage.getByRole('button', { name: 'Сохранить', exact: true })).toHaveCount(0);
  await expect(clientPage.getByLabel('Логин', { exact: true })).toHaveCount(0);
  await expect(clientPage.getByRole('tab')).toHaveCount(0);
  const overflow = await clientPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'на телефоне нет горизонтальной прокрутки').toBeLessThanOrEqual(1);
  expect(authed, 'клиент ходит на сервер без токена входа').toEqual([]);

  // Повторное открытие панели отдаёт ту же ссылку.
  await page.getByTestId('client-link-button').click();
  await page.getByTestId('client-link-button').click();
  await expect(page.getByTestId('client-link-url')).toHaveValue(link);

  // Отключаем: подтверждение, затем клиент видит понятную страницу, а сервер отвечает 404.
  await page.getByTestId('client-link-disable').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Отключить', exact: true }).click();
  await expect(page.getByTestId('client-link-off')).toBeVisible();
  const token = link.split('/#/r/')[1];
  const dead = await request.get(`${API}/public/rooms/${token}`);
  expect(dead.status()).toBe(404);
  expect(((await dead.json()) as { message: string }).message).toBe('Ссылка недоступна');

  await clientPage.reload();
  const gone = clientPage.getByTestId('shared-room-unavailable');
  await expect(gone).toContainText('Ссылка недоступна');
  await expect(gone).toContainText('Попросите того, кто её отправил');
  await expect(clientPage.getByRole('heading', { name: /Акустический профиль/ })).toHaveCount(0);

  // Повторное открытие панели отключённую ссылку не оживляет.
  await page.getByTestId('client-link-button').click();
  await page.getByTestId('client-link-button').click();
  await expect(page.getByTestId('client-link-off')).toBeVisible();
  await expect(page.getByTestId('client-link-url')).toHaveCount(0);
  const owner = await apiToken(request, 'ui.owner');
  const state = await request.get(`${API}/objects/ui_room/share`, { headers: { Authorization: `Bearer ${owner}` } });
  expect(((await state.json()) as { link: { enabled: boolean } }).link.enabled).toBe(false);
  expect((await request.get(`${API}/public/rooms/${token}`)).status()).toBe(404);
  // Обновление снимка (так делает и отчёт при сохранении) тоже не включает ссылку.
  const refresh = await request.post(`${API}/objects/ui_room/share`, {
    headers: { Authorization: `Bearer ${owner}` },
    data: { answers: { roomType: 'bedroom' } },
  });
  expect(((await refresh.json()) as { link: { enabled: boolean } }).link.enabled).toBe(false);
  expect((await request.get(`${API}/public/rooms/${token}`)).status()).toBe(404);
  await clientPage.reload();
  await expect(clientPage.getByTestId('shared-room-unavailable')).toBeVisible();

  // Новая ссылка только по явной кнопке, и токен другой.
  await page.getByTestId('client-link-renew').click();
  await expect(page.getByTestId('client-link-url')).toHaveValue(TOKEN_URL);
  const renewed = await page.getByTestId('client-link-url').inputValue();
  expect(renewed).not.toBe(link);
  expect((await request.get(`${API}/public/rooms/${token}`)).status()).toBe(404);
  await clientPage.goto(renewed);
  await expect(clientPage.getByRole('heading', { name: 'Акустический профиль: Спальня' })).toBeVisible({
    timeout: 20000,
  });
  await clientPage.goto(link);
  await expect(clientPage.getByTestId('shared-room-unavailable')).toBeVisible();
  await client.close();
});

test('«Переслать» стоит рядом с «Сохранить», открывает системную отправку и не оживляет отключённую ссылку', async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    const shared: { title?: string; url?: string }[] = [];
    (window as unknown as { __shared: typeof shared }).__shared = shared;
    navigator.share = async (data) => {
      shared.push({ title: data?.title, url: data?.url });
    };
  });
  const sharedCalls = () =>
    page.evaluate(() => (window as unknown as { __shared: { title?: string; url?: string }[] }).__shared);
  await enter(page);
  await reachResult(page);

  const save = page.getByRole('button', { name: 'Сохранить', exact: true });
  const forward = page.getByRole('button', { name: 'Переслать', exact: true });
  await expect(save).toBeVisible();
  await expect(forward).toBeVisible();
  await expect(forward).toBeEnabled();
  const [a, b] = await Promise.all([save.boundingBox(), forward.boundingBox()]);
  expect(Math.abs((a?.y ?? 0) - (b?.y ?? 1000))).toBeLessThan(6);
  expect((b?.x ?? 0) > (a?.x ?? 0)).toBe(true);

  await forward.click();
  await expect.poll(async () => (await sharedCalls()).length).toBe(1);
  const first = (await sharedCalls())[0]!;
  expect(first.url).toMatch(TOKEN_URL);
  expect(first.title).toBe('Результаты Проблемомера по вашей комнате');

  // Повторная пересылка отдаёт ту же ссылку.
  await forward.click();
  await expect.poll(async () => (await sharedCalls()).length).toBe(2);
  expect((await sharedCalls())[1]!.url).toBe(first.url);
  const token = first.url!.split('/#/r/')[1]!;
  expect((await request.get(`${API}/public/rooms/${token}`)).status()).toBe(200);

  // Менеджер отключил ссылку: «Переслать» ничего не отправляет и не включает, предлагает новую.
  const owner = await apiToken(request, 'ui.owner');
  const off = await request.delete(`${API}/objects/ui_room/share`, { headers: { Authorization: `Bearer ${owner}` } });
  expect(off.ok()).toBeTruthy();
  await forward.click();
  await expect(page.getByTestId('forward-off')).toContainText('Ссылка отключена');
  expect((await sharedCalls()).length).toBe(2);
  expect((await request.get(`${API}/public/rooms/${token}`)).status()).toBe(404);

  await page.getByTestId('forward-renew').click();
  await expect.poll(async () => (await sharedCalls()).length).toBe(3);
  const fresh = (await sharedCalls())[2]!.url!;
  expect(fresh).toMatch(TOKEN_URL);
  expect(fresh).not.toBe(first.url);
  expect((await request.get(`${API}/public/rooms/${token}`)).status()).toBe(404);
  expect((await request.get(`${API}/public/rooms/${fresh.split('/#/r/')[1]}`)).status()).toBe(200);
});

test('«Переслать» без системного меню копирует ссылку и показывает «Ссылка скопирована»', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });
  await enter(page);
  await reachResult(page);
  await page.getByRole('button', { name: 'Переслать', exact: true }).click();
  await expect(page.getByTestId('forward-note')).toHaveText('Ссылка скопирована');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(TOKEN_URL);
});

test('в ответе сервера по открытой ссылке нет цен и личных данных', async ({ request }) => {
  const owner = await markRoomWithSecrets(request);
  const made = await request.post(`${API}/objects/ui_room/share`, {
    headers: { Authorization: `Bearer ${owner}` },
    data: {
      answers: {
        roomType: 'bedroom',
        ceilingAreaM2: 24,
        slabType: 'monolith',
        noisyNeighbors: 'often_noisy',
        noiseKind: 'impact',
        clientName: 'UI Client',
        clientPhone: '+7 900 555-01-02',
        address: 'Тестовый адрес',
        totalCost: 75261,
      },
    },
  });
  expect(made.ok()).toBeTruthy();
  const { token } = ((await made.json()) as { link: { token: string } }).link;
  expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);

  // Без заголовка Authorization.
  const res = await request.get(`${API}/public/rooms/${token}`);
  expect(res.status()).toBe(200);
  const raw = await res.text();
  const body = JSON.parse(raw) as { share: { roomName: string; room: Record<string, unknown> } };
  expect(Object.keys(body)).toEqual(['share']);
  expect(Object.keys(body.share).sort()).toEqual(['room', 'roomName', 'updatedAt']);
  expect(body.share.roomName).toBe('Спальня');
  expect(Object.keys(body.share.room).sort()).toEqual([
    'ceilingAreaM2',
    'floorAbove',
    'houseType',
    'noiseKind',
    'noisyNeighbors',
    'objectStage',
    'plannedCeiling',
    'roomType',
    'roomTypeCustom',
    'roomWishes',
    'slabThickness',
    'slabType',
  ]);
  for (const secret of SECRETS) expect(raw, `в ответе не должно быть «${secret}»`).not.toContain(secret);

  // Чужой токен и мусор отвечают одинаково.
  for (const bad of ['A'.repeat(32), 'abc', `${token.slice(0, -1)}${token.endsWith('_') ? '-' : '_'}`]) {
    const miss = await request.get(`${API}/public/rooms/${bad}`);
    expect(miss.status()).toBe(404);
  }
});

test('монтажник не создаёт ссылку, а замерщик без назначения комнату не видит', async ({ request }) => {
  const crew = await apiToken(request, 'ui.crew');
  const measurer = await apiToken(request, 'ui.measurer');
  const denied = await request.post(`${API}/objects/ui_room/share`, {
    headers: { Authorization: `Bearer ${crew}` },
    data: { answers: { roomType: 'bedroom' } },
  });
  expect(denied.status()).toBe(403);
  const hidden = await request.post(`${API}/objects/ui_room/share`, {
    headers: { Authorization: `Bearer ${measurer}` },
    data: { answers: { roomType: 'bedroom' } },
  });
  expect(hidden.status()).toBe(404);
  const anon = await request.post(`${API}/objects/ui_room/share`, { data: { answers: {} } });
  expect(anon.status()).toBe(401);
});

test('в PDF-отчёте есть QR на страницу клиента, и он совпадает со ссылкой', async ({ page, request }) => {
  await markRoomWithSecrets(request);
  await enter(page);
  await reachResult(page);
  // Панель не открываем: отчёт сам создаёт ссылку при сохранении.
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Комната' })).toBeVisible();

  const owner = await apiToken(request, 'ui.owner');
  const auth = { Authorization: `Bearer ${owner}` };
  let docId = '';
  await expect
    .poll(
      async () => {
        const res = await request.get(`${API}/objects/ui_room`, { headers: auth });
        const obj = ((await res.json()) as { object: { documents?: { id: string; kind: string }[] } }).object;
        docId = obj.documents?.find((doc) => doc.kind === 'profile')?.id ?? '';
        return docId;
      },
      { timeout: 30000 },
    )
    .not.toBe('');

  const share = await request.get(`${API}/objects/ui_room/share`, { headers: auth });
  const { link } = (await share.json()) as { link: { enabled: boolean; token: string } };
  expect(link.enabled).toBe(true);
  const expected = `${new URL(page.url()).origin}/#/r/${link.token}`;

  const doc = await request.get(`${API}/objects/ui_room/documents/${docId}`, { headers: auth });
  const { pdfBase64 } = (await doc.json()) as { pdfBase64: string };
  expect(Buffer.from(pdfBase64, 'base64').subarray(0, 4).toString()).toBe('%PDF');

  await page.addScriptTag({ content: readFileSync(JSQR_PATH, 'utf8') });
  const decoded = await page.evaluate(`(async () => {
    const { loadPdfJs, pdfDocumentOptions } = await import('/src/ui/filePreview/pdfjsLoader.ts');
    const pdfjs = await loadPdfJs();
    const data = Uint8Array.from(atob(${JSON.stringify(pdfBase64)}), (c) => c.charCodeAt(0));
    const pdf = await pdfjs.getDocument({ data, ...pdfDocumentOptions() }).promise;
    const found = [];
    for (let n = 1; n <= pdf.numPages; n += 1) {
      const pg = await pdf.getPage(n);
      const viewport = pg.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      await pg.render({ canvasContext: ctx, viewport }).promise;
      // jsQR находит один код за проход, а на странице их три: идём окнами по странице.
      const winH = 340;
      const halves = [[0, canvas.width], [0, Math.floor(canvas.width / 2)], [Math.floor(canvas.width / 2), canvas.width]];
      for (let y = 0; y < canvas.height; y += 110) {
        const h = Math.min(winH, canvas.height - y);
        for (const [x0, x1] of halves) {
          const part = ctx.getImageData(x0, y, x1 - x0, h);
          const hit = window.jsQR(part.data, part.width, part.height);
          if (hit && hit.data && !found.includes(hit.data)) found.push(hit.data);
        }
      }
    }
    return found;
  })()`);
  expect(decoded as string[]).toContain(expected);
});
