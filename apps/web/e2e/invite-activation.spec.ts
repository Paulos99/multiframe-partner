import { test, expect, type Browser, type Page } from '@playwright/test';

const API = 'http://127.0.0.1:4181';
const fixturePassword = 'ui-fixture-password-only';
const newPassword = 'Svoi-novyi-parol-77';
const nav = (page: Page) => page.getByRole('complementary', { name: 'Разделы кабинета' });

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/__reset`);
});

async function login(page: Page, name: string, pass: string) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(name);
  await page.getByLabel('Пароль', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(nav(page)).toBeVisible();
}

/** Читает ссылку из окна «Ссылка активации» и закрывает окно. */
async function readLink(page: Page): Promise<string> {
  const dialog = page.getByRole('dialog', { name: 'Ссылка активации' });
  await expect(dialog).toBeVisible();
  const field = dialog.getByRole('textbox', { name: 'Ссылка активации' });
  await expect(field).toHaveAttribute('readonly', '');
  const link = await field.inputValue();
  await dialog.getByRole('button', { name: 'Закрыть' }).click();
  await expect(dialog).toHaveCount(0);
  return link;
}

async function activate(browser: Browser, link: string, password: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Активация аккаунта' })).toBeVisible();
  // Без логина и без поля подтверждения: только новый пароль.
  await expect(page.locator('input')).toHaveCount(1);
  await expect(page.getByLabel('Новый пароль')).toHaveAttribute('autocomplete', 'new-password');
  await page.getByLabel('Новый пароль').fill(password);
  await page.getByRole('button', { name: 'Задать пароль' }).click();
  return { context, page };
}

test('админ создаёт менеджера StP без пароля, берёт ссылку, менеджер сам задаёт пароль', async ({ page, browser, request }) => {
  await login(page, 'ui.admin', fixturePassword);
  await nav(page).getByRole('tab', { name: 'Партнёры', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить менеджера' }).click();
  await page.getByLabel('Логин', { exact: true }).fill('ui.novichok');
  await page.getByLabel('Имя').fill('Новичок');
  await page.getByRole('button', { name: 'Создать', exact: true }).click();
  const row = page.locator('[data-stp-manager="ui.novichok"]');
  await expect(row).toContainText('ждёт активации');

  // До активации войти нельзя ни с каким паролем.
  const early = await request.post(`${API}/auth/login`, { data: { login: 'ui.novichok', password: newPassword } });
  expect(early.status()).toBe(401);

  await row.getByRole('button', { name: 'Ссылка для входа' }).click();
  const link = await readLink(page);
  expect(link).toMatch(/^http:\/\/127\.0\.0\.1:4180\/\?activate=[0-9a-f]{64}$/);

  const { context, page: employee } = await activate(browser, link, newPassword);
  await expect(employee.getByText('Пароль задан. Войдите в аккаунт.')).toBeVisible();
  // Токен ушёл из адреса, дальше обычный вход.
  expect(employee.url()).not.toContain('activate');
  await employee.getByLabel('Логин', { exact: true }).fill('ui.novichok');
  await employee.getByLabel('Пароль', { exact: true }).fill(newPassword);
  await employee.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(nav(employee)).toBeVisible();
  await context.close();

  // Вторая попытка по той же ссылке отклоняется.
  const again = await activate(browser, link, 'Drugoi-parol-12345');
  await expect(again.page.getByRole('alert')).toContainText('Ссылка недействительна или срок истёк');
  await again.context.close();
});

test('слабый пароль на экране активации не принимается, ссылка остаётся рабочей', async ({ page, browser }) => {
  await login(page, 'ui.owner', fixturePassword);
  await nav(page).getByRole('tab', { name: 'Компания', exact: true }).click();
  await page.getByRole('tab', { name: 'Сотрудники', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await page.getByLabel('Имя', { exact: true }).fill('Иван Петров');
  await page.getByLabel('Логин', { exact: true }).fill('ui.ivan');
  await page.getByRole('button', { name: 'Создать сотрудника' }).click();
  // Пароля никто не видел и не задавал: сотрудник ждёт активации.
  await expect(page.getByText("Пароля пока нет")).toBeVisible();
  await page.getByRole('button', { name: 'Ссылка для входа' }).click();
  const link = await readLink(page);

  const weak = await activate(browser, link, 'korotkiy');
  await expect(weak.page.getByRole('alert')).toContainText('10');
  await weak.page.getByLabel('Новый пароль').fill(newPassword);
  await weak.page.getByRole('button', { name: 'Задать пароль' }).click();
  await expect(weak.page.getByText('Пароль задан. Войдите в аккаунт.')).toBeVisible();
  await weak.context.close();
});

test('сброс пароля по ссылке закрывает прежние входы и старый пароль перестаёт работать', async ({ page, browser, request }) => {
  const first = await request.post(`${API}/auth/login`, { data: { login: 'ui.crew', password: fixturePassword } });
  const oldToken = (await first.json()).token as string;
  expect((await request.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${oldToken}` } })).status()).toBe(200);

  await login(page, 'ui.owner', fixturePassword);
  await nav(page).getByRole('tab', { name: 'Компания', exact: true }).click();
  await page.getByRole('tab', { name: 'Сотрудники', exact: true }).click();
  await page.getByRole('button', { name: /ui\.crew/ }).click();
  await page.getByRole('button', { name: 'Ссылка для входа' }).click();
  const link = await readLink(page);

  const done = await activate(browser, link, newPassword);
  await expect(done.page.getByText('Пароль задан. Войдите в аккаунт.')).toBeVisible();
  await done.context.close();

  expect((await request.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${oldToken}` } })).status()).toBe(401);
  expect((await request.post(`${API}/auth/login`, { data: { login: 'ui.crew', password: fixturePassword } })).status()).toBe(401);
  expect((await request.post(`${API}/auth/login`, { data: { login: 'ui.crew', password: newPassword } })).status()).toBe(200);
});
