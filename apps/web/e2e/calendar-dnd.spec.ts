import { expect, test, type Locator, type Page } from '@playwright/test';

const password = 'ui-fixture-password-only';
const shots = process.env.CALENDAR_DND_SHOTS_DIR;

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

async function enter(page: Page, role: string) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  if (role === 'admin') {
    await expect(page.getByRole('tab', { name: 'Календарь', exact: true })).toBeVisible();
  } else {
    await expect(page.getByRole('tab', { name: 'Проекты', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Календарь', exact: true })).toHaveCount(0);
  }
}

/** Календарь: у админа — вкладка, у остальных — вид внутри «Проекты». */
async function openCalendar(page: Page) {
  const calendarTab = page.getByRole('tab', { name: 'Календарь', exact: true });
  if (await calendarTab.count()) {
    await calendarTab.click();
  } else {
    await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
    await page.getByRole('group', { name: 'Вид проектов' }).getByRole('button', { name: 'Календарь', exact: true }).click();
  }
  const panel = page.getByRole('region', { name: 'Календарь', exact: true });
  await expect(panel.getByRole('heading', { name: 'Календарь', exact: true })).toBeVisible();
  return panel;
}

async function shot(page: Page, name: string) {
  if (!shots) return;
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: false });
}

/** Настоящий жест мышью: как в канбане. */
async function drag(page: Page, from: Locator, to: Locator, steps = 16) {
  await from.scrollIntoViewIfNeeded();
  await to.scrollIntoViewIfNeeded();
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error('нет координат для переноса');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 4, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps });
  await page.mouse.up();
}

function dayAfterTomorrowKey(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 2);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function tomorrowKey(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

test('владелец перетаскивает выезд на другой день, время сохраняется', async ({ page, request }) => {
  const login = await request.post('http://127.0.0.1:4181/auth/login', { data: { login: 'ui.owner', password } });
  const { token } = (await login.json()) as { token: string };
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  const created = await request.post('http://127.0.0.1:4181/calendar', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      kind: 'measure',
      projectId: 'ui_project',
      objectId: 'ui_room',
      userId: 'ui_measurer',
      startsAt: tomorrow.toISOString(),
      durationMin: 60,
    },
  });
  expect(created.ok()).toBeTruthy();
  const { visit } = (await created.json()) as { visit: { id: string } };

  await enter(page, 'owner');
  const panel = await openCalendar(page);
  await panel.getByRole('group', { name: 'Вид календаря' }).getByRole('button', { name: 'Неделя', exact: true }).click();

  const event = panel.locator(`[data-visit-id="${visit.id}"]`);
  await expect(event).toBeVisible();
  await expect(event).toContainText('10:00–11:00');
  const sourceDay = panel.locator(`[data-day="${tomorrowKey()}"]`);
  const targetDay = panel.locator(`[data-day="${dayAfterTomorrowKey()}"]`);
  await expect(sourceDay).toBeVisible();
  await expect(targetDay).toBeVisible();

  const patched = page.waitForResponse(
    (res) => res.request().method() === 'PATCH' && res.url().includes(`/calendar/${visit.id}`) && res.ok(),
  );
  await drag(page, event, targetDay);
  await patched;

  await expect(targetDay.locator(`[data-visit-id="${visit.id}"]`)).toBeVisible();
  await expect(targetDay.locator(`[data-visit-id="${visit.id}"]`)).toContainText('10:00–11:00');
  await expect(sourceDay.locator(`[data-visit-id="${visit.id}"]`)).toHaveCount(0);
  await shot(page, '01-drag-to-day');

  await page.reload();
  await openCalendar(page);
  await page.getByRole('region', { name: 'Календарь', exact: true }).getByRole('group', { name: 'Вид календаря' }).getByRole('button', { name: 'Неделя', exact: true }).click();
  await expect(page.locator(`[data-day="${dayAfterTomorrowKey()}"] [data-visit-id="${visit.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-day="${dayAfterTomorrowKey()}"] [data-visit-id="${visit.id}"]`)).toContainText('10:00–11:00');
});

test('клик по дню открывает окно нового выезда с этой датой', async ({ page }) => {
  await enter(page, 'owner');
  const panel = await openCalendar(page);
  await panel.getByRole('group', { name: 'Вид календаря' }).getByRole('button', { name: 'Неделя', exact: true }).click();

  const target = panel.locator(`[data-day="${dayAfterTomorrowKey()}"]`);
  await target.getByRole('button', { name: /^Назначить выезд на / }).first().click();

  const dialog = page.getByRole('dialog', { name: 'Назначить: замер' });
  await expect(dialog).toBeVisible();
  const dateInput = dialog.getByLabel('Дата', { exact: true });
  const expected = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();
  await expect(dateInput).toHaveValue(expected);
  await expect(dialog.getByLabel('Время', { exact: true })).toHaveValue('10:00');
  await shot(page, '02-create-from-day');

  await dialog.getByLabel('Проект', { exact: true }).selectOption('ui_project');
  await dialog.getByLabel('Комната', { exact: true }).selectOption({ label: 'Спальня' });
  await dialog.getByLabel('Замерщик', { exact: true }).selectOption({ label: 'UI measurer' });
  const saved = page.waitForResponse((res) => res.request().method() === 'POST' && /\/calendar$/.test(res.url()) && res.ok());
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await saved;
  await expect(dialog).toHaveCount(0);
  await expect(target.getByRole('button', { name: /^Замер 10:00–11:00/ })).toBeVisible();
  await shot(page, '03-created-on-day');
});

test('замерщик не перетаскивает и не создаёт кликом по дню', async ({ page, request }) => {
  const login = await request.post('http://127.0.0.1:4181/auth/login', { data: { login: 'ui.owner', password } });
  const { token } = (await login.json()) as { token: string };
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(12, 0, 0, 0);
  const created = await request.post('http://127.0.0.1:4181/calendar', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      kind: 'measure',
      projectId: 'ui_project',
      objectId: 'ui_room',
      userId: 'ui_measurer',
      startsAt: tomorrow.toISOString(),
      durationMin: 60,
    },
  });
  expect(created.ok()).toBeTruthy();

  await enter(page, 'measurer');
  const panel = await openCalendar(page);
  await panel.getByRole('group', { name: 'Вид календаря' }).getByRole('button', { name: 'Неделя', exact: true }).click();
  await expect(panel.getByRole('button', { name: /^Назначить выезд на / })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Назначить выезд', exact: true })).toHaveCount(0);
  const event = panel.locator('[data-visit-id]').first();
  await expect(event).toBeVisible();
  await expect(event.getByRole('button').first()).not.toHaveAttribute('aria-roledescription', /.+/);
  await shot(page, '04-measurer-no-dnd');
});
