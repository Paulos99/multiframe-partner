import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { openProjectRoom } from './open-room';

/**
 * Работа без связи у замерщика: этап «Замер», заметка и фото копятся на телефоне, индикатор
 * и полоса-напоминание, автоотправка при возврате связи, конфликт этапа и предупреждение «больше суток».
 * Связь выключается через context.setOffline.
 */
const API = 'http://127.0.0.1:4181';
const password = 'ui-fixture-password-only';
const BEFORE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'ceiling-before.jpg');
const shots = process.env.REVIEW_SHOTS_DIR;
if (shots) mkdirSync(shots, { recursive: true });
async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}`, fullPage: true });
}

async function token(request: APIRequestContext, login: string): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: { login, password } });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { token: string }).token;
}

async function room(request: APIRequestContext, auth: string, id = 'ui_room') {
  const res = await request.get(`${API}/objects/${id}`, { headers: { Authorization: `Bearer ${auth}` } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return ((await res.json()) as { object: { status: string; notes?: Array<{ text: string; clientId?: string }> } }).object;
}

async function photos(request: APIRequestContext, auth: string, id = 'ui_room') {
  const res = await request.get(`${API}/objects/${id}/photos`, { headers: { Authorization: `Bearer ${auth}` } });
  return ((await res.json()) as { photos: Array<{ id: string; clientId?: string; stage: string }> }).photos;
}

async function enter(page: Page, login: string) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(login);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Проекты', exact: true })).toBeVisible();
}

async function openBedroom(page: Page) {
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  const { drawer } = await openProjectRoom(page, 'Спальня');
  return drawer;
}

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/__reset`);
  // Спальня назначена замерщику.
  const owner = await token(request, 'ui.owner');
  const res = await request.patch(`${API}/objects/ui_room`, {
    headers: { Authorization: `Bearer ${owner}` },
    data: { assignedTo: 'ui_measurer' },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
});

test('замерщик без связи: «Замер», заметка и фото ждут на телефоне и уходят сами, когда связь вернулась', async ({
  page,
  context,
  request,
}) => {
  const auth = await token(request, 'ui.measurer');
  await enter(page, 'ui.measurer');
  const drawer = await openBedroom(page);
  await expect(drawer.getByRole('heading', { name: /Спальня.*Черновик/ })).toBeVisible();
  await expect(page.getByTestId('photo-report')).toBeVisible();
  await expect(page.getByTestId('sync-status').first()).toHaveAttribute('aria-label', 'Всё отправлено');

  await context.setOffline(true);
  await expect(page.getByTestId('sync-status').first()).toHaveAttribute('aria-label', 'Нет связи');
  await expect(page.getByRole('status').filter({ hasText: 'Нет связи — показаны комнаты с телефона' }).first()).toBeVisible();

  // Этап «Замер» замерщик ставит сам.
  await drawer.getByRole('button', { name: 'Замер сделан', exact: true }).click();
  await expect(drawer.getByRole('heading', { name: /Спальня.*Замер/ })).toBeVisible();
  await expect(page.getByText('Сохранено на телефоне. Отправим, когда появится связь.')).toBeVisible();

  // Заметка.
  await drawer.getByLabel('Новая заметка к комнате').fill('Высота 2,7 м, люстра в центре');
  await drawer.getByRole('button', { name: 'Добавить заметку' }).click();
  const queuedNote = drawer.getByTestId('room-notes').locator('[data-queued="true"]');
  await expect(queuedNote).toContainText('Высота 2,7 м, люстра в центре');
  await expect(queuedNote).toContainText('На телефоне, ждёт отправки');

  // Фото: сжимается и ложится в очередь с миниатюрой.
  await page.getByTestId('photo-gallery-before').setInputFiles(BEFORE);
  const queuedPhoto = page.getByTestId('photo-stage-before').getByTestId('photo-queued');
  await expect(queuedPhoto).toHaveCount(1, { timeout: 20000 });
  await expect(queuedPhoto).toContainText('На телефоне, ждёт отправки');
  await expect(queuedPhoto.locator('img')).toBeVisible();

  // Индикатор и полоса: ждут отправки 3 объекта (комната, заметка, фото).
  await expect(page.getByTestId('sync-status').first()).toHaveAttribute('aria-label', 'Нет связи · ждёт отправки: 3');
  const banner = page.getByTestId('sync-banner');
  await expect(banner).toContainText('Подключитесь к интернету, чтобы отправить данные: ждут отправки 3 объекта.');
  await expect(banner).toContainText('1 фото, 1 комната, 1 заметка');
  await shot(page, 'offline-measurer-queue.png');
  if (shots) {
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, 'offline-measurer-queue-390.png');
    await page.setViewportSize({ width: 1440, height: 1000 });
  }

  // На сервере пока ничего нет.
  expect((await room(request, auth)).status).toBe('draft');
  expect(await photos(request, auth)).toHaveLength(0);

  // Связь вернулась: всё уходит само, без нажатий.
  await context.setOffline(false);
  await expect(page.getByTestId('sync-status').first()).toHaveAttribute('aria-label', 'Всё отправлено', { timeout: 30000 });
  await expect(banner).toHaveCount(0);
  await expect(page.getByTestId('photo-stage-before').getByTestId('photo-tile')).toHaveCount(1, { timeout: 20000 });
  await expect(drawer.getByTestId('room-notes').locator('[data-queued="true"]')).toHaveCount(0);
  await shot(page, 'offline-measurer-sent.png');

  const saved = await room(request, auth);
  expect(saved.status).toBe('measured');
  expect(saved.notes?.map((note) => note.text)).toEqual(['Высота 2,7 м, люстра в центре']);
  const list = await photos(request, auth);
  expect(list).toHaveLength(1);
  expect(list[0]!.clientId).toMatch(/^ph_/);
});

