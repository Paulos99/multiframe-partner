import { test, expect, type Page } from '@playwright/test';

const API = 'http://127.0.0.1:4181';
const password = 'ui-fixture-password-only';
const nav = (page: Page) => page.getByRole('complementary', { name: 'Разделы кабинета' });

/** Подпись во вкладке повторена для разметки, поэтому сравниваем по началу текста. */
async function expectTwoSections(page: Page) {
  await expect(nav(page).getByRole('tab')).toHaveText([/^Обучение/, /^Инструменты/]);
}

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/__reset`);
});

async function enter(page: Page, login = 'ui.stp_manager', pass = password) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(login);
  await page.getByLabel('Пароль', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(nav(page)).toBeVisible();
}

test('менеджер StP: в меню только «Обучение» и «Инструменты», открывается «Обучение»', async ({ page }) => {
  await enter(page);
  await expectTwoSections(page);
  await expect(page.getByRole('heading', { level: 2, name: 'Обучение' })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Разделы обучения' }).getByRole('tab')).toHaveText(['Материалы', 'Тренажёр']);
  await expect(page.getByText('Инструкции и презентации по продукту.')).toBeVisible();
  for (const absent of ['Сегодня', 'Проекты', 'Компания', 'Команда', 'Аналитика', 'Партнёры', 'Прайс']) {
    await expect(page.getByRole('tab', { name: absent, exact: true })).toHaveCount(0);
  }
  await expect(page.getByText('Менеджер StP').first()).toBeVisible();
});

test('менеджер StP: тренажёр открывается внутри «Обучения»', async ({ page }) => {
  await enter(page);
  await page.getByRole('tab', { name: 'Тренажёр', exact: true }).click();
  const home = page.getByRole('region', { name: 'Тренажёр продаж' });
  await expect(home).toBeVisible();
  await expect(home).toContainText('Быстрая отработка');
  await expect(home).toContainText('Ролевые разговоры');
  await expect(home).toContainText('Проверка знаний');
  await expect(page.locator('[class*="drawer" i]')).toHaveCount(0);
});

test('менеджер StP: «Инструменты» — две карточки, без ссылок кнопки неактивны', async ({ page }) => {
  await enter(page);
  await nav(page).getByRole('tab', { name: 'Инструменты', exact: true }).click();
  const region = page.getByRole('region', { name: 'Инструменты' });
  await expect(region).toBeVisible();
  await expect(region.getByRole('heading', { level: 3 })).toHaveText(['Диагностика шума', 'Калькулятор']);
  const buttons = region.getByRole('button', { name: 'Ссылка появится позже' });
  await expect(buttons).toHaveCount(2);
  for (const index of [0, 1]) await expect(buttons.nth(index)).toBeDisabled();
  await expect(region.getByRole('link')).toHaveCount(0);
  // Партнёрских инструментов нет.
  await expect(page.getByRole('button', { name: 'Открыть Проблемомер', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Открыть Калькулятор', exact: true })).toHaveCount(0);
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('[class*="drawer" i]')).toHaveCount(0);
});

test('менеджер StP: чужие разделы по адресу не открываются, лишних запросов к серверу нет', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith(API)) calls.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  await enter(page);
  for (const hash of ['#company', '#projects', '#project/p1', '#staff/ui_sales', '#analytics', '#cases', '#tools']) {
    await page.goto(`/${hash}`);
    await expectTwoSections(page);
    await expect(page.getByText('Выручка', { exact: false })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Компания', exact: true })).toHaveCount(0);
  }
  await page.goto('/?calc=1');
  await expect(page.locator('iframe')).toHaveCount(0);
  await expectTwoSections(page);
  const forbidden = calls.filter((call) =>
    /\/(objects|projects|org\/staff|org\/settings|analytics|admin)(\/|$)/.test(call.split(' ')[1]!),
  );
  expect(forbidden).toEqual([]);
});

test('менеджер StP: сервер закрывает чужие разделы, материалы читаются', async ({ request }) => {
  const login = await request.post(`${API}/auth/login`, { data: { login: 'ui.stp_manager', password } });
  expect(login.status()).toBe(200);
  const body = await login.json();
  expect(body.user.role).toBe('stp_manager');
  const headers = { Authorization: `Bearer ${body.token}` };
  for (const path of ['/objects', '/projects', '/org/staff', '/admin/partners', '/admin/stp-managers', '/analytics/dashboard']) {
    const res = await request.get(`${API}${path}`, { headers });
    expect(res.status(), path).toBe(403);
  }
  const settings = await request.patch(`${API}/org/settings`, { headers, data: { companyName: 'x' } });
  expect(settings.status()).toBe(403);
  const created = await request.post(`${API}/objects`, { headers, data: { clientName: 'x' } });
  expect(created.status()).toBe(403);
  const forged = await request.post(`${API}/admin/stp-managers`, { headers, data: { login: 'x', password: 'y' } });
  expect(forged.status()).toBe(403);
  const materials = await request.get(`${API}/materials`, { headers });
  expect(materials.status()).toBe(200);
});

test('администратор StP создаёт менеджера, тот входит, потом администратор его удаляет', async ({ page }) => {
  await enter(page, 'ui.admin');
  await nav(page).getByRole('tab', { name: 'Партнёры', exact: true }).click();
  const block = page.locator('[data-section="stp-managers"]');
  await expect(block.getByRole('heading', { name: 'Менеджеры StP' })).toBeVisible();
  await block.getByRole('button', { name: 'Добавить', exact: true }).click();
  await block.getByLabel('Логин', { exact: true }).fill('ui.new.manager');
  await block.getByLabel('Пароль', { exact: true }).fill('new-manager-password');
  await block.getByLabel('Имя', { exact: true }).fill('Иван Новиков');
  await block.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(block.getByRole('status')).toContainText('ui.new.manager');
  await expect(block.locator('[data-stp-manager="ui.new.manager"]')).toContainText('Иван Новиков');
  // Нет поля телефона.
  await expect(page.getByLabel(/телефон/i)).toHaveCount(0);

  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await enter(page, 'ui.new.manager', 'new-manager-password');
  await expectTwoSections(page);

  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await enter(page, 'ui.admin');
  await nav(page).getByRole('tab', { name: 'Партнёры', exact: true }).click();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.locator('[data-stp-manager="ui.new.manager"]').getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(page.locator('[data-stp-manager="ui.new.manager"]')).toHaveCount(0);
});

test('демо: «Менеджер StP» в группе StP, у него два раздела', async ({ page }) => {
  await page.goto('/?demo=1');
  await page
    .getByRole('region', { name: 'StP', exact: true })
    .getByRole('button', { name: /Менеджер StP/ })
    .click();
  await expect(nav(page)).toBeVisible();
  await expectTwoSections(page);
});

test('телефон: у менеджера StP те же два раздела и «Профиль»', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  const tabs = nav(page).getByRole('tab');
  await expect(tabs.filter({ hasText: 'Обучение' })).toHaveCount(1);
  await expect(tabs.filter({ hasText: 'Инструменты' })).toHaveCount(1);
  await expect(tabs.filter({ hasText: /Проекты|Компания|Сегодня/ })).toHaveCount(0);
});
