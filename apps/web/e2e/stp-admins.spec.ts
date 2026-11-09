import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'http://127.0.0.1:4181';
const password = 'ui-fixture-password-only';
const nav = (page: Page) => page.getByRole('complementary', { name: 'Разделы кабинета' });
const OUT =
  process.env.STP_ADMINS_SHOT_DIR ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../handover/screenshots-stp-admins');

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/__reset`);
});

async function enter(page: Page, login = 'ui.admin', pass = password) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(login);
  await page.getByLabel('Пароль', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(nav(page)).toBeVisible();
}

test('администраторы StP внутри «Кабинеты»: список, форма, создание и защиты', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await enter(page);
  // Не отдельный пункт верхнего меню.
  await expect(nav(page).getByRole('tab', { name: 'Администраторы StP' })).toHaveCount(0);
  await nav(page).getByRole('tab', { name: 'Кабинеты', exact: true }).click();

  const block = page.locator('[data-section="stp-admins"]');
  await expect(block.getByRole('heading', { name: 'Администраторы StP' })).toBeVisible();
  await expect(block.locator('[data-stp-admin="ui.admin"]')).toContainText('это вы');
  await page.screenshot({ path: `${OUT}/list-desktop.png`, fullPage: true });

  await block.getByRole('button', { name: 'Добавить администратора', exact: true }).click();
  await expect(block.getByRole('heading', { name: 'Новый администратор' })).toBeVisible();
  await page.screenshot({ path: `${OUT}/form-desktop.png`, fullPage: true });

  await block.getByLabel('Логин', { exact: true }).fill('ui.new.admin');
  await block.getByLabel('Временный пароль', { exact: true }).fill('new-admin-password');
  await block.getByLabel('Имя', { exact: true }).fill('Анна Админова');
  await block.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(block.getByRole('status')).toContainText('ui.new.admin');
  await expect(block.locator('[data-stp-admin="ui.new.admin"]')).toContainText('Анна Админова');

  // Себя удалить нельзя: кнопка неактивна.
  await expect(block.locator('[data-stp-admin="ui.admin"]').getByRole('button', { name: 'Удалить', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await enter(page, 'ui.new.admin', 'new-admin-password');
  await nav(page).getByRole('tab', { name: 'Кабинеты', exact: true }).click();
  await expect(page.locator('[data-section="stp-admins"]')).toBeVisible();

  // Телефон: список и форма 390px.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${OUT}/list-390.png`, fullPage: true });
  const mobileBlock = page.locator('[data-section="stp-admins"]');
  await mobileBlock.getByRole('button', { name: 'Добавить администратора', exact: true }).click();
  await expect(mobileBlock.getByRole('heading', { name: 'Новый администратор' })).toBeVisible();
  await page.screenshot({ path: `${OUT}/form-390.png`, fullPage: true });
});
