import { expect, test, type Page } from '@playwright/test';
import { openProjectRoom } from './open-room';

const password = 'ui-fixture-password-only';
const shots = process.env.CALENDAR_SHOTS_DIR;

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

async function enter(page: Page, role: string) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Календарь', exact: true })).toBeVisible();
}

async function openCalendar(page: Page) {
  await page.getByRole('tab', { name: 'Календарь', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Календарь' });
  await expect(panel.getByRole('heading', { name: 'Календарь', exact: true })).toBeVisible();
  return panel;
}

async function shot(page: Page, name: string) {
  if (!shots) return;
  // Снимки для передачи: ждём конца появления окон, проверки от этого не зависят.
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: false });
}

/** Назначает выезд через окно календаря: завтра, время и сотрудник из аргументов. */
async function planVisit(page: Page, opts: { time: string; room?: string; person: string; expectConflict?: boolean }) {
  const panel = page.getByRole('region', { name: 'Календарь' });
  await panel.getByRole('button', { name: 'Назначить выезд', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Назначить: замер' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Проект', { exact: true }).selectOption('ui_project');
  if (opts.room) await dialog.getByLabel('Комната', { exact: true }).selectOption({ label: opts.room });
  await dialog.getByLabel('Время', { exact: true }).fill(opts.time);
  await dialog.getByLabel('Замерщик', { exact: true }).selectOption({ label: opts.person });
  const alert = dialog.getByRole('alert').filter({ hasText: 'Пересечение по времени' });
  if (opts.expectConflict) await expect(alert).toBeVisible();
  else await expect(alert).toHaveCount(0);
  if (opts.expectConflict) await shot(page, '04-dialog-conflict');
  const saved = page.waitForResponse((res) => res.request().method() === 'POST' && /\/calendar$/.test(res.url()) && res.ok());
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await saved;
  await expect(dialog).toHaveCount(0);
}

test('владелец назначает замер, видит пересечение, напоминание и выезд в проекте', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enter(page, 'owner');
  const panel = await openCalendar(page);
  await expect(panel.getByText('Выездов пока нет.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Напоминаний нет' })).toBeVisible();

  await planVisit(page, { time: '10:00', room: 'Спальня', person: 'UI measurer' });
  await planVisit(page, { time: '10:30', room: 'Кухня', person: 'UI measurer', expectConflict: true });

  // Вид «День» на завтра: оба выезда, оба помечены как пересечение.
  await panel.getByRole('group', { name: 'Вид календаря' }).getByRole('button', { name: 'День', exact: true }).click();
  await panel.getByRole('button', { name: 'Вперёд', exact: true }).click();
  const first = panel.getByRole('button', { name: /^Замер 10:00–11:00, Тестовая квартира, Спальня/ });
  const second = panel.getByRole('button', { name: /^Замер 10:30–11:30, Тестовая квартира, Кухня/ });
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  await expect(first).toContainText('Пересечение');
  await expect(panel.getByRole('status').filter({ hasText: 'Пересечения по времени: 2' })).toBeVisible();
  await shot(page, '03-day');

  // Неделя и месяц показывают те же выезды.
  await panel.getByRole('group', { name: 'Вид календаря' }).getByRole('button', { name: 'Неделя', exact: true }).click();
  await expect(first).toBeVisible();
  await shot(page, '01-week');
  await panel.getByRole('group', { name: 'Вид календаря' }).getByRole('button', { name: 'Месяц', exact: true }).click();
  await expect(panel.getByRole('button', { name: /^Замер 10:00–11:00/ })).toBeVisible();
  await shot(page, '02-month');

  // Фильтр по типу: монтажей нет.
  await panel.getByLabel('Тип выезда').selectOption('install');
  await expect(panel.getByRole('button', { name: /^Замер 10:00–11:00/ })).toHaveCount(0);
  await panel.getByLabel('Тип выезда').selectOption('');

  // Колокольчик: «Завтра замер», можно отметить «Готово».
  const bell = page.getByRole('button', { name: 'Напоминания: 2' });
  await expect(bell).toBeVisible();
  await bell.click();
  const list = page.getByRole('dialog', { name: 'Напоминания' });
  await expect(list.getByText('Завтра замер')).toHaveCount(2);
  await shot(page, '05-bell');
  const acked = page.waitForResponse((res) => /\/calendar\/reminders$/.test(res.url()) && res.ok());
  await list.getByRole('button', { name: 'Готово' }).first().click();
  await acked;
  await expect(page.getByRole('button', { name: 'Напоминания: 1' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Нажатие на выезд открывает комнату.
  await panel.getByRole('group', { name: 'Вид календаря' }).getByRole('button', { name: 'Неделя', exact: true }).click();
  await first.click();
  await expect(page).toHaveURL(/#project\/ui_project\/room\/ui_room/);
  await expect(page.getByRole('region', { name: 'Комната' })).toBeVisible();

  // На странице проекта виден ближайший замер.
  await page.getByRole('region', { name: 'Комната' }).getByRole('button', { name: 'К проекту', exact: true }).click();
  await page.getByRole('region', { name: 'Проект' }).getByRole('tab', { name: 'Обзор', exact: true }).click();
  const visits = page.getByRole('region', { name: 'Замер и монтаж' });
  await expect(visits).toContainText('10:00–11:00 · UI measurer');
  await expect(visits).toContainText('Время не назначено');
  await shot(page, '06-project');
  expect(errors).toEqual([]);
});

test('замерщик видит только свои выезды и не назначает время', async ({ page, request }) => {
  const login = await request.post('http://127.0.0.1:4181/auth/login', { data: { login: 'ui.owner', password } });
  const { token } = (await login.json()) as { token: string };
  const tomorrow = new Date(Date.now() + 24 * 3600_000);
  tomorrow.setHours(12, 0, 0, 0);
  const headers = { Authorization: `Bearer ${token}` };
  const mine = await request.post('http://127.0.0.1:4181/calendar', {
    headers,
    data: { kind: 'measure', projectId: 'ui_project', objectId: 'ui_room', userId: 'ui_measurer', startsAt: tomorrow.toISOString(), durationMin: 60 },
  });
  expect(mine.ok()).toBeTruthy();
  const other = await request.post('http://127.0.0.1:4181/calendar', {
    headers,
    data: { kind: 'install', projectId: 'ui_project', objectId: 'ui_crew_room', userId: 'ui_crew', startsAt: tomorrow.toISOString(), durationMin: 240 },
  });
  expect(other.ok()).toBeTruthy();

  await enter(page, 'measurer');
  const panel = await openCalendar(page);
  await panel.getByRole('group', { name: 'Вид календаря' }).getByRole('button', { name: 'День', exact: true }).click();
  await panel.getByRole('button', { name: 'Вперёд', exact: true }).click();
  await expect(panel.getByRole('button', { name: /^Замер 12:00–13:00, Тестовая квартира, Спальня/ })).toBeVisible();
  await expect(panel.getByRole('button', { name: /^Монтаж/ })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Назначить выезд' })).toHaveCount(0);
  await expect(panel.getByLabel('Сотрудник')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Подробнее о выезде' }).click();
  const details = page.getByRole('dialog', { name: 'Выезд' });
  await expect(details.getByRole('button', { name: 'Изменить' })).toHaveCount(0);
  await shot(page, '07-measurer');
  const done = page.waitForResponse((res) => res.request().method() === 'PATCH' && /\/calendar\//.test(res.url()) && res.ok());
  await details.getByRole('button', { name: 'Отметить выполненным' }).click();
  await done;
  await expect(panel.getByRole('button', { name: /^Замер 12:00–13:00/ })).toContainText('выполнен');
});

test('перевод комнаты на «Замер» предлагает назначить время', async ({ page }) => {
  await enter(page, 'owner');
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  const { drawer } = await openProjectRoom(page, 'Спальня');
  await drawer.getByRole('group', { name: 'Сменить статус' }).getByRole('button', { name: 'Замер', exact: true }).click();
  const prompt = page.getByRole('status', { name: 'Назначить время выезда' });
  await expect(prompt).toContainText('Комната «Спальня» перешла на этап «Замер». Когда замер?');
  await shot(page, '08-stage-prompt');
  await prompt.getByRole('button', { name: 'Назначить время' }).click();
  const dialog = page.getByRole('dialog', { name: 'Назначить: замер' });
  await expect(dialog.getByLabel('Проект', { exact: true })).toHaveValue('ui_project');
  await expect(dialog.getByLabel('Комната', { exact: true })).toHaveValue('ui_room');
  await dialog.getByLabel('Замерщик', { exact: true }).selectOption({ label: 'UI measurer' });
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await openCalendar(page);
  await expect(page.getByRole('button', { name: 'Напоминания: 1' })).toBeVisible();
});

test('Готово убирает напоминание после перезагрузки', async ({ page }) => {
  await enter(page, 'owner');
  const panel = await openCalendar(page);
  await planVisit(page, { time: '11:00', room: 'Спальня', person: 'UI measurer' });
  const bell = page.getByRole('button', { name: /Напоминания: \d+/ });
  await expect(bell).toBeVisible();
  await bell.click();
  const list = page.getByRole('dialog', { name: 'Напоминания' });
  await expect(list.getByText('Завтра замер')).toBeVisible();
  const before = await bell.getAttribute('aria-label');
  const acked = page.waitForResponse((res) => res.request().method() === 'POST' && /\/calendar\/reminders$/.test(res.url()) && res.ok());
  await list.getByRole('button', { name: 'Готово' }).first().click();
  await acked;
  await expect(list.getByText('Завтра замер')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Календарь', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Напоминания|Напоминаний нет/ }).click();
  const again = page.getByRole('dialog', { name: 'Напоминания' });
  await expect(again.getByText('Завтра замер')).toHaveCount(0);
  await expect(again.getByText('Всё сделано. Новые напоминания появятся здесь.')).toBeVisible();
  expect(before).toMatch(/Напоминания: \d+/);
});

test('Отложить на час убирает напоминание после перезагрузки', async ({ page }) => {
  await enter(page, 'owner');
  await openCalendar(page);
  await planVisit(page, { time: '14:00', room: 'Кухня', person: 'UI measurer' });
  const bell = page.getByRole('button', { name: /Напоминания: \d+/ });
  await expect(bell).toBeVisible();
  await bell.click();
  const list = page.getByRole('dialog', { name: 'Напоминания' });
  await expect(list.getByText('Завтра замер')).toBeVisible();
  const snoozed = page.waitForResponse((res) => res.request().method() === 'POST' && /\/calendar\/reminders$/.test(res.url()) && res.ok());
  await list.getByRole('button', { name: 'Через час' }).first().click();
  await snoozed;
  await expect(list.getByText('Завтра замер')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Календарь', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Напоминания|Напоминаний нет/ }).click();
  const again = page.getByRole('dialog', { name: 'Напоминания' });
  await expect(again.getByText('Завтра замер')).toHaveCount(0);
});


test('админ фильтрует календарь по партнёру', async ({ page, request }) => {
  const tomorrow = new Date(Date.now() + 24 * 3600_000);
  tomorrow.setHours(11, 0, 0, 0);
  const startsAt = tomorrow.toISOString();

  const ownerA = await request.post('http://127.0.0.1:4181/auth/login', { data: { login: 'ui.owner', password } });
  const tokenA = ((await ownerA.json()) as { token: string }).token;
  const createA = await request.post('http://127.0.0.1:4181/calendar', {
    headers: { Authorization: `Bearer ${tokenA}` },
    data: { kind: 'measure', projectId: 'ui_project', objectId: 'ui_room', userId: 'ui_measurer', startsAt, durationMin: 60 },
  });
  expect(createA.ok()).toBeTruthy();

  const ownerB = await request.post('http://127.0.0.1:4181/auth/login', { data: { login: 'ui.owner_b', password } });
  const tokenB = ((await ownerB.json()) as { token: string }).token;
  const created = await request.post('http://127.0.0.1:4181/projects', {
    headers: { Authorization: `Bearer ${tokenB}` },
    data: { name: 'Квартира B', clientName: 'Клиент B', address: 'Адрес B', city: 'Москва' },
  });
  expect(created.ok()).toBeTruthy();
  const projectB = ((await created.json()) as { project: { id: string } }).project.id;
  const createB = await request.post('http://127.0.0.1:4181/calendar', {
    headers: { Authorization: `Bearer ${tokenB}` },
    data: { kind: 'measure', projectId: projectB, userId: 'ui_owner_b', startsAt, durationMin: 60 },
  });
  expect(createB.ok()).toBeTruthy();

  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.admin');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('tab', { name: 'Календарь', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Календарь' });
  await expect(panel.getByRole('heading', { name: 'Календарь', exact: true })).toBeVisible();
  const partner = panel.getByLabel('Партнёр');
  await expect(partner).toBeVisible();
  await expect(partner.locator('option')).toHaveCount(3); // Все + две компании (без внутренней StP)

  await panel.getByRole('group', { name: 'Вид календаря' }).getByRole('button', { name: 'День', exact: true }).click();
  await panel.getByRole('button', { name: 'Вперёд', exact: true }).click();
  await expect(panel.getByRole('button', { name: /^Замер 11:00/ })).toHaveCount(2);

  const filtered = page.waitForResponse((res) => res.request().method() === 'GET' && /\/calendar\?orgId=/.test(res.url()) && res.ok());
  await partner.selectOption({ label: 'UI test company' });
  await filtered;
  await expect(panel.getByRole('button', { name: /^Замер 11:00/ })).toHaveCount(1);

  await page.getByRole('tab', { name: 'Партнёры', exact: true }).click();
  await page.getByRole('tab', { name: 'Календарь', exact: true }).click();
  await expect(panel.getByLabel('Партнёр')).toHaveValue('ui_org');
  await expect(panel.getByRole('button', { name: /^Замер 11:00/ })).toHaveCount(1);

  await shot(page, '09-admin-partner-filter');
});
