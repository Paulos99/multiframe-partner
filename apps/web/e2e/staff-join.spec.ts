import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const API = 'http://127.0.0.1:4181';
const fixturePassword = 'ui-fixture-password-only';
const staffPassword = 'Staff-Join-2026';
const nav = (page: Page) => page.getByRole('complementary', { name: 'Разделы кабинета' });
const OUT = process.env.STAFF_JOIN_SHOT_DIR || '/workspace/mfp-shots';
const shoot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: (page.viewportSize()?.width ?? 1440) >= 720 });

test.beforeEach(async ({ request }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await request.post(`${API}/__reset`);
});

async function enter(page: Page, login: string, pass = fixturePassword) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(login);
  await page.getByLabel('Пароль', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
}

test('сотрудник отправляет заявку, до одобрения кабинет закрыт, владелец подтверждает', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Регистрация', exact: true })).toBeVisible();
  await shoot(page, 'register-role');

  await page.getByRole('button', { name: 'Владелец', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Регистрация компании' })).toBeVisible();
  await shoot(page, 'register-owner');

  await page.getByRole('button', { name: 'Замерщик', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Подключение к компании' })).toBeVisible();

  const company = page.getByRole('combobox');
  await company.fill('неттакойфирмыzzz');
  await expect(page.getByRole('listbox').getByText('Компания не зарегистрирована')).toBeVisible();
  await company.fill('ui test');
  await expect(page.getByRole('option', { name: 'UI test company' })).toBeVisible();
  await page.getByRole('option', { name: 'UI test company' }).click();
  await page.getByLabel('Имя', { exact: true }).fill('Павел');
  await page.getByLabel('Фамилия', { exact: true }).fill('Замеров');
  await page.getByLabel('Логин', { exact: true }).fill('pavel.measure');
  await page.getByLabel('Пароль', { exact: true }).fill(staffPassword);
  await page.getByLabel('Повторите пароль', { exact: true }).fill(staffPassword);
  await shoot(page, 'register-staff');
  await page.getByRole('button', { name: 'Отправить заявку', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Заявка на рассмотрении' })).toBeVisible();
  await expect(page.getByText('UI test company')).toBeVisible();
  await shoot(page, 'join-pending');
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();

  await enter(page, 'pavel.measure', staffPassword);
  await expect(page.getByRole('heading', { name: 'Заявка на рассмотрении' })).toBeVisible();
  await expect(nav(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();

  await enter(page, 'ui.owner');
  await expect(nav(page)).toBeVisible();
  const card = page.getByTestId('today-staff-joins');
  await expect(card).toContainText('Заявки на подключение');
  await expect(card).toContainText('Павел Замеров');
  await shoot(page, 'join-today');
  await card.getByRole('button', { name: 'Разобрать заявки', exact: true }).click();
  const box = page.getByTestId('staff-join-requests');
  await expect(box).toContainText('Павел Замеров');
  await expect(box).toContainText('Замерщик');
  await shoot(page, 'join-approve');
  await box.getByRole('button', { name: 'Одобрить', exact: true }).click();
  await expect(box).toContainText('добавлен в компанию');

  const phone = (page.viewportSize()?.width ?? 1440) < 720;
  if (phone) {
    await nav(page).getByRole('tab', { name: 'Профиль', exact: true }).click();
    await page.getByRole('region', { name: 'Профиль' }).getByRole('button', { name: 'Выйти', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  }

  await enter(page, 'pavel.measure', staffPassword);
  await expect(nav(page)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Заявка на рассмотрении' })).toHaveCount(0);
  await shoot(page, 'join-cabinet');
});
