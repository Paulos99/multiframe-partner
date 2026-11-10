import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'http://127.0.0.1:4181';
const fixturePassword = 'ui-fixture-password-only';
const ownerPassword = 'Ceiling-2026';
const nav = (page: Page) => page.getByRole('complementary', { name: 'Разделы кабинета' });
const OUT =
  process.env.REGISTRATION_SHOT_DIR ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../handover/screenshots-registration');
const shoot = (page: Page, name: string) =>
  page.screenshot({ path: `${OUT}/${name}.png`, fullPage: (page.viewportSize()?.width ?? 1440) >= 720 });

test.beforeEach(async ({ request }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await request.post(`${API}/__reset`);
});

async function enter(page: Page, login: string, pass = fixturePassword) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(login);
  await page.getByLabel('Пароль', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(nav(page)).toBeVisible();
}

async function logout(page: Page) {
  const phone = (page.viewportSize()?.width ?? 1440) < 720;
  if (phone) {
    // На телефоне выход — во вкладке «Профиль».
    await nav(page).getByRole('tab', { name: 'Профиль', exact: true }).click();
    await page.getByRole('region', { name: 'Профиль' }).getByRole('button', { name: 'Выйти', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  }
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();
}

async function fillForm(page: Page, login: string, suffix = '') {
  await page.getByLabel('Имя', { exact: true }).fill('Ирина');
  await page.getByLabel('Фамилия', { exact: true }).fill('Соколова');
  await page.getByLabel('Название компании', { exact: true }).fill(`Потолки Юга${suffix}`);
  const city = page.getByRole('combobox');
  await city.fill('Казань');
  await page.getByRole('option').first().click();
  await page.getByLabel('Логин', { exact: true }).fill(login);
  await page.getByLabel('Пароль', { exact: true }).fill(ownerPassword);
  await page.getByLabel('Повторите пароль', { exact: true }).fill(ownerPassword);
}

async function register(page: Page, login: string, shots: { prefix: string } | null = null) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click();
  await expect(page).toHaveURL(/#\/register$/);
  await expect(page.getByRole('heading', { name: 'Регистрация компании' })).toBeVisible();
  if (shots) await shoot(page, `${shots.prefix}-1-form`);
  // Занятый логин — понятная ошибка, форма остаётся заполненной.
  await fillForm(page, 'ui.owner');
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Такой логин уже занят');
  if (shots) await shoot(page, `${shots.prefix}-2-login-taken`);
  await page.getByLabel('Логин', { exact: true }).fill(login);
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click();
  await expect(nav(page)).toBeVisible();
  await expect(page).not.toHaveURL(/register/);
}

test('владелец регистрируется сам, сразу работает и добавляет менеджера с «Сегодня»', async ({ page }) => {
  await register(page, 'irina.yug', { prefix: 'desktop' });
  const note = page.getByTestId('registration-pending');
  await expect(note).toContainText('Регистрация на проверке у StP');
  const card = page.getByTestId('today-add-manager');
  await expect(card).toContainText('Добавьте менеджера');
  await shoot(page, 'desktop-3-owner-today');

  await card.getByRole('button', { name: 'Добавить менеджера', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Сотрудники' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('combobox', { name: /^Роль/ })).toHaveValue('sales');
  await page.getByLabel('Имя', { exact: true }).fill('Пётр Менеджеров');
  await page.getByRole('button', { name: 'Создать сотрудника', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Пётр Менеджеров');

  await nav(page).getByRole('tab', { name: 'Сегодня', exact: true }).click();
  await expect(page.getByLabel('Сегодня')).toBeVisible();
  await expect(page.getByTestId('today-add-manager')).toHaveCount(0);
  // Плашка видна и на других вкладках, но работе не мешает.
  await expect(page.getByTestId('registration-pending')).toBeVisible();
});

test('менеджер компании добавляет замерщиков и монтажников', async ({ page }) => {
  await enter(page, 'ui.sales');
  await nav(page).getByRole('tab', { name: 'Компания', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Сотрудники' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  for (const [name, role] of [
    ['Замерщик Новый', 'measurer'],
    ['Монтажник Новый', 'crew'],
    ['Менеджер Второй', 'sales'],
  ] as const) {
    await page.getByLabel('Имя', { exact: true }).fill(name);
    await page.getByRole('combobox', { name: /^Роль/ }).selectOption(role);
    await page.getByRole('button', { name: 'Создать сотрудника', exact: true }).click();
    await expect(page.getByRole('status')).toContainText(name);
  }
});

test('админ StP видит заявку, отклоняет с причиной и подтверждает позже', async ({ page }) => {
  await register(page, 'irina.yug');
  await logout(page);

  await enter(page, 'ui.admin');
  await expect(nav(page).getByRole('tab', { name: 'Кабинеты · 1', exact: true })).toBeVisible();
  const todayCard = page.getByTestId('today-requests');
  await expect(todayCard).toContainText('Новые заявки на регистрацию: 1');
  await expect(todayCard).toContainText('Потолки Юга');
  await todayCard.getByRole('button', { name: 'Разобрать заявки', exact: true }).click();

  const block = page.locator('[data-section="registrations"]');
  const item = block.locator('[data-registration="irina.yug"]');
  await expect(item).toContainText('Потолки Юга');
  await expect(item).toContainText('Ирина Соколова');
  await expect(item).toContainText('Казань');
  await expect(item).toContainText('логин irina.yug');
  await expect(item).toContainText('Заявка от');
  await shoot(page, 'desktop-4-admin-requests');

  await item.getByRole('button', { name: 'Отклонить', exact: true }).click();
  await item.getByLabel('Причина (необязательно)').fill('Компания не работает с MultiFrame');
  await shoot(page, 'desktop-5-admin-reject-confirm');
  await item.getByRole('button', { name: 'Отклонить заявку', exact: true }).click();
  await expect(block.getByRole('status')).toContainText('отклонена');
  await expect(nav(page).getByRole('tab', { name: 'Кабинеты', exact: true })).toBeVisible();
  await logout(page);

  // Отклонённый владелец: вход закрыт с причиной.
  await page.getByLabel('Логин', { exact: true }).fill('irina.yug');
  await page.getByLabel('Пароль', { exact: true }).fill(ownerPassword);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Регистрация отклонена StP. Причина: Компания не работает с MultiFrame');
  await shoot(page, 'desktop-6-rejected-login');

  // Админ передумал: подтверждает отклонённую заявку.
  await enter(page, 'ui.admin');
  await nav(page).getByRole('tab', { name: 'Кабинеты', exact: true }).click();
  await block.getByRole('button', { name: 'Отклонённые: 1' }).click();
  await block.locator('[data-registration="irina.yug"]').getByRole('button', { name: 'Подтвердить', exact: true }).click();
  await expect(block.getByRole('status')).toContainText('подтверждён');
  await logout(page);
  await enter(page, 'irina.yug', ownerPassword);
  await expect(page.getByTestId('registration-pending')).toHaveCount(0);
});

test('телефон: форма, занятый логин, плашка, заявки и отказ', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await register(page, 'irina.phone', { prefix: 'phone' });
  await expect(page.getByTestId('registration-pending')).toBeVisible();
  await expect(page.getByTestId('today-add-manager')).toBeVisible();
  await shoot(page, 'phone-3-owner-today');
  await logout(page);

  await enter(page, 'ui.admin');
  await page.getByTestId('today-requests').getByRole('button', { name: 'Разобрать заявки', exact: true }).click();
  const item = page.locator('[data-registration="irina.phone"]');
  await expect(item).toBeVisible();
  await shoot(page, 'phone-4-admin-requests');
  await item.getByRole('button', { name: 'Отклонить', exact: true }).click();
  await item.getByRole('button', { name: 'Отклонить заявку', exact: true }).click();
  await expect(page.locator('[data-section="registrations"]').getByRole('status')).toContainText('отклонена');
  await logout(page);

  await page.getByLabel('Логин', { exact: true }).fill('irina.phone');
  await page.getByLabel('Пароль', { exact: true }).fill(ownerPassword);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Регистрация отклонена StP');
  await shoot(page, 'phone-6-rejected-login');
});
