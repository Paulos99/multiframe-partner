import { test, expect, type Page } from '@playwright/test';
import { openProjectRoom } from './open-room';
const password = 'ui-fixture-password-only';
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});
async function enter(page: Page, role = 'owner', pw = password) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
  await page.getByLabel('Пароль', { exact: true }).fill(pw);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
}
async function openProjects(page: Page) {
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible();
}
test('admin keeps one shared period control inside the analytics card', async ({ page }) => {
  await enter(page, 'admin');
  await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Управление партнёрской сетью' })).toHaveCount(0);
  await expect(page.getByText('Партнёры и поддержка команды', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Последнее событие', { exact: false })).toHaveCount(0);
  const controls = page.getByRole('group', { name: 'Период аналитики' });
  const calendar = controls.locator('button[aria-controls]');
  await expect(page.locator('button[aria-controls]')).toHaveCount(1);
  await expect(controls.getByRole('button')).toHaveCount(1);
  const title = await page.getByRole('heading', { name: 'Аналитика', exact: true }).boundingBox();
  const picker = await calendar.boundingBox();
  expect(title && picker && picker.x > title.x + title.width, 'период справа от заголовка').toBeTruthy();
  expect(title && picker && picker.y < title.y + title.height + 8, 'период в строке заголовка').toBeTruthy();
  await calendar.click();
  const updated = page.waitForRequest((r) => new URL(r.url()).pathname === '/analytics/dashboard' && !new URL(r.url()).searchParams.has('from'));
  await page.getByRole('button', { name: 'Всё время', exact: true }).click();
  await updated;
  await expect(calendar).toHaveText('Всё время');
  await page.getByRole('tab', { name: 'Партнёры', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Партнёры/ })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Период аналитики' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Добавить', exact: true })).toHaveCount(0);
  const add = page.getByRole('button', { name: 'Добавить', exact: true });
  await expect(add).toHaveAttribute('aria-expanded', 'false');
  await add.click();
  await expect(page.getByRole('heading', { name: 'Новый партнёр', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Свернуть', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('tab', { name: 'Обучение', exact: true }).click();
  await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Период аналитики' }).locator('button[aria-controls]')).toHaveText('Всё время');
});

test('phone: analytics period wraps under the title, full width, 44px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page, 'admin');
  await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
  const calendar = page.getByRole('group', { name: 'Период аналитики' }).locator('button[aria-controls]');
  await expect(calendar).toBeVisible();
  const title = (await page.getByRole('heading', { name: 'Аналитика', exact: true }).boundingBox())!;
  const box = (await calendar.boundingBox())!;
  expect(box.y).toBeGreaterThan(title.y + title.height - 1);
  expect(box.height).toBeGreaterThanOrEqual(44);
  const card = (await page.getByRole('group', { name: 'Период аналитики' }).boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(card.width - 1);
  const r = await page.evaluate(() => ({ sw: document.scrollingElement!.scrollWidth, w: window.innerWidth }));
  expect(r.sw).toBeLessThanOrEqual(r.w);
});

test('смена статуса комнаты сохраняется и открывает карточку', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enter(page);
  await openProjects(page);
  await expect(page.getByRole('group', { name: 'Вид объектов' })).toHaveCount(0);
  await expect(page.locator('[aria-label="Доска проектов"]')).toHaveCount(0);
  const { drawer } = await openProjectRoom(page, 'Спальня');
  const saved = page.waitForResponse(
    (res) => res.request().method() === 'PATCH' && res.url().includes('/objects/ui_room') && res.ok(),
  );
  await drawer.getByRole('group', { name: 'Сменить статус' }).getByRole('button', { name: 'Замер', exact: true }).click();
  expect((await saved).request().postDataJSON().status).toBe('measured');
  await expect(page.getByRole('status').filter({ hasText: 'Сохранено' })).toBeVisible();
  await expect(drawer.getByRole('heading', { name: /Спальня.*Замер/ })).toBeVisible();
  await page.reload();
  await openProjects(page);
  const again = await openProjectRoom(page, 'Спальня');
  await expect(again.drawer.getByRole('heading', { name: /Спальня.*Замер/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('бригада не меняет статус комнаты', async ({ page }) => {
  await enter(page, 'crew');
  await openProjects(page);
  await expect(page.getByRole('group', { name: 'Вид объектов' })).toHaveCount(0);
  const { drawer } = await openProjectRoom(page, 'Гостиная');
  await expect(drawer.getByText('Статус меняет менеджер или владелец.')).toBeVisible();
  await expect(drawer.getByRole('group', { name: 'Сменить статус' })).toHaveCount(0);
  await expect(drawer.getByRole('heading', { name: /Гостиная.*Монтаж/ })).toBeVisible();
});
// Профиль: см. e2e/profile.spec.ts.
test('mobile and reduced motion: profile and board stay within viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enter(page, 'crew');
  await openProfileSettings(page);
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Закрыть профиль' }).click();
  await expect(page.getByRole('group', { name: 'Вид объектов' })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('failed stage save keeps the original card and shows the error', async ({
  page,
}) => {
  await enter(page);
  await openProjects(page);
  await expect(page.getByRole('group', { name: 'Вид объектов' })).toHaveCount(
    0,
  );
  await page.route('**/objects/ui_room', async (route) => {
    if (route.request().method() === 'PATCH')
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Нет прав на стадию' }),
      });
    else await route.continue();
  });
  const { drawer } = await openProjectRoom(page, 'Спальня');
  await drawer.getByRole('group', { name: 'Сменить статус' }).getByRole('button', { name: 'Замер', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Нет прав на стадию');
  await expect(drawer.getByRole('heading', { name: /Спальня.*Черновик/ })).toBeVisible();
});
test('owner opens a room from the project card and stays on projects', async ({ page }) => {
  await enter(page, 'owner');
  await openProjects(page);
  const { drawer } = await openProjectRoom(page, 'Спальня');
  await expect(drawer.getByRole('heading', { name: /Спальня.*Черновик/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible();
  await expect(page.locator('[aria-label="Доска проектов"]')).toHaveCount(0);
});

test('diagnostic and calculator open without runtime regressions', async ({page}) => {
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await enter(page);
 await page.getByRole('button',{name:'Проблемомер',exact:true}).click();await expect(page.getByRole('button',{name:'Начать',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Кабинет',exact:true}).click();await page.getByRole('button',{name:'Калькулятор',exact:true}).click();await expect(page.frameLocator('iframe[title="Калькулятор MultiFrame · партнёр"]').getByRole('heading',{name:'Что вы знаете о помещении?'})).toBeVisible();expect(errors).toEqual([]);
});

for (const role of ['admin', 'owner'] as const) {
  test(`${role}: сводка аналитики без «Объёма», «Отправок», «Входов» и «По дням месяца»`, async ({ page }) => {
    await enter(page, role);
    await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Динамика', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: /Площадь, м²/ }).click();
    await expect(page.getByRole('heading', { name: 'Динамика', exact: true })).toBeVisible();
    for (const label of ['Средняя м²', 'Готовых расчётов', 'Площадь, м²', 'Панели']) {
      await expect(page.getByText(label, { exact: true })).toHaveCount(1);
    }
    for (const gone of ['Объём', 'По дням месяца', 'По месяцам']) {
      await expect(page.getByRole('heading', { name: gone, exact: true })).toHaveCount(0);
    }
    await expect(page.getByText('Отправки', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Сумма м²', { exact: true })).toHaveCount(0);
  });
}

test('theme toggle: green knob in light theme, dark theme unchanged', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await enter(page, 'owner');
  const light = page.getByRole('button', { name: 'Светлая тема', exact: true });
  const knob = (b: typeof light) => b.locator('span[aria-hidden] > span').evaluate((el) => getComputedStyle(el).backgroundColor);
  await expect.poll(() => knob(light)).toBe('rgb(1, 100, 79)');
  await light.click();
  const dark = page.getByRole('button', { name: 'Тёмная тема', exact: true });
  await expect.poll(() => knob(dark)).toBe('rgb(255, 255, 255)');
});

/** На телефоне профиль — последняя вкладка нижней панели, настройки открываются оттуда; на шире — кнопка в шапке. */
async function openProfileSettings(page: Page) {
  const tab = page.locator('[data-nav-id="profile"]');
  if (await tab.isVisible()) {
    await tab.click();
    await page.getByRole('button', { name: 'Настройки профиля', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Мой профиль', exact: true }).click();
  }
}