test('конфликт этапа: менеджер сменил этап, пока замерщик был без связи, — замерщик видит выбор', async ({
  page,
  context,
  request,
}) => {
  await enter(page, 'ui.measurer');
  const drawer = await openBedroom(page);
  await context.setOffline(true);
  await drawer.getByRole('button', { name: 'Замер сделан', exact: true }).click();
  await expect(drawer.getByRole('heading', { name: /Спальня.*Замер/ })).toBeVisible();

  const owner = await token(request, 'ui.owner');
  const moved = await request.patch(`${API}/objects/ui_room`, {
    headers: { Authorization: `Bearer ${owner}` },
    data: { status: 'quote_sent', updatedAt: new Date(Date.now() + 1000).toISOString() },
  });
  expect(moved.ok(), await moved.text()).toBeTruthy();

  await context.setOffline(false);
  const dialog = page.getByRole('dialog', { name: 'Этап комнаты изменили' });
  await expect(dialog).toBeVisible({ timeout: 30000 });
  await expect(dialog).toContainText('на сервере этап стал «КП отправлено»');
  await expect(dialog).toContainText('вы поставили «Замер»');
  // Замерщик не может вернуть «Замер» поверх этапа менеджера.
  await expect(dialog.getByRole('button', { name: /Оставить мой/ })).toHaveCount(0);
  await shot(page, 'offline-stage-conflict.png');
  await dialog.getByRole('button', { name: 'Оставить «КП отправлено»' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('sync-status').first()).toHaveAttribute('aria-label', 'Всё отправлено', { timeout: 30000 });
  const auth = await token(request, 'ui.measurer');
  expect((await room(request, auth)).status).toBe('quote_sent');
});

test('очередь уходит при открытии приложения, если в прошлый раз сервер не ответил', async ({ page, context, request }) => {
  await enter(page, 'ui.measurer');
  const drawer = await openBedroom(page);
  await context.setOffline(true);
  await drawer.getByLabel('Новая заметка к комнате').fill('Клиент просит позвонить заранее');
  await drawer.getByRole('button', { name: 'Добавить заметку' }).click();
  await expect(drawer.getByTestId('room-notes').locator('[data-queued="true"]')).toHaveCount(1);

  // Связь есть, но сервер заметок не принимает: заметка остаётся в очереди с паузой до повтора.
  await page.route('**/objects/ui_room/notes', (route) => route.abort('connectionfailed'));
  await context.setOffline(false);
  await expect(page.getByTestId('sync-status').first()).toHaveAttribute('aria-label', 'Ждёт отправки: 1', { timeout: 30000 });
  await page.unroute('**/objects/ui_room/notes');

  // Приложение открыли заново — заметка уходит сама.
  await page.reload();
  await expect(page.getByTestId('sync-status').first()).toHaveAttribute('aria-label', 'Всё отправлено', { timeout: 30000 });
  const auth = await token(request, 'ui.measurer');
  expect((await room(request, auth)).notes?.map((note) => note.text)).toEqual(['Клиент просит позвонить заранее']);
});

test('больше суток без связи: полоса просит подключиться к интернету', async ({ page, context }) => {
  await enter(page, 'ui.measurer');
  await expect(page.getByTestId('sync-banner')).toHaveCount(0);
  await context.setOffline(true);
  await page.evaluate(() => {
    const twoDaysAgo = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString();
    localStorage.setItem('mf_partner_last_sync_v1', JSON.stringify({ ui_measurer: twoDaysAgo }));
    window.dispatchEvent(new Event('offline'));
  });
  const banner = page.getByTestId('sync-banner');
  await expect(banner).toContainText('Вы больше суток не были на связи. Подключитесь к интернету');
  await shot(page, 'offline-stale-banner.png');
  await context.setOffline(false);
  await expect(banner).toHaveCount(0, { timeout: 30000 });
});
