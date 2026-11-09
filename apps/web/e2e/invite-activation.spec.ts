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

/** Активация: логин + пароль (логин сотрудник выбирает сам). */
async function activate(browser: Browser, link: string, password: string, loginName: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Активация аккаунта' })).toBeVisible();
  await expect(page.locator('input')).toHaveCount(2);
  await expect(page.getByLabel('Логин', { exact: true })).toHaveAttribute('autocomplete', 'username');
  await expect(page.getByLabel('Новый пароль')).toHaveAttribute('autocomplete', 'new-password');
  await page.getByLabel('Логин', { exact: true }).fill(loginName);
  await page.getByLabel('Новый пароль').fill(password);
  await page.getByRole('button', { name: 'Активировать' }).click();
  return { context, page };
}

test('админ создаёт менеджера StP без пароля, берёт ссылку, менеджер сам задаёт пароль', async ({ page, browser, request }) => {
  await login(page, 'ui.admin', fixturePassword);
  await nav(page).getByRole('tab', { name: 'Кабинеты', exact: true }).click();
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

  const { context, page: employee } = await activate(browser, link, newPassword, 'ui.novichok');
  await expect(employee.getByText(/Пароль задан|Активирован|Войдите/)).toBeVisible();
  expect(employee.url()).not.toContain('activate');
  await employee.getByLabel('Логин', { exact: true }).fill('ui.novichok');
  await employee.getByLabel('Пароль', { exact: true }).fill(newPassword);
  await employee.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(nav(employee)).toBeVisible();
  await context.close();

  const again = await activate(browser, link, 'Drugoi-parol-12345', 'ui.novichok');
  await expect(again.page.getByRole('alert')).toContainText('Ссылка недействительна или срок истёк');
  await again.context.close();
});

test('слабый пароль на экране активации не принимается, ссылка остаётся рабочей', async ({ page, browser }) => {
  await login(page, 'ui.owner', fixturePassword);
  await nav(page).getByRole('tab', { name: 'Компания', exact: true }).click();
  await page.getByRole('tab', { name: 'Сотрудники', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await page.getByLabel('Имя', { exact: true }).fill('Иван Петров');
  // Логин сотрудник задаёт сам по ссылке — в форме создания поля логина нет.
  await page.getByRole('button', { name: 'Создать сотрудника' }).click();
  await expect(page.getByText(/создан|Ссылка для входа|Пароля пока нет/i).first()).toBeVisible();
  await page.getByRole('button', { name: 'Ссылка для входа' }).first().click();
  const link = await readLink(page);

  const weak = await activate(browser, link, 'abc1234', 'ui.ivan');
  await expect(weak.page.getByRole('alert')).toContainText('8');
  await weak.page.getByLabel('Новый пароль').fill(newPassword);
  await weak.page.getByRole('button', { name: 'Активировать' }).click();
  await expect(weak.page.getByText(/Пароль задан|Активирован|Войдите/)).toBeVisible();
  await weak.context.close();
});

test('сброс пароля по ссылке закрывает прежние входы и старый пароль перестаёт работать', async ({ page, browser, request }) => {
  const first = await request.post(`${API}/auth/login`, { data: { login: 'ui.crew', password: fixturePassword } });
  const oldToken = (await first.json()).token as string;
  expect((await request.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${oldToken}` } })).status()).toBe(200);

  await login(page, 'ui.owner', fixturePassword);
  await nav(page).getByRole('tab', { name: 'Компания', exact: true }).click();
  await page.getByRole('tab', { name: 'Сотрудники', exact: true }).click();
  await page.getByRole('button', { name: /ui\.crew|Павел Орлов|Монтажник/ }).first().click();
  await page.getByRole('button', { name: 'Ссылка для входа' }).click();
  const link = await readLink(page);

  const done = await activate(browser, link, newPassword, 'ui.crew');
  await expect(done.page.getByText(/Пароль задан|Активирован|Войдите/)).toBeVisible();
  await done.context.close();

  expect((await request.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${oldToken}` } })).status()).toBe(401);
  expect((await request.post(`${API}/auth/login`, { data: { login: 'ui.crew', password: fixturePassword } })).status()).toBe(401);
  expect((await request.post(`${API}/auth/login`, { data: { login: 'ui.crew', password: newPassword } })).status()).toBe(200);
});
