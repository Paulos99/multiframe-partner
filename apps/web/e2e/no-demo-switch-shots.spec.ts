import { expect, test } from '@playwright/test';
import { demoSignIn } from './demo-login';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT =
  process.env.NO_DEMO_SHOT_DIR ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../handover/screenshots-no-demo-switch');

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset').catch(() => undefined);
});

test('экран входа без сетки ролей и без кнопки Демо в кабинете', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/?demo=1');
  await expect(page.getByRole('heading', { name: 'Кабинет партнёра' })).toBeVisible();
  await expect(page.getByLabel('Логин', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Пароль', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'StP' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Потолки Столицы' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Войти по логину' })).toHaveCount(0);
  await expect(page.getByText('Выберите роль')).toHaveCount(0);
  await page.screenshot({ path: `${OUT}/login-demo1.png`, fullPage: true });

  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.owner');
  await page.getByLabel('Пароль', { exact: true }).fill('ui-fixture-password-only');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Демо', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Сменить роль', exact: true })).toHaveCount(0);
  await page.screenshot({ path: `${OUT}/cabinet-owner-no-demo-fab.png`, fullPage: true });
});

test('демо-вход по логину открывает кабинет владельца', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await demoSignIn(page, 'owner');
  await expect(page.getByRole('button', { name: 'Демо', exact: true })).toHaveCount(0);
  await page.screenshot({ path: `${OUT}/cabinet-demo-owner.png`, fullPage: true });
});
